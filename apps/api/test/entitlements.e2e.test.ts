import { expireOverrides, expireTrials, notifyTrialEnding } from '@vetta/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminToken, as, createTestContext, login, seedWorld, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx?.close());

const jobDeps = () => ({
  db: ctx.db,
  publisher: ctx.events,
  invalidateTenant: (id: string) => ctx.cache.invalidateTenant(id),
});
const day = 86_400_000;

async function trialTenant(students: number) {
  const w = await seedWorld(ctx, 'PRO_PLUS', students);
  await ctx.db.tenantSubscription.update({
    where: { tenantId: w.tenantId },
    data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * day) },
  });
  return w;
}

describe('fim do trial', () => {
  it('cai para FREE e arquiva os excedentes mais antigos sem treino; nada é apagado', async () => {
    const w = await trialTenant(4);
    const [a, b, c, d] = w.studentLinkIds as [string, string, string, string];
    // a nunca treinou; b treinou há 30 dias; c ontem; d hoje
    await ctx.db.studentLink.update({ where: { id: a }, data: { lastWorkoutAt: null } });
    await ctx.db.studentLink.update({
      where: { id: b },
      data: { lastWorkoutAt: new Date(Date.now() - 30 * day) },
    });
    await ctx.db.studentLink.update({
      where: { id: c },
      data: { lastWorkoutAt: new Date(Date.now() - day) },
    });
    await ctx.db.studentLink.update({ where: { id: d }, data: { lastWorkoutAt: new Date() } });

    const token = await login(ctx, w.ownerEmail);
    expect((await as(ctx, token, w.tenantId).get('/v1/me/entitlements')).body.plan.code).toBe(
      'PRO_PLUS',
    );

    await ctx.db.tenantSubscription.update({
      where: { tenantId: w.tenantId },
      data: { trialEndsAt: new Date(Date.now() - 1000) },
    });
    expect(await expireTrials(jobDeps())).toBeGreaterThanOrEqual(1);

    const links = await ctx.db.studentLink.findMany({ where: { tenantId: w.tenantId } });
    const status = Object.fromEntries(links.map((l) => [l.id, l.status]));
    expect(status).toEqual({ [a]: 'ARCHIVED', [b]: 'ARCHIVED', [c]: 'ACTIVE', [d]: 'ACTIVE' });
    // dados preservados
    expect(await ctx.db.workoutProgram.count({ where: { tenantId: w.tenantId } })).toBeGreaterThan(
      0,
    );

    const ent = await as(ctx, token, w.tenantId).get('/v1/me/entitlements');
    expect(ent.body.plan).toMatchObject({ code: 'FREE', status: 'ACTIVE' });
    expect(ent.body.limits['students.max']).toEqual({ used: 2, max: 2 });
    expect(ctx.events.of('students.archived').at(-1)!.payload).toEqual({ count: 2, max: 2 });
    expect(ctx.events.of('subscription.trial_expired').some((e) => e.tenantId === w.tenantId)).toBe(
      true,
    );

    // reativar um arquivado esbarra no limite do FREE
    const restore = await as(ctx, token, w.tenantId).post(`/v1/students/${a}/restore`);
    expect(restore.status).toBe(402);
    expect(restore.body.details.requiredPlan).toBe('PRO');
  });

  it('trial vencido sem o job rodar já resolve como FREE', async () => {
    const w = await trialTenant(1);
    await ctx.db.tenantSubscription.update({
      where: { tenantId: w.tenantId },
      data: { trialEndsAt: new Date(Date.now() - 1000) },
    });
    await ctx.cache.invalidateTenant(w.tenantId);
    const token = await login(ctx, w.ownerEmail);
    expect((await as(ctx, token, w.tenantId).get('/v1/me/entitlements')).body.plan.code).toBe(
      'FREE',
    );
  });

  it('aviso 3 dias antes, uma única vez', async () => {
    const w = await trialTenant(1);
    await ctx.db.tenantSubscription.update({
      where: { tenantId: w.tenantId },
      data: { trialEndsAt: new Date(Date.now() + 2 * day + 3600_000) },
    });
    await notifyTrialEnding(jobDeps());
    await notifyTrialEnding(jobDeps());
    const mine = ctx.events
      .of('subscription.trial_ending')
      .filter((e) => e.tenantId === w.tenantId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.payload).toEqual({ daysLeft: 3 });
  });
});

describe('overrides e alterações de plano', () => {
  it('override vencido deixa de valer e o job o remove', async () => {
    const w = await seedWorld(ctx, 'FREE');
    const token = await login(ctx, w.ownerEmail);
    await ctx.db.tenantFeatureOverride.create({
      data: {
        tenantId: w.tenantId,
        featureKey: 'students.max',
        value: 10,
        reason: 'promo',
        expiresAt: new Date(Date.now() + 1500),
      },
    });
    await ctx.cache.invalidateTenant(w.tenantId);
    expect(
      (await as(ctx, token, w.tenantId).get('/v1/me/entitlements')).body.features['students.max'],
    ).toBe(10);
    await new Promise((r) => setTimeout(r, 2100));
    expect(
      (await as(ctx, token, w.tenantId).get('/v1/me/entitlements')).body.features['students.max'],
    ).toBe(2);
    expect(await expireOverrides(jobDeps())).toBeGreaterThanOrEqual(1);
    const o = await ctx.db.tenantFeatureOverride.findFirstOrThrow({
      where: { tenantId: w.tenantId, featureKey: 'students.max' },
    });
    expect(o.deletedAt).not.toBeNull();
  });

  it('admin altera o plano e todos os tenants veem na hora', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const token = await login(ctx, w.ownerEmail);
    expect(
      (await as(ctx, token, w.tenantId).get('/v1/me/entitlements')).body.features['students.max'],
    ).toBe(50);
    const admin = await adminToken(ctx);
    const res = await as(ctx, admin.token).patch('/v1/admin/plans/PRO/features', {
      values: { 'students.max': 60 },
    });
    expect(res.status).toBe(200);
    expect(res.body.features['students.max']).toBe(60);
    expect(
      (await as(ctx, token, w.tenantId).get('/v1/me/entitlements')).body.features['students.max'],
    ).toBe(60);
    // tipo errado é recusado
    expect(
      (
        await as(ctx, admin.token).patch('/v1/admin/plans/PRO/features', {
          values: { 'students.max': true },
        })
      ).status,
    ).toBe(400);
    await as(ctx, admin.token).patch('/v1/admin/plans/PRO/features', {
      values: { 'students.max': 50 },
    });
  });

  it('planos públicos com preços em centavos', async () => {
    const res = await ctx.http.get('/v1/plans');
    expect(res.body.map((p: { code: string }) => p.code)).toEqual(['FREE', 'PRO', 'PRO_PLUS']);
    const pro = res.body.find((p: { code: string }) => p.code === 'PRO');
    expect(pro.prices.find((x: { cycle: string }) => x.cycle === 'MONTHLY').amountCents).toBe(3990);
  });
});
