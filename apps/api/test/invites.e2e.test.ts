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

const tokenFromUrl = (url: string) => decodeURIComponent(url.split('/convite/')[1]!);

describe('convite de aluno', () => {
  it('por e-mail: aluno define a senha no primeiro acesso e ganha o vínculo', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const personal = await login(ctx, w.ownerEmail);
    const inv = await as(ctx, personal, w.tenantId).post('/v1/students/invites', {
      name: 'Marina',
      email: 'marina@test.dev',
    });
    expect(inv.status).toBe(201);
    expect(inv.body.inviteUrl).toContain('/convite/');
    const days = (Date.parse(inv.body.expiresAt) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    const event = lastEvent(ctx, 'student.invited');
    expect(event.payload).toMatchObject({ tenantName: expect.any(String) });
    const token = event.payload.token as string;

    const preview = await ctx.http.get(`/v1/invites/${token}`);
    expect(preview.body).toMatchObject({ studentName: 'Marina', requiresPassword: true });

    const accept = await ctx.http
      .post('/v1/invites/accept')
      .send({ token, password: 'Marina-2026', acceptTerms: true, acceptHealthDataConsent: true });
    expect(accept.status).toBe(200);
    const me = await as(ctx, accept.body.accessToken).get('/v1/me');
    expect(me.body.emailVerified).toBe(true);
    expect(me.body.memberships).toEqual([
      expect.objectContaining({ tenantId: w.tenantId, role: 'ALUNO', status: 'ACTIVE' }),
    ]);
    expect(
      await ctx.db.consent.count({
        where: { userId: me.body.id, type: 'HEALTH_DATA', tenantId: w.tenantId },
      }),
    ).toBe(1);
    expect(lastEvent(ctx, 'student.joined').payload).toMatchObject({ studentName: 'Marina' });

    // uso único
    expect(
      (
        await ctx.http
          .post('/v1/invites/accept')
          .send({
            token,
            password: 'Marina-2026',
            acceptTerms: true,
            acceptHealthDataConsent: false,
          })
      ).body.code,
    ).toBe('TOKEN_INVALID');
    // convite repetido
    expect(
      (
        await as(ctx, personal, w.tenantId).post('/v1/students/invites', {
          name: 'Marina',
          email: 'marina@test.dev',
        })
      ).status,
    ).toBe(409);
  });

  it('aluno que já tem conta (de outro personal) confirma a senha atual e vê os dois vínculos', async () => {
    const a = await seedWorld(ctx, 'PRO');
    const b = await seedWorld(ctx, 'PRO');
    const email = a.studentEmails[0]!;
    const personalB = await login(ctx, b.ownerEmail);
    await as(ctx, personalB, b.tenantId).post('/v1/students/invites', {
      name: 'Aluno compartilhado',
      email,
    });
    const token = lastEvent(ctx, 'student.invited').payload.token as string;
    expect((await ctx.http.get(`/v1/invites/${token}`)).body.requiresPassword).toBe(false);

    const wrong = await ctx.http
      .post('/v1/invites/accept')
      .send({ token, password: 'errada-123', acceptTerms: true, acceptHealthDataConsent: true });
    expect(wrong.status).toBe(401);
    const ok = await ctx.http
      .post('/v1/invites/accept')
      .send({ token, password: PASSWORD, acceptTerms: true, acceptHealthDataConsent: true });
    expect(ok.status).toBe(200);
    const me = await as(ctx, ok.body.accessToken).get('/v1/me');
    expect(me.body.memberships.map((m: { tenantId: string }) => m.tenantId).sort()).toEqual(
      [a.tenantId, b.tenantId].sort(),
    );
    // seletor de vínculo: cada tenant isolado
    const studentToken = ok.body.accessToken as string;
    expect((await as(ctx, studentToken, a.tenantId).get('/v1/tenants/current')).body.id).toBe(
      a.tenantId,
    );
    expect((await as(ctx, studentToken, b.tenantId).get('/v1/tenants/current')).body.id).toBe(
      b.tenantId,
    );
  });

  it('por link (sem e-mail): o aluno informa o e-mail ao aceitar; convite expira em 7 dias', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const personal = await login(ctx, w.ownerEmail);
    const inv = await as(ctx, personal, w.tenantId).post('/v1/students/invites', {
      name: 'Pedro',
      delivery: 'LINK',
    });
    const token = tokenFromUrl(inv.body.inviteUrl);
    const noEmail = await ctx.http
      .post('/v1/invites/accept')
      .send({ token, password: 'Pedro-2026', acceptTerms: true, acceptHealthDataConsent: false });
    expect(noEmail.status).toBe(400);
    const ok = await ctx.http
      .post('/v1/invites/accept')
      .send({
        token,
        email: 'pedro@test.dev',
        password: 'Pedro-2026',
        name: 'Pedro Alves',
        acceptTerms: true,
        acceptHealthDataConsent: false,
      });
    expect(ok.status).toBe(200);
    // e-mail não comprovado por link
    expect((await as(ctx, ok.body.accessToken).get('/v1/me')).body.emailVerified).toBe(false);

    const inv2 = await as(ctx, personal, w.tenantId).post('/v1/students/invites', {
      name: 'Expirado',
      delivery: 'LINK',
    });
    const t2 = tokenFromUrl(inv2.body.inviteUrl);
    await ctx.db.authToken.updateMany({
      where: { type: 'STUDENT_INVITE', usedAt: null, tenantId: w.tenantId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await ctx.http.get(`/v1/invites/${t2}`)).body.code).toBe('TOKEN_INVALID');
  });
});
