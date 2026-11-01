import { FEATURE_CATALOG, PLAN_SEED } from '@vetta/contracts';
import type { PrismaClient } from '../generated/client';
import { featureValueToDb } from './features';

/**
 * Sincroniza o catálogo de features (código → banco) e cria os planos
 * iniciais se ainda não existirem. Seguro em produção: nunca sobrescreve
 * valores de planos já configurados pelo admin.
 */
export async function syncCatalog(db: PrismaClient): Promise<{ features: number; plans: number }> {
  for (const f of FEATURE_CATALOG) {
    const data = {
      type: f.type,
      module: f.module,
      name: f.name,
      description: f.description,
      defaultValue: featureValueToDb(f.defaultValue),
      unit: 'unit' in f ? f.unit : null,
    };
    await db.feature.upsert({
      where: { key: f.key },
      create: { key: f.key, ...data },
      update: data,
    });
  }

  let createdPlans = 0;
  for (const p of PLAN_SEED) {
    const existing = await db.plan.findUnique({ where: { code: p.code } });
    const plan =
      existing ??
      (await db.plan.create({
        data: { code: p.code, name: p.name, description: p.description, sortOrder: p.sortOrder },
      }));
    if (!existing) createdPlans++;

    for (const [cycle, amountCents] of Object.entries(p.prices)) {
      await db.planPrice.upsert({
        where: { planId_cycle: { planId: plan.id, cycle: cycle as never } },
        create: { planId: plan.id, cycle: cycle as never, amountCents },
        update: {},
      });
    }
    // Features novas entram no plano com o valor do seed; existentes não são tocadas.
    for (const f of FEATURE_CATALOG) {
      const value = (p.features as Record<string, boolean | number | undefined>)[f.key];
      await db.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey: f.key } },
        create: {
          planId: plan.id,
          featureKey: f.key,
          value: featureValueToDb(value ?? (f.type === 'BOOLEAN' ? false : 0)),
        },
        update: {},
      });
    }
  }
  return { features: FEATURE_CATALOG.length, plans: createdPlans };
}
