import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  createTestContext,
  lastEvent,
  login,
  PASSWORD,
  seedWorld,
  type TestContext,
} from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx?.close());

const register = (email: string, extra: object = {}) =>
  ctx.http.post('/v1/auth/register').send({
    name: 'Joana Personal',
    email,
    password: PASSWORD,
    businessName: 'Joana Treinos',
    acceptTerms: true,
    acceptHealthDataConsent: true,
    ...extra,
  });

describe('cadastro do personal', () => {
  it('cria tenant, OWNER e trial de 14 dias no PRO_PLUS; envia verificação', async () => {
    const res = await register('joana@test.dev');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 900,
    });

    const me = await as(ctx, res.body.accessToken).get('/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.emailVerified).toBe(false);
    const m = me.body.memberships[0];
    expect(m).toMatchObject({ role: 'PERSONAL', tenantSlug: 'joana-treinos' });

    const sub = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: m.tenantId },
      include: { plan: true },
    });
    expect(sub.status).toBe('TRIALING');
    expect(sub.plan.code).toBe('PRO_PLUS');
    const days = (sub.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);

    const consents = await ctx.db.consent.findMany({ where: { userId: me.body.id } });
    expect(consents.map((c) => c.type).sort()).toEqual(['HEALTH_DATA', 'PRIVACY', 'TERMS']);

    const ent = await as(ctx, res.body.accessToken, m.tenantId).get('/v1/me/entitlements');
    expect(ent.body.plan).toMatchObject({ code: 'PRO_PLUS', status: 'TRIALING' });
    expect(ent.body.features['students.max']).toBe(-1);

    // verificação de e-mail
    const { token } = lastEvent(ctx, 'auth.email_verification_requested').payload as {
      token: string;
    };
    expect((await ctx.http.post('/v1/auth/verify-email').send({ token })).status).toBe(200);
    expect((await as(ctx, res.body.accessToken).get('/v1/me')).body.emailVerified).toBe(true);
    // token é de uso único
    expect((await ctx.http.post('/v1/auth/verify-email').send({ token })).body.code).toBe(
      'TOKEN_INVALID',
    );
  });

  it('recusa e-mail já cadastrado, termos não aceitos e senha fraca', async () => {
    expect((await register('joana@test.dev')).status).toBe(409);
    const noTerms = await register('x@test.dev', { acceptTerms: false });
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.code).toBe('VALIDATION_ERROR');
    expect((await register('y@test.dev', { password: 'curta' })).body.details[0].path).toBe(
      'password',
    );
  });
});

