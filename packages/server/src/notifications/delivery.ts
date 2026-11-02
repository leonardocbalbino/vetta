import { toAppUrl } from '@vetta/contracts';
import type { PrismaClient } from '@vetta/db';
import { renderNotificationEmail } from '@vetta/emails';
import type { Redis } from 'ioredis';
import { maskRecipient } from '../crypto';
import type { EmailProvider } from '../email/email';
import {
  NotConfiguredError,
  type SmsProvider,
  type WhatsAppProvider,
} from '../messaging/messaging';
import type { PushProvider } from '../push/push';
import { groupCounterKey, type DeliveryJobData } from './dispatcher';

export interface DeliveryDeps {
  db: PrismaClient;
  redis: Redis;
  email: EmailProvider;
  push: PushProvider;
  whatsapp: WhatsAppProvider;
  sms: SmsProvider;
  webUrl: string;
  adminUrl?: string;
}

const pushTicketKey = (ticketId: string) => `push:ticket:${ticketId}`;

/**
 * Entrega uma notificação num canal externo. Lança erro para o BullMQ refazer
 * com backoff exponencial; na última tentativa marca FAILED.
 */
export async function deliver(
  deps: DeliveryDeps,
  job: DeliveryJobData,
  attempt: { attemptsMade: number; maxAttempts: number },
): Promise<void> {
  const { db } = deps;
  const log = await db.deliveryLog.findUnique({ where: { id: job.deliveryLogId } });
  if (!log || log.status !== 'QUEUED') return;
  const user = await db.user.findUnique({
    where: { id: log.userId },
    include: { devices: { where: { disabledAt: null } } },
  });
  if (!user && job.channel === 'EMAIL') {
    // Destinatário da equipe da plataforma (ex.: novo personal cadastrado).
    const admin = await db.adminUser.findUnique({ where: { id: log.userId } });
    if (admin) {
      const { html, text } = await renderNotificationEmail({
        title: job.title,
        body: job.body,
        ctaLabel: job.ctaLabel,
        ctaUrl: new URL(job.deepLink, deps.adminUrl ?? deps.webUrl).toString(),
      });
      const r = await deps.email.send({
        to: admin.email,
        subject: job.subject ?? job.title,
        html,
        text,
      });
      await db.deliveryLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: { increment: 1 },
          provider: deps.email.name,
          providerMessageId: r.id,
          recipient: maskRecipient(admin.email),
        },
      });
      return;
    }
  }
  if (!user || user.deletedAt) {
    await db.deliveryLog.update({
      where: { id: log.id },
      data: { status: 'SKIPPED', error: 'user_gone' },
    });
    return;
  }

  let body = job.body;
  if (job.groupKey) {
    const count = Number((await deps.redis.get(groupCounterKey(job.groupKey))) ?? 1);
    if (count > 1) body = `${body} (+${count - 1})`;
  }

  try {
    let provider: string;
    let providerMessageId: string | null = null;
    let recipient: string | null = null;

    switch (job.channel) {
      case 'EMAIL': {
        const tenant = log.tenantId
          ? await db.tenant.findUnique({ where: { id: log.tenantId }, include: { brand: true } })
          : null;
        const { html, text } = await renderNotificationEmail({
          title: job.title,
          body,
          ctaLabel: job.ctaLabel,
          ctaUrl: new URL(job.deepLink, deps.webUrl).toString(),
          ...(tenant?.brand?.emailFromName || tenant?.brand?.primaryColor
            ? {
                brand: {
                  name: tenant.brand.emailFromName ?? tenant.name,
                  primaryColor: tenant.brand.primaryColor,
                },
              }
            : {}),
        });
        const r = await deps.email.send({
          to: user.email,
          subject: job.subject ?? job.title,
          html,
          text,
          tags: { event: log.event },
        });
        provider = deps.email.name;
        providerMessageId = r.id;
        recipient = maskRecipient(user.email);
        break;
      }
      case 'PUSH': {
        const devices = user.devices.filter((d) => deps.push.isValidToken(d.pushToken));
        if (!devices.length) {
          await db.deliveryLog.update({
            where: { id: log.id },
            data: { status: 'SKIPPED', error: 'no_devices' },
          });
          return;
        }
        const tickets = await deps.push.send(
          devices.map((d) => ({
            token: d.pushToken,
            title: job.title,
            body,
            url: toAppUrl(job.deepLink),
          })),
        );
        const ids: string[] = [];
        for (const [i, t] of tickets.entries()) {
          const device = devices[i]!;
          if (t.ok) {
            ids.push(t.ticketId);
            await deps.redis.set(pushTicketKey(t.ticketId), device.id, 'EX', 2 * 86_400);
          } else if (t.invalidToken) {
            await db.device.delete({ where: { id: device.id } }).catch(() => undefined);
          }
        }
        if (!ids.length) throw new Error('Nenhum dispositivo aceitou o push');
        provider = deps.push.name;
        providerMessageId = ids.join(',');
        recipient = `${ids.length} dispositivo(s)`;
        break;
      }
      case 'WHATSAPP': {
        if (!user.phone) throw new NotConfiguredError('WhatsApp (telefone ausente)');
        if (!job.whatsapp) throw new NotConfiguredError('WhatsApp (sem template aprovado)');
        const r = await deps.whatsapp.sendTemplate({
          to: user.phone,
          template: job.whatsapp.template,
          locale: user.locale,
          variables: job.whatsapp.variables,
        });
        provider = deps.whatsapp.name;
        providerMessageId = r.id;
        recipient = maskRecipient(user.phone);
        break;
      }
      case 'SMS': {
        if (!user.phone) throw new NotConfiguredError('SMS (telefone ausente)');
        const r = await deps.sms.send({ to: user.phone, body: `${job.title}: ${body}` });
        provider = deps.sms.name;
        providerMessageId = r.id;
        recipient = maskRecipient(user.phone);
        break;
      }
      default:
        return;
    }
    await db.deliveryLog.update({
      where: { id: log.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        attempts: { increment: 1 },
        provider,
        providerMessageId,
        recipient,
        error: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const final =
      err instanceof NotConfiguredError || attempt.attemptsMade + 1 >= attempt.maxAttempts;
    await db.deliveryLog.update({
      where: { id: log.id },
      data: {
        attempts: { increment: 1 },
        error: message.slice(0, 1000),
        ...(final ? { status: 'FAILED', failedAt: new Date() } : {}),
      },
    });
    if (!final) throw err;
  }
}

/** Confere os recibos do Expo (15 min depois) e remove tokens inválidos. */
export async function checkPushReceipts(
  deps: Pick<DeliveryDeps, 'db' | 'redis' | 'push'>,
  now = new Date(),
) {
  const logs = await deps.db.deliveryLog.findMany({
    where: {
      channel: 'PUSH',
      status: 'SENT',
      providerMessageId: { not: null },
      sentAt: {
        lt: new Date(now.getTime() - 15 * 60_000),
        gt: new Date(now.getTime() - 24 * 3_600_000),
      },
    },
    take: 1000,
  });
  if (!logs.length) return 0;
  const ids = logs.flatMap((l) => l.providerMessageId!.split(','));
  const receipts = await deps.push.getReceipts(ids);
  for (const l of logs) {
    const tickets = l.providerMessageId!.split(',');
    let delivered = false;
    const errors: string[] = [];
    for (const t of tickets) {
      const r = receipts[t];
      if (!r) continue;
      if (r.ok) delivered = true;
      else {
        errors.push(r.error);
        if (r.invalidToken) {
          const deviceId = await deps.redis.get(pushTicketKey(t));
          if (deviceId)
            await deps.db.device.delete({ where: { id: deviceId } }).catch(() => undefined);
        }
      }
    }
    if (delivered) {
      await deps.db.deliveryLog.update({
        where: { id: l.id },
        data: { status: 'DELIVERED', deliveredAt: now },
      });
    } else if (errors.length) {
      await deps.db.deliveryLog.update({
        where: { id: l.id },
        data: { status: 'FAILED', failedAt: now, error: errors.join('; ').slice(0, 1000) },
      });
    }
  }
  return logs.length;
}
