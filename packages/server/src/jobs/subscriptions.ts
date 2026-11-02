import { FALLBACK_PLAN, UNLIMITED } from '@vetta/contracts';
import type { PrismaClient } from '@vetta/db';
import type { EventPublisher } from '../events';

export interface SubscriptionJobDeps {
  db: PrismaClient;
  publisher: EventPublisher;
  invalidateTenant: (tenantId: string) => Promise<void>;
}

const ACTIVE_LINK = {
  in: ['INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE'] as ('INVITED' | 'ACTIVE' | 'PAUSED' | 'OVERDUE')[],
};

/**
 * Fim do trial: cai para FREE e arquiva os alunos excedentes, começando pelos
 * que estão há mais tempo sem treinar (nunca treinou primeiro). Nada é apagado.
 */
export async function expireTrials(deps: SubscriptionJobDeps, now = new Date()): Promise<number> {
  const { db } = deps;
  const free = await db.plan.findUniqueOrThrow({
    where: { code: FALLBACK_PLAN },
    include: { features: { where: { featureKey: 'students.max' } } },
  });
  const max = free.features[0]?.value ?? 2;
  const due = await db.tenantSubscription.findMany({
    where: { status: 'TRIALING', trialEndsAt: { lte: now } },
    take: 200,
  });

  for (const sub of due) {
    const archived = await db.$transaction(async (tx) => {
      await tx.tenantSubscription.update({
        where: { id: sub.id },
        data: {
          planId: free.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: null,
        },
      });
      if (max === UNLIMITED) return 0;
      const links = await tx.studentLink.findMany({
        where: { tenantId: sub.tenantId, status: ACTIVE_LINK, deletedAt: null },
        orderBy: [{ lastWorkoutAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
        select: { id: true },
      });
      const excess = links.slice(0, Math.max(0, links.length - max)).map((l) => l.id);
      if (excess.length) {
        await tx.studentLink.updateMany({
          where: { id: { in: excess } },
          data: { status: 'ARCHIVED', archivedAt: now, archivedReason: 'downgrade_trial' },
        });
      }
      return excess.length;
    });

    await deps.invalidateTenant(sub.tenantId);
    await deps.publisher.publish('subscription.trial_expired', {
      tenantId: sub.tenantId,
      id: `trial-expired:${sub.id}`,
    });
    if (archived > 0) {
      await deps.publisher.publish('students.archived', {
        tenantId: sub.tenantId,
        payload: { count: archived, max },
        id: `students-archived:${sub.id}`,
      });
    }
  }
  return due.length;
}

/** Aviso 3 dias antes do fim do trial (uma vez). */
export async function notifyTrialEnding(
  deps: SubscriptionJobDeps,
  now = new Date(),
): Promise<number> {
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  const subs = await deps.db.tenantSubscription.findMany({
    where: { status: 'TRIALING', trialEndsAt: { gt: now, lte: soon }, trialEndingNotifiedAt: null },
    take: 500,
  });
  for (const s of subs) {
    const daysLeft = Math.max(
      1,
      Math.ceil((s.trialEndsAt!.getTime() - now.getTime()) / 86_400_000),
    );
    await deps.db.tenantSubscription.update({
      where: { id: s.id },
      data: { trialEndingNotifiedAt: now },
    });
    await deps.publisher.publish('subscription.trial_ending', {
      tenantId: s.tenantId,
      payload: { daysLeft },
      id: `trial-ending:${s.id}`,
    });
  }
  return subs.length;
}

/** Overrides vencidos: exclusão lógica e invalidação do cache. */
export async function expireOverrides(
  deps: SubscriptionJobDeps,
  now = new Date(),
): Promise<number> {
  const expired = await deps.db.tenantFeatureOverride.findMany({
    where: { deletedAt: null, expiresAt: { lte: now } },
    select: { id: true, tenantId: true },
  });
  if (!expired.length) return 0;
  await deps.db.tenantFeatureOverride.updateMany({
    where: { id: { in: expired.map((e) => e.id) } },
    data: { deletedAt: now },
  });
  for (const tenantId of new Set(expired.map((e) => e.tenantId)))
    await deps.invalidateTenant(tenantId);
  return expired.length;
}
