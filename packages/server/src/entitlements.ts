import {
  FEATURES_BY_KEY,
  UNLIMITED,
  type EntitlementsResponse,
  type PlanCode,
  type SubscriptionStatus,
} from '@vetta/contracts';
import { featureValueFromDb, type PrismaClient } from '@vetta/db';
import type { Redis } from 'ioredis';
import { ENTITLEMENTS_CACHE_VERSION_KEY, entitlementsCacheKey } from './queues';

export type FeatureValue = boolean | number;

export interface ResolvedEntitlements {
  tenantId: string;
  plan: { code: PlanCode; name: string; status: SubscriptionStatus; trialEndsAt: string | null };
  features: Record<string, FeatureValue>;
  /** Momento em que algum override expira (o cache não pode passar disso). */
  validUntil: string | null;
}

export interface PlanMatrixEntry {
  code: PlanCode;
  sortOrder: number;
  features: Record<string, FeatureValue>;
}

const CACHE_TTL_SECONDS = 300;

/**
 * Resolução: override do tenant (não expirado) ?? valor do plano ?? padrão do catálogo.
 * Trial vencido (job ainda não rodou) e assinatura cancelada caem para FREE.
 */
export async function resolveEntitlements(
  db: PrismaClient,
  tenantId: string,
  now = new Date(),
): Promise<ResolvedEntitlements> {
  const [sub, features, overrides] = await Promise.all([
    db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } }),
    db.feature.findMany(),
    db.tenantFeatureOverride.findMany({
      where: { tenantId, deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
  ]);

  const trialExpired =
    sub?.status === 'TRIALING' && sub.trialEndsAt !== null && sub.trialEndsAt <= now;
  const fallback = !sub || sub.status === 'CANCELED' || trialExpired;
  const plan = fallback ? await db.plan.findUniqueOrThrow({ where: { code: 'FREE' } }) : sub.plan;
  const planValues = await db.planFeature.findMany({ where: { planId: plan.id } });
  const byKey = new Map(planValues.map((v) => [v.featureKey, v.value]));
  const ov = new Map(overrides.map((o) => [o.featureKey, o.value]));

  const values: Record<string, FeatureValue> = {};
  for (const f of features) {
    const raw = ov.get(f.key) ?? byKey.get(f.key) ?? f.defaultValue;
    values[f.key] = featureValueFromDb(f.type, raw);
  }
  const expiries = overrides.map((o) => o.expiresAt).filter((d): d is Date => d !== null);
  const validUntil = expiries.length
    ? new Date(Math.min(...expiries.map((d) => d.getTime())))
    : null;

  return {
    tenantId,
    plan: {
      code: plan.code,
      name: plan.name,
      status: fallback ? 'ACTIVE' : sub.status,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    },
    features: values,
    validUntil: validUntil?.toISOString() ?? null,
  };
}

export async function loadPlanMatrix(db: PrismaClient): Promise<PlanMatrixEntry[]> {
  const plans = await db.plan.findMany({
    where: { isActive: true },
    include: { features: { include: { feature: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return plans.map((p) => ({
    code: p.code,
    sortOrder: p.sortOrder,
    features: Object.fromEntries(
      p.features.map((pf) => [pf.featureKey, featureValueFromDb(pf.feature.type, pf.value)]),
    ),
  }));
}

/** O valor satisfaz a necessidade? (boolean ligado ou limite >= needed). */
export function satisfies(value: FeatureValue | undefined, needed = 1): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  return value === UNLIMITED || value >= needed;
}

/** Plano mínimo que libera a feature (ou o limite pedido). */
export function requiredPlanFor(
  matrix: PlanMatrixEntry[],
  key: string,
  needed = 1,
): PlanCode | null {
  return matrix.find((p) => satisfies(p.features[key], needed))?.code ?? null;
}

/** Cache Redis versionado: alterar plano = INCR na versão; alterar override = DEL da chave do tenant. */
export class EntitlementsCache {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
  ) {}

  private async version() {
    return (await this.redis.get(ENTITLEMENTS_CACHE_VERSION_KEY)) ?? '0';
  }

  async get(tenantId: string): Promise<ResolvedEntitlements> {
    const key = entitlementsCacheKey(await this.version(), tenantId);
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as ResolvedEntitlements;
    const fresh = await resolveEntitlements(this.db, tenantId);
    let ttl = CACHE_TTL_SECONDS;
    if (fresh.validUntil) {
      ttl = Math.max(
        1,
        Math.min(ttl, Math.floor((Date.parse(fresh.validUntil) - Date.now()) / 1000)),
      );
    }
    await this.redis.set(key, JSON.stringify(fresh), 'EX', ttl);
    return fresh;
  }

  async invalidateTenant(tenantId: string) {
    await this.redis.del(entitlementsCacheKey(await this.version(), tenantId));
  }

  /** Invalida todos os tenants (ex.: admin alterou valores de um plano). */
  async invalidateAll() {
    await this.redis.incr(ENTITLEMENTS_CACHE_VERSION_KEY);
  }
}

export function featureLabel(key: string) {
  return FEATURES_BY_KEY[key]?.name ?? key;
}

export type { EntitlementsResponse };
