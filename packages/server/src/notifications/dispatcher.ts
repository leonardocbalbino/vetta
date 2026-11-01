import type { DomainEvent, NotificationChannel, NotificationDto } from '@vetta/contracts';
import type { PrismaClient } from '@vetta/db';
import type { Redis } from 'ioredis';
import { resolveEntitlements } from '../entitlements';
import { decideDelivery, type RecipientContext } from './engine';
import { NOTIFICATION_RULES, type NotificationRule } from './rules';
import { localeFallbacks, renderTemplate } from './template';

export interface DeliveryJobData {
  deliveryLogId: string;
  channel: NotificationChannel;
  subject: string | null;
  title: string;
  body: string;
  ctaLabel: string | null;
  deepLink: string;
  groupKey: string | null;
}

export interface DispatcherDeps {
  db: PrismaClient;
  redis: Redis;
  scheduleDelivery: (job: DeliveryJobData, delayMs: number) => Promise<void>;
  emitInApp: (userId: string, notification: NotificationDto) => Promise<void> | void;
  now?: () => Date;
}

export interface DispatchOutcome {
  userId: string;
  channel: NotificationChannel;
  status: 'sent' | 'queued' | 'skipped';
  reason?: string;
  scheduledFor?: Date;
}

export const groupCounterKey = (groupKey: string) => `ngrp:${groupKey}`;

export async function resolveRecipients(
  db: PrismaClient,
  rule: NotificationRule,
  e: DomainEvent,
): Promise<string[]> {
  const p = e.payload;
  switch (rule.recipients) {
    case 'user':
      return typeof p.userId === 'string' ? [p.userId] : [];
    case 'users':
      return Array.isArray(p.userIds)
        ? p.userIds.filter((x): x is string => typeof x === 'string')
        : [];
    case 'tenant_owner': {
      if (!e.tenantId) return [];
      const t = await db.tenant.findUnique({
        where: { id: e.tenantId },
        select: { ownerUserId: true },
      });
      return t ? [t.ownerUserId] : [];
    }
    case 'tenant_staff': {
      if (!e.tenantId) return [];
      const t = await db.tenant.findUnique({
        where: { id: e.tenantId },
        select: { ownerUserId: true },
      });
      const ids = t ? [t.ownerUserId] : [];
      if (typeof p.studentLinkId === 'string') {
        const link = await db.studentLink.findUnique({
          where: { id: p.studentLinkId },
          select: { assistant: { select: { userId: true } } },
        });
        if (link?.assistant) ids.push(link.assistant.userId);
      }
      return [...new Set(ids)];
    }
    case 'platform_admins':
      return [];
    case 'student_and_staff': {
      const [a, b] = await Promise.all([
        resolveRecipients(db, { ...rule, recipients: 'student' }, e),
        resolveRecipients(db, { ...rule, recipients: 'tenant_staff' }, e),
      ]);
      return [...new Set([...a, ...b])];
    }
    case 'student': {
      if (typeof p.studentLinkId !== 'string') return [];
      const link = await db.studentLink.findUnique({
        where: { id: p.studentLinkId },
        select: { userId: true },
      });
      return link?.userId ? [link.userId] : [];
    }
  }
}

/** Template ativo de maior versão: white label do tenant primeiro, depois o global; idioma com fallback. */
export async function findTemplate(
  db: PrismaClient,
  event: string,
  channel: NotificationChannel,
  locale: string,
  tenantId: string | null,
) {
  for (const loc of localeFallbacks(locale)) {
    for (const tid of tenantId ? [tenantId, null] : [null]) {
      const t = await db.notificationTemplate.findFirst({
        where: { event, channel, locale: loc, tenantId: tid, isActive: true },
        orderBy: { version: 'desc' },
      });
      if (t) return t;
    }
  }
  return null;
}

export function toNotificationDto(n: {
  id: string;
  event: string;
  category: string;
  title: string;
  body: string;
  deepLink: string | null;
  tenantId: string | null;
  readAt: Date | null;
  createdAt: Date;
  groupCount: number;
}): NotificationDto {
  return {
    id: n.id,
    event: n.event,
    category: n.category as NotificationDto['category'],
    title: n.title,
    body: n.body,
    deepLink: n.deepLink,
    tenantId: n.tenantId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    groupCount: n.groupCount,
  };
}

/**
 * NotificationService: decide destinatários, canais e horário de cada evento,
 * grava in-app/delivery_logs e agenda as entregas externas.
 */