describe('login, refresh rotativo e reuso', () => {
  it('rotaciona o refresh token e revoga a sessão ao detectar reuso', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const res = await ctx.http
      .post('/v1/auth/login')
      .send({ email: w.ownerEmail, password: PASSWORD, deviceName: 'iPhone' });
    expect(res.status).toBe(200);
    const first = res.body;

    const r1 = await ctx.http.post('/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first.refreshToken);
    expect(r1.body.sessionId).toBe(first.sessionId);

    // o novo access token funciona
    expect((await as(ctx, r1.body.accessToken).get('/v1/me')).status).toBe(200);

    // reapresentar o token antigo = reuso → 401 TOKEN_REUSED e sessão revogada
    const reuse = await ctx.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('TOKEN_REUSED');
    const session = await ctx.db.session.findUniqueOrThrow({ where: { id: first.sessionId } });
    expect(session.revokedReason).toBe('refresh_token_reuse');

    // até o token legítimo mais recente deixa de valer, e o access token é bloqueado na hora
    expect(
      (await ctx.http.post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status,
    ).toBe(401);
    expect((await as(ctx, r1.body.accessToken).get('/v1/me')).status).toBe(401);
    expect(lastEvent(ctx, 'auth.refresh_token_reused').payload).toMatchObject({
      userId: w.ownerUserId,
    });
  });

  it('refresh simultâneo com o mesmo token: só um vence', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const res = await ctx.http
      .post('/v1/auth/login')
      .send({ email: w.ownerEmail, password: PASSWORD });
    const results = await Promise.all([
      ctx.http.post('/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }),
      ctx.http.post('/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }),
    ]);
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
  });

  it('credenciais erradas e token inválido', async () => {
    const w = await seedWorld(ctx, 'FREE');
    const bad = await ctx.http
      .post('/v1/auth/login')
      .send({ email: w.ownerEmail, password: 'errada-123' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const ghost = await ctx.http
      .post('/v1/auth/login')
      .send({ email: 'ninguem@test.dev', password: 'errada-123' });
    expect(ghost.body.code).toBe('INVALID_CREDENTIALS');
    expect((await as(ctx, 'abc.def.ghi').get('/v1/me')).body.code).toBe('TOKEN_INVALID');
    expect(
      (await ctx.http.post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(43) })).body.code,
    ).toBe('TOKEN_INVALID');
  });

  it('lista e revoga sessões; logout invalida o access token', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const a = await login(ctx, w.ownerEmail);
    const b = await login(ctx, w.ownerEmail);
    const list = await as(ctx, a).get('/v1/auth/sessions');
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const revokeOthers = await as(ctx, a).delete('/v1/auth/sessions');
    expect(revokeOthers.body.revoked).toBeGreaterThanOrEqual(1);
    expect((await as(ctx, b).get('/v1/me')).status).toBe(401);

    expect((await as(ctx, a).post('/v1/auth/logout')).status).toBe(200);
    expect((await as(ctx, a).get('/v1/me')).status).toBe(401);
  });
});

describe('2FA, reset de senha e magic link', () => {
  it('2FA TOTP opcional do personal', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const token = await login(ctx, w.ownerEmail);
    const setup = await as(ctx, token).post('/v1/auth/2fa/setup');
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/Vetta');
    expect((await as(ctx, token).post('/v1/auth/2fa/enable', { code: '000000' })).body.code).toBe(
      'TWO_FACTOR_INVALID',
    );
    const enabled = await as(ctx, token).post('/v1/auth/2fa/enable', {
      code: authenticator.generate(setup.body.secret),
    });
    expect(enabled.body.recoveryCodes).toHaveLength(10);

    const step1 = await ctx.http
      .post('/v1/auth/login')
      .send({ email: w.ownerEmail, password: PASSWORD });
    expect(step1.body).toMatchObject({ twoFactorRequired: true });
    const step2 = await ctx.http
      .post('/v1/auth/login/2fa')
      .send({
        challengeToken: step1.body.challengeToken,
        code: authenticator.generate(setup.body.secret),
      });
    expect(step2.status).toBe(200);
    expect(step2.body.accessToken).toBeTruthy();

    // código de recuperação funciona uma única vez
    const s3 = await ctx.http
      .post('/v1/auth/login')
      .send({ email: w.ownerEmail, password: PASSWORD });
    const rc = enabled.body.recoveryCodes[0];
    expect(
      (
        await ctx.http
          .post('/v1/auth/login/2fa')
          .send({ challengeToken: s3.body.challengeToken, code: rc })
      ).status,
    ).toBe(200);
    const s4 = await ctx.http
      .post('/v1/auth/login')
      .send({ email: w.ownerEmail, password: PASSWORD });
    expect(
      (
        await ctx.http
          .post('/v1/auth/login/2fa')
          .send({ challengeToken: s4.body.challengeToken, code: rc })
      ).status,
    ).toBe(401);
  });

  it('recuperação de senha revoga as sessões e troca a senha', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const old = await login(ctx, w.ownerEmail);
    expect(
      (await ctx.http.post('/v1/auth/password/forgot').send({ email: w.ownerEmail })).status,
    ).toBe(200);
    // e-mail inexistente responde igual (sem enumeração)
    expect(
      (await ctx.http.post('/v1/auth/password/forgot').send({ email: 'nao-existe@test.dev' }))
        .status,
    ).toBe(200);
    const { token } = lastEvent(ctx, 'auth.password_reset_requested').payload as { token: string };
    expect(
      (await ctx.http.post('/v1/auth/password/reset').send({ token, password: 'NovaSenha-456' }))
        .status,
    ).toBe(200);
    expect((await as(ctx, old).get('/v1/me')).status).toBe(401);
    expect(
      (await ctx.http.post('/v1/auth/login').send({ email: w.ownerEmail, password: PASSWORD }))
        .status,
    ).toBe(401);
    expect(
      (
        await ctx.http
          .post('/v1/auth/login')
          .send({ email: w.ownerEmail, password: 'NovaSenha-456' })
      ).status,
    ).toBe(200);
  });

  it('magic link entra sem senha e vale uma vez', async () => {
    const w = await seedWorld(ctx, 'FREE');
    await ctx.http.post('/v1/auth/magic-link').send({ email: w.ownerEmail });
    const { token } = lastEvent(ctx, 'auth.magic_link_requested').payload as { token: string };
    const ok = await ctx.http.post('/v1/auth/magic-link/verify').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    expect((await ctx.http.post('/v1/auth/magic-link/verify').send({ token })).status).toBe(400);
  });

  it('login social sem provedor configurado responde 401 claro', async () => {
    const r = await ctx.http
      .post('/v1/auth/oauth')
      .send({ provider: 'GOOGLE', idToken: 'x'.repeat(40) });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/não configurado/);
  });
});

