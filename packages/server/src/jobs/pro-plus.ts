import type { PlatformBroadcastInput } from '@vetta/contracts';
import type { Prisma, PrismaClient } from '@vetta/db';
import { ensureWatchChannel, pullChanges, type CalendarSyncDeps } from '../calendar/sync';
import type { CustomDomainProvider } from '../domains/custom-domain';
import type { EventPublisher } from '../events';

/** Jobs da Fase 3 (Pro Plus). Cada função é idempotente e pode rodar em paralelo. */

// ─── Domínio próprio ────────────────────────────────────────────────────────

export async function checkCustomDomain(
  db: PrismaClient,
  domains: CustomDomainProvider,
  publisher: EventPublisher,
  tenantId: string,
  now = new Date(),
) {
  const brand = await db.tenantBrand.findUnique({ where: { tenantId } });
  if (!brand?.customDomain || !brand.customDomainProviderId) return null;
  if (brand.customDomainStatus === 'ACTIVE') return brand;
  let state;
  try {
    state = await domains.get(brand.customDomainProviderId);
  } catch (e) {
    return db.tenantBrand.update({
      where: { id: brand.id },
      data: {
        customDomainCheckedAt: now,
        customDomainError: e instanceof Error ? e.message.slice(0, 300) : 'erro',
      },
    });
  }
  const status =
    state.status === 'active' ? 'ACTIVE' : state.status === 'failed' ? 'FAILED' : 'VERIFYING';
  // Desiste após 7 dias pendente.
  const expired =
    status === 'VERIFYING' &&
    brand.updatedAt.getTime() < now.getTime() - 7 * 86_400_000 &&
    !!brand.customDomainCheckedAt;
  const final = expired ? 'FAILED' : status;
  const updated = await db.tenantBrand.update({
    where: { id: brand.id },
    data: {
      customDomainStatus: final,
      customDomainCheckedAt: now,
      customDomainError:
        state.errors.join('; ').slice(0, 500) || (expired ? 'Tempo esgotado.' : null),
      ...(final === 'ACTIVE' ? { customDomainVerifiedAt: now } : {}),
    },
  });
  if (final !== brand.customDomainStatus && (final === 'ACTIVE' || final === 'FAILED')) {
    await publisher.publish(final === 'ACTIVE' ? 'custom_domain.active' : 'custom_domain.failed', {
      tenantId,
      payload: { domain: brand.customDomain, error: updated.customDomainError ?? '' },
    });
  }
  return updated;
}

export async function verifyPendingDomains(
  db: PrismaClient,
  domains: CustomDomainProvider,
  publisher: EventPublisher,
  now = new Date(),
) {
  const pending = await db.tenantBrand.findMany({
    where: {
      customDomain: { not: null },
      customDomainStatus: { in: ['PENDING', 'VERIFYING'] },
      deletedAt: null,
    },
    select: { tenantId: true },
    take: 200,
  });
  let active = 0;
  for (const b of pending) {
    const r = await checkCustomDomain(db, domains, publisher, b.tenantId, now);
    if (r?.customDomainStatus === 'ACTIVE') active++;
  }
  return { checked: pending.length, active };
}

// ─── Suporte: SLA ───────────────────────────────────────────────────────────

/** Marca chamados que estouraram o SLA (primeira resposta ou resolução). */
export async function markSupportSlaBreaches(db: PrismaClient, now = new Date()) {
  const r = await db.supportTicket.updateMany({
    where: {
      slaBreachedAt: null,
      deletedAt: null,
      status: { in: ['OPEN', 'WAITING_USER'] },
      OR: [
        { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
        { resolvedAt: null, resolutionDueAt: { lt: now }, status: 'OPEN' },
      ],
    },
    data: { slaBreachedAt: now },
  });
  return { breached: r.count };
}

// ─── Comunicados da plataforma ──────────────────────────────────────────────

type Segment = PlatformBroadcastInput['segment'];

/** Donos de tenant que se encaixam no segmento (plano, status da assinatura, cadastro). */
export function segmentWhere(segment: Segment): Prisma.TenantWhereInput {
  const and: Prisma.TenantWhereInput[] = [{ deletedAt: null, status: 'ACTIVE' }];
  if (segment.plans.length || segment.statuses.length) {
    and.push({
      subscription: {
        is: {
          ...(segment.plans.length ? { plan: { code: { in: segment.plans } } } : {}),
          ...(segment.statuses.length ? { status: { in: segment.statuses } } : {}),
        },
      },
    });
  }
  if (segment.signupFrom)
    and.push({ createdAt: { gte: new Date(`${segment.signupFrom}T00:00:00-03:00`) } });
  if (segment.signupTo)
    and.push({
      createdAt: {
        lt: new Date(new Date(`${segment.signupTo}T00:00:00-03:00`).getTime() + 86_400_000),
      },
    });
  return { AND: and };
}

/** Envia os comunicados agendados que venceram: um evento por destinatário (idempotente). */
export async function sendDuePlatformBroadcasts(
  db: PrismaClient,
  publisher: EventPublisher,
  now = new Date(),
) {
  const due = await db.platformBroadcast.findMany({
    where: { status: 'SCHEDULED', deletedAt: null, scheduledAt: { lte: now } },
    take: 10,
  });
  let sent = 0;
  for (const b of due) {
    const claimed = await db.platformBroadcast.updateMany({
      where: { id: b.id, status: 'SCHEDULED' },
      data: { status: 'SENDING' },
    });
    if (!claimed.count) continue;
    const tenants = await db.tenant.findMany({
      where: segmentWhere(b.segment as Segment),
      select: { id: true, ownerUserId: true },
    });
    for (const t of tenants) {
      const rec = await db.platformBroadcastRecipient.upsert({
        where: { broadcastId_userId: { broadcastId: b.id, userId: t.ownerUserId } },
        create: { broadcastId: b.id, tenantId: t.id, userId: t.ownerUserId },
        update: {},
      });
      if (rec.deliveredAt) continue;
      await publisher.publish('platform.broadcast', {
        tenantId: null,
        payload: {
          userId: t.ownerUserId,
          broadcastId: b.id,
          title: b.title,
          body: b.body,
          channels: b.channels,
          deepLink: b.url ?? '',
        },
      });
      await db.platformBroadcastRecipient.update({
        where: { id: rec.id },
        data: { deliveredAt: now },
      });
    }
    await db.platformBroadcast.update({
      where: { id: b.id },
      data: { status: 'SENT', sentAt: now, recipientCount: tenants.length },
    });
    sent++;
  }
  return { sent };
}

// ─── Google Calendar ────────────────────────────────────────────────────────

/** Renova canais que vencem em menos de 1 dia e faz uma sincronização de segurança. */
export async function maintainCalendarSync(deps: CalendarSyncDeps) {
  const integrations = await deps.db.calendarIntegration.findMany({
    where: { deletedAt: null, refreshTokenEncrypted: { not: null } },
    select: { id: true },
    take: 500,
  });
  let renewed = 0;
  let synced = 0;
  let failed = 0;
  for (const i of integrations) {
    try {
      const r = await ensureWatchChannel(deps, i.id);
      if (r?.renewed) renewed++;
      await pullChanges(deps, i.id);
      synced++;
    } catch (e) {
      failed++;
      await deps.db.calendarIntegration.update({
        where: { id: i.id },
        data: { lastError: e instanceof Error ? e.message.slice(0, 300) : 'erro' },
      });
    }
  }
  return { renewed, synced, failed };
}