export async function dispatchEvent(
  deps: DispatcherDeps,
  event: DomainEvent,
): Promise<DispatchOutcome[]> {
  const rule = NOTIFICATION_RULES[event.name];
  if (!rule) return [];
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const outcomes: DispatchOutcome[] = [];

  if (rule.recipients === 'platform_admins') return dispatchToAdmins(deps, rule, event, now);
  const recipients = await resolveRecipients(db, rule, event);
  if (!recipients.length) return [];
  const tenant = event.tenantId
    ? await db.tenant.findUnique({
        where: { id: event.tenantId },
        select: { id: true, name: true },
      })
    : null;
  const whatsapp = tenant
    ? (await resolveEntitlements(db, tenant.id, now)).features['comms.whatsapp'] === true
    : false;
  const deepLink = rule.deepLink(event);

  for (const userId of recipients) {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        notificationPreferences: true,
        _count: { select: { devices: { where: { disabledAt: null } } } },
      },
    });
    if (!user || user.deletedAt) continue;

    const ctx: RecipientContext = {
      timezone: user.timezone,
      quietHours: {
        enabled: user.quietHoursEnabled,
        start: user.quietHoursStart,
        end: user.quietHoursEnd,
      },
      preferences: new Map(
        user.notificationPreferences.map((p) => [`${p.category}:${p.channel}`, p.enabled]),
      ),
      hasEmail: !!user.email,
      hasPhone: !!user.phone,
      pushDevices: user._count.devices,
    };
    const vars = { ...event.payload, name: user.name, tenantName: tenant?.name ?? 'Vetta' };

    let groupKey: string | null = null;
    let grouped = false;
    if (rule.group) {
      groupKey = `${rule.group.key(event)}:${userId}`;
      const count = await deps.redis.incr(groupCounterKey(groupKey));
      if (count === 1) await deps.redis.expire(groupCounterKey(groupKey), rule.group.windowSeconds);
      grouped = count > 1;
    }

    // Comunicados escolhem os canais (subconjunto dos canais da regra).
    const wanted = Array.isArray(event.payload.channels)
      ? (event.payload.channels as string[])
      : null;
    for (const channel of rule.channels.filter((c) => !wanted || wanted.includes(c))) {
      const base = {
        eventId: event.id,
        event: event.name,
        userId,
        tenantId: event.tenantId,
        channel,
      };
      const skip = async (reason: string) => {
        await db.deliveryLog.upsert({
          where: { eventId_userId_channel: { eventId: event.id, userId, channel } },
          create: { ...base, status: 'SKIPPED', error: reason },
          update: {},
        });
        outcomes.push({ userId, channel, status: 'skipped', reason });
      };

      const decision = decideDelivery({
        category: rule.category,
        channel,
        immediate: rule.immediate ?? false,
        delaySeconds: rule.delaySeconds ?? 0,
        now,
        recipient: ctx,
        tenantFeatures: { whatsapp },
      });
      if (!decision.send) {
        await skip(decision.reason);
        continue;
      }
      const tpl = await findTemplate(db, event.name, channel, user.locale, event.tenantId);
      if (!tpl) {
        await skip('no_template');
        continue;
      }
      const title = renderTemplate(tpl.title, vars);
      const body = renderTemplate(tpl.body, vars);

      if (channel === 'IN_APP') {
        let n;
        if (grouped && groupKey) {
          const existing = await db.notification.findFirst({
            where: { userId, groupKey, readAt: null },
            orderBy: { createdAt: 'desc' },
          });
          n = existing
            ? await db.notification.update({
                where: { id: existing.id },
                data: { body, groupCount: { increment: 1 } },
              })
            : null;
        }
        n ??= await db.notification.upsert({
          where: { userId_eventId: { userId, eventId: event.id } },
          create: {
            userId,
            tenantId: event.tenantId,
            eventId: event.id,
            event: event.name,
            category: rule.category,
            title,
            body,
            deepLink,
            data: event.payload as object,
            groupKey,
          },
          update: {},
        });
        await db.deliveryLog.upsert({
          where: { eventId_userId_channel: { eventId: event.id, userId, channel } },
          create: {
            ...base,
            notificationId: n.id,
            status: 'SENT',
            sentAt: now,
            templateVersion: tpl.version,
            provider: 'in-app',
          },
          update: {},
        });
        await deps.emitInApp(userId, toNotificationDto(n));
        outcomes.push({ userId, channel, status: 'sent' });
        continue;
      }

      if (grouped) {
        await skip('grouped');
        continue;
      }
      const log = await db.deliveryLog.upsert({
        where: { eventId_userId_channel: { eventId: event.id, userId, channel } },
        create: {
          ...base,
          status: 'QUEUED',
          scheduledFor: decision.at,
          templateVersion: tpl.version,
        },
        update: {},
      });
      if (log.status !== 'QUEUED') continue;
      const delayMs = Math.max(0, decision.at.getTime() - now.getTime());
      await deps.scheduleDelivery(
        {
          deliveryLogId: log.id,
          channel,
          subject: tpl.subject ? renderTemplate(tpl.subject, vars) : null,
          title,
          body,
          ctaLabel: tpl.ctaLabel,
          deepLink,
          groupKey,
        },
        delayMs,
      );
      outcomes.push({ userId, channel, status: 'queued', scheduledFor: decision.at });
    }
  }
  return outcomes;
}

/** Avisos para a equipe da plataforma: só e-mail, sem preferências (admin não é User). */
async function dispatchToAdmins(
  deps: DispatcherDeps,
  rule: NotificationRule,
  event: DomainEvent,
  now: Date,
): Promise<DispatchOutcome[]> {
  const admins = await deps.db.adminUser.findMany({ where: { isActive: true, deletedAt: null } });
  const tpl = await findTemplate(deps.db, event.name, 'EMAIL', 'pt-BR', null);
  if (!tpl) return [];
  const vars = { ...event.payload };
  const out: DispatchOutcome[] = [];
  for (const admin of admins) {
    const log = await deps.db.deliveryLog.upsert({
      where: { eventId_userId_channel: { eventId: event.id, userId: admin.id, channel: 'EMAIL' } },
      create: {
        eventId: event.id,
        event: event.name,
        userId: admin.id,
        tenantId: event.tenantId,
        channel: 'EMAIL',
        status: 'QUEUED',
        scheduledFor: now,
        templateVersion: tpl.version,
      },
      update: {},
    });
    if (log.status !== 'QUEUED') continue;
    await deps.scheduleDelivery(
      {
        deliveryLogId: log.id,
        channel: 'EMAIL',
        subject: tpl.subject ? renderTemplate(tpl.subject, vars) : null,
        title: renderTemplate(tpl.title, vars),
        body: renderTemplate(tpl.body, vars),
        ctaLabel: tpl.ctaLabel,
        deepLink: rule.deepLink(event),
        groupKey: null,
      },
      0,
    );
    out.push({ userId: admin.id, channel: 'EMAIL', status: 'queued', scheduledFor: now });
  }
  return out;
}
