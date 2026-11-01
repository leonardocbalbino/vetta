import { Injectable } from '@nestjs/common';
import {
  FEATURES_BY_KEY,
  UNLIMITED,
  type EntitlementsResponse,
  type LimitFeatureKey,
} from '@vetta/contracts';
import {
  EntitlementsCache,
  loadPlanMatrix,
  requiredPlanFor,
  satisfies,
  type PlanMatrixEntry,
  type ResolvedEntitlements,
} from '@vetta/server';
import { upgradeRequired } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';

const MB = 1024 * 1024;
const COUNTED_LINK_STATUS = ['INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE'] as const;

/**
 * Planos e limites: resolve(tenant) = override ?? plano ?? padrão (cache Redis),
 * hasFeature/assertFeature (402 FEATURE_LOCKED) e assertLimit (402 LIMIT_REACHED).
 */
@Injectable()
export class EntitlementsService {
  private matrix: { at: number; value: PlanMatrixEntry[] } | null = null;

  /** Contadores de uso por feature LIMIT (o que conta como "usado"). */
  private readonly counters: Partial<
    Record<LimitFeatureKey, (tenantId: string) => Promise<number>>
  > = {
    'students.max': (tenantId) =>
      this.prisma.system.studentLink.count({
        where: { tenantId, deletedAt: null, status: { in: [...COUNTED_LINK_STATUS] } },
      }),
    'team.assistants': (tenantId) =>
      this.prisma.system.tenantMember.count({
        where: { tenantId, role: 'ASSISTANT', deletedAt: null, status: { not: 'REMOVED' } },
      }),
    'storage.quota_mb': async (tenantId) => {
      const u = await this.prisma.system.tenantStorageUsage.findUnique({ where: { tenantId } });
      return Math.ceil(Number((u?.bytesUsed ?? 0n) + (u?.bytesReserved ?? 0n)) / MB);
    },
  };

  constructor(
    private readonly cache: EntitlementsCache,
    private readonly prisma: PrismaService,
  ) {}

  resolve(tenantId: string): Promise<ResolvedEntitlements> {
    return this.cache.get(tenantId);
  }

  async planMatrix(): Promise<PlanMatrixEntry[]> {
    if (!this.matrix || Date.now() - this.matrix.at > 60_000) {
      this.matrix = { at: Date.now(), value: await loadPlanMatrix(this.prisma.system) };
    }
    return this.matrix.value;
  }

  async value(tenantId: string, key: string): Promise<boolean | number | undefined> {
    return (await this.resolve(tenantId)).features[key];
  }

  async hasFeature(tenantId: string, key: string): Promise<boolean> {
    return satisfies(await this.value(tenantId, key));
  }

  async assertFeature(tenantId: string, key: string): Promise<void> {
    if (await this.hasFeature(tenantId, key)) return;
    const requiredPlan = requiredPlanFor(await this.planMatrix(), key);
    throw upgradeRequired(
      'FEATURE_LOCKED',
      `${FEATURES_BY_KEY[key]?.name ?? key} não está disponível no seu plano.`,
      {
        feature: key,
        requiredPlan,
      },
    );
  }

  async usage(tenantId: string, key: LimitFeatureKey): Promise<number | null> {
    const counter = this.counters[key];
    return counter ? counter(tenantId) : null;
  }

  /** Antes de criar recursos: uso atual + amount precisa caber no limite. */
  async assertLimit(tenantId: string, key: LimitFeatureKey, amount = 1): Promise<void> {
    const max = Number((await this.value(tenantId, key)) ?? 0);
    if (max === UNLIMITED) return;
    const used = (await this.usage(tenantId, key)) ?? 0;
    if (used + amount <= max) return;
    const requiredPlan = requiredPlanFor(await this.planMatrix(), key, used + amount);
    throw upgradeRequired(
      'LIMIT_REACHED',
      `Você atingiu o limite de ${FEATURES_BY_KEY[key]?.name.toLowerCase() ?? key} do seu plano.`,
      {
        feature: key,
        requiredPlan,
        used,
        max,
      },
    );
  }

  async toResponse(tenantId: string): Promise<EntitlementsResponse> {
    const ent = await this.resolve(tenantId);
    const limits: EntitlementsResponse['limits'] = {};
    for (const key of Object.keys(this.counters) as LimitFeatureKey[]) {
      const used = await this.usage(tenantId, key);
      if (used !== null) limits[key] = { used, max: Number(ent.features[key] ?? 0) };
    }
    return { plan: ent.plan, features: ent.features, limits };
  }
}