describe('admin: 2FA obrigatório e impersonação', () => {
  it('admin precisa configurar 2FA no primeiro acesso; impersonação é auditada', async () => {
    const { hash } = await import('argon2');
    await ctx.db.adminUser.create({
      data: {
        email: 'root@vettafit.dev',
        name: 'Root',
        passwordHash: await hash(PASSWORD),
        role: 'SUPER_ADMIN',
      },
    });
    const step1 = await ctx.http
      .post('/v1/admin/auth/login')
      .send({ email: 'root@vettafit.dev', password: PASSWORD });
    expect(step1.body).toMatchObject({ twoFactorSetupRequired: true });
    const setup = await ctx.http
      .post('/v1/admin/auth/2fa/setup')
      .send({ token: step1.body.challengeToken });
    const verify = await ctx.http
      .post('/v1/admin/auth/2fa/verify')
      .send({
        challengeToken: step1.body.challengeToken,
        code: authenticator.generate(setup.body.secret),
      });
    expect(verify.status).toBe(200);
    expect(verify.body.recoveryCodes).toHaveLength(10);
    const admin = verify.body.accessToken as string;

    // segundo login já exige o código
    const again = await ctx.http
      .post('/v1/admin/auth/login')
      .send({ email: 'root@vettafit.dev', password: PASSWORD });
    expect(again.body).toMatchObject({ twoFactorRequired: true });

    const w = await seedWorld(ctx, 'PRO');
    const noReason = await as(ctx, admin).post('/v1/admin/impersonations', {
      userId: w.ownerUserId,
      reason: 'curto',
    });
    expect(noReason.status).toBe(400);
    const imp = await as(ctx, admin).post('/v1/admin/impersonations', {
      userId: w.ownerUserId,
      reason: 'Suporte: personal não consegue ver aluno',
      minutes: 10,
    });
    expect(imp.status).toBe(201);
    const me = await as(ctx, imp.body.accessToken).get('/v1/me');
    expect(me.body.impersonatedBy).toBeTruthy();

    // escrita durante a impersonação gera audit log
    await as(ctx, imp.body.accessToken, w.tenantId).patch('/v1/tenants/current', {
      name: 'Nome via suporte',
    });
    await new Promise((r) => setTimeout(r, 100));
    const logs = await ctx.db.auditLog.findMany({
      where: { impersonatorAdminId: me.body.impersonatedBy },
    });
    expect(logs.map((l) => l.action)).toContain('impersonation.request');
    expect(
      await ctx.db.auditLog.count({
        where: { action: 'impersonation.start', resourceId: w.ownerUserId },
      }),
    ).toBe(1);

    // a sessão de impersonação não aparece para o usuário
    const userToken = await login(ctx, w.ownerEmail);
    const sessions = await as(ctx, userToken).get('/v1/auth/sessions');
    expect(
      sessions.body.some((s: { deviceName: string }) => s.deviceName === 'Impersonação (admin)'),
    ).toBe(false);

    expect(
      (await as(ctx, admin).delete(`/v1/admin/impersonations/${imp.body.sessionId}`)).status,
    ).toBe(200);
    expect((await as(ctx, imp.body.accessToken).get('/v1/me')).status).toBe(401);
  });
});
