import { normalizeText } from '@vetta/contracts';
import {
  AnthropicAiProvider,
  markSupportSlaBreaches,
  MemoryCustomDomainProvider,
  PROGRAM_GENERATION_RECORDING,
  ReplayMessagesClient,
  WEEKLY_SUMMARY_RECORDING,
  type AiProvider,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarProvider,
} from '@vetta/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addAssistant,
  adminToken,
  as,
  createTestContext,
  lastEvent,
  login,
  seedWorld,
  type TestContext,
} from './harness';

// ─── Dublês ─────────────────────────────────────────────────────────────────

let replay = new ReplayMessagesClient([]);
const ai: AiProvider = {
  name: 'anthropic',
  model: 'claude-opus-5-5',
  run: (task) =>
    new AnthropicAiProvider(replay, {
      model: 'claude-opus-5-5',
      effort: 'medium',
      refusalFallback: true,
    }).run(task),
};

const domains = new MemoryCustomDomainProvider('custom.vettafit.dev', 1);

/** Google Calendar em memória: guarda eventos e devolve as mudanças pendentes. */
class FakeCalendar implements CalendarProvider {
  readonly name = 'google';
  events = new Map<string, CalendarEvent>();
  pending: CalendarEvent[] = [];
  private seq = 0;
  authUrl(state: string) {
    return `https://accounts.google.test/auth?state=${state}`;
  }
  exchangeCode() {
    return Promise.resolve({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(Date.now() + 3_600_000),
      email: 'personal@gmail.test',
    });
  }
  refresh() {
    return this.exchangeCode();
  }
  listChanges() {
    const events = this.pending;
    this.pending = [];
    return Promise.resolve({ events, nextSyncToken: `sync-${++this.seq}` });
  }
  upsertEvent(_t: string, _c: string, id: string | null, input: CalendarEventInput) {
    const e: CalendarEvent = {
      id: id ?? `g-${++this.seq}`,
      status: 'confirmed',
      summary: input.summary,
      description: input.description ?? null,
      location: input.location ?? null,
      start: input.start,
      end: input.end,
      allDay: false,
      updated: new Date(),
      transparent: false,
      vettaAppointmentId: input.vettaAppointmentId,
    };
    this.events.set(e.id, e);
    return Promise.resolve(e);
  }
  deleteEvent(_t: string, _c: string, id: string) {
    this.events.delete(id);
    return Promise.resolve();
  }
  watch() {
    return Promise.resolve({
      resourceId: 'res-1',
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
  }
  stop() {
    return Promise.resolve();
  }
}
const calendar = new FakeCalendar();

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext({}, { ai, customDomains: domains, calendar });
});
afterAll(async () => ctx?.close());

const until = async (fn: () => Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('tempo esgotado');
};

async function libraryFor(tenantId: string) {
  const names = [
    'Agachamento livre',
    'Supino reto com barra',
    'Remada curvada com barra',
    'Leg press 45°',
    'Cadeira flexora sentada',
  ];
  const rows = [];
  for (const name of names) {
    rows.push(
      await ctx.db.exercise.create({
        data: {
          tenantId,
          name,
          searchText: normalizeText(name),
          primaryMuscles: [],
          equipment: [],
        },
      }),
    );
  }
  return rows;
}

// ─── 3.1 IA ─────────────────────────────────────────────────────────────────

describe('IA de treino (respostas gravadas)', () => {
  const body = (studentLinkId?: string) => ({
    objective: 'Hipertrofia de membros inferiores',
    level: 'INTERMEDIATE',
    daysPerWeek: 3,
    minutesPerSession: 60,
    ...(studentLinkId ? { studentLinkId } : {}),
  });

  it('gera rascunho só com exercícios da biblioteca e nada é publicado sem revisão', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 1);
    await libraryFor(w.tenantId);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const aluno = as(ctx, await login(ctx, w.studentEmails[0]!), w.tenantId);

    replay = new ReplayMessagesClient(PROGRAM_GENERATION_RECORDING);
    const res = await personal.post('/v1/ai/programs', body(w.studentLinkIds[0]));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe('DRAFT');

    // Só ids da biblioteca do tenant (ou global), nunca o inventado.
    const items = await ctx.db.routineExercise.findMany({
      where: { routine: { programId: res.body.programId }, deletedAt: null },
      include: { exercise: true },
    });
    expect(items).toHaveLength(4);
    for (const i of items) {
      expect(i.exercise.tenantId === w.tenantId || i.exercise.tenantId === null).toBe(true);
      expect(i.notes).toMatch(/^IA: /);
    }
    expect(items.map((i) => i.exercise.name)).not.toContain('Cadeira flexora sentada');

    const program = await ctx.db.workoutProgram.findUniqueOrThrow({
      where: { id: res.body.programId },
    });
    expect(program).toMatchObject({ status: 'DRAFT', aiGenerated: true, publishedAt: null });
    expect(ctx.events.of('workout.published').some((e) => e.payload.programId === program.id)).toBe(
      false,
    );

    // O aluno não vê o rascunho.
    expect((await aluno.get(`/v1/programs/${program.id}`)).status).toBe(404);

    // Dados enviados à IA não têm nome nem e-mail do aluno.
    const sent = JSON.stringify(replay.requests);
    expect(sent).not.toContain('Aluno 0');
    expect(sent).not.toContain(w.studentEmails[0]!);

    // Uso e custo registrados.
    const gen = await ctx.db.aiGeneration.findUniqueOrThrow({
      where: { id: res.body.generationId },
    });
    expect(gen).toMatchObject({ status: 'SUCCEEDED', kind: 'PROGRAM', programId: program.id });
    expect(gen.costMicroUsd).toBeGreaterThan(0);
    expect(gen.inputTokens).toBe(2100 + 2600 + 3300 + 4900);

    // Publicar continua sendo ação explícita do personal.
    expect((await personal.post(`/v1/programs/${program.id}/publish`)).status).toBe(200);
    expect((await aluno.get(`/v1/programs/${program.id}`)).status).toBe(200);

    const usage = await personal.get('/v1/ai/usage');
    expect(usage.body).toMatchObject({ enabled: true, used: 1, limit: 200 });
  });

  it('exercício fora da biblioteca derruba a geração (502) e nada é criado', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS');
    await libraryFor(w.tenantId);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const bad = PROGRAM_GENERATION_RECORDING.slice(0, 3);
    replay = new ReplayMessagesClient([...bad, bad[2]!, bad[2]!]);
    const before = await ctx.db.workoutProgram.count({ where: { tenantId: w.tenantId } });
    const res = await personal.post('/v1/ai/programs', body());
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: 'AI_FAILED', details: { reason: 'INVALID_OUTPUT' } });
    expect(await ctx.db.workoutProgram.count({ where: { tenantId: w.tenantId } })).toBe(before);
    const gen = await ctx.db.aiGeneration.findFirstOrThrow({ where: { tenantId: w.tenantId } });
    expect(gen.status).toBe('FAILED');
    // Falha não consome a cota.
    expect((await personal.get('/v1/ai/usage')).body.used).toBe(0);
  });

  it('cota mensal: 402 LIMIT_REACHED; plano sem IA: 402 FEATURE_LOCKED', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 1);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    await ctx.db.tenantFeatureOverride.create({
      data: { tenantId: w.tenantId, featureKey: 'workouts.ai_monthly', value: 1, reason: 'teste' },
    });
    await ctx.cache.invalidateTenant(w.tenantId);
    replay = new ReplayMessagesClient(WEEKLY_SUMMARY_RECORDING);
    const ok = await personal.post('/v1/ai/weekly-summary', { studentLinkId: w.studentLinkIds[0] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.headline).toBeTruthy();
    const again = await personal.post('/v1/ai/weekly-summary', {
      studentLinkId: w.studentLinkIds[0],
    });
    expect(again.status).toBe(402);
    expect(again.body.code).toBe('LIMIT_REACHED');

    const pro = await seedWorld(ctx, 'PRO');
    const res = await as(ctx, await login(ctx, pro.ownerEmail), pro.tenantId).post(
      '/v1/ai/programs',
      body(),
    );
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'FEATURE_LOCKED',
      details: { requiredPlan: 'PRO_PLUS' },
    });
  });
});

// ─── 3.2 Equipe ─────────────────────────────────────────────────────────────

describe('equipe', () => {
  it('convite, aceite, atribuição e isolamento do assistente', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 2);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const email = `assist-${Date.now()}@test.dev`;
    const inv = await personal.post('/v1/team/invites', {
      name: 'Bia',
      email,
      permissions: ['prescribe', 'chat'],
    });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const token = lastEvent(ctx, 'team.invited').payload.token as string;
    expect((await ctx.http.get(`/v1/team/invites/${token}`)).body).toMatchObject({
      email,
      requiresPassword: true,
    });
    const accepted = await ctx.http
      .post('/v1/team/invites/accept')
      .send({ token, password: 'Senha-forte-123', acceptTerms: true });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(lastEvent(ctx, 'team.joined').payload.memberName).toBe('Bia');

    const [a, b] = w.studentLinkIds as [string, string];
    expect(
      (
        await personal.post('/v1/team/assignments', {
          studentLinkIds: [a],
          memberId: inv.body.memberId,
        })
      ).status,
    ).toBe(200);

    const asst = as(ctx, accepted.body.accessToken, w.tenantId);
    const list = await asst.get('/v1/students');
    const ids = (list.body.items ?? list.body).map((s: { id: string }) => s.id);
    expect(ids).toEqual([a]);
    expect((await asst.get(`/v1/students/${b}`)).status).toBe(404);
    expect((await asst.get('/v1/finance/summary')).status).toBe(403);
    expect((await asst.get('/v1/team')).status).toBe(403);
    expect((await asst.get('/v1/brand/settings')).status).toBe(403);

    // Sem "assess": não registra avaliação; com "prescribe": cria treino do aluno atribuído.
    const created = await asst.post('/v1/programs', {
      name: 'Treino da Bia',
      studentLinkId: a,
      routines: [],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const assess = await asst.post(`/v1/progress/${a}/measurements`, { weightKg: 70 });
    expect(assess.status).toBe(403);
    expect(assess.body.message).toContain('avaliar');

    // O personal retira "prescribe": a escrita de treino passa a 403, a leitura continua.
    await personal.patch(`/v1/team/members/${inv.body.memberId}`, { permissions: ['chat'] });
    expect(
      (await asst.put(`/v1/programs/${created.body.id}`, { name: 'X', routines: [] })).status,
    ).toBe(403);
    expect((await asst.get(`/v1/programs/${created.body.id}`)).status).toBe(200);

    // Log de quem alterou o quê.
    await until(async () => {
      const r = await personal.get(`/v1/team/activity?memberId=${inv.body.memberId}`);
      return r.body.items?.some((i: { resource: string }) => i.resource === 'workouts');
    });
    const act = await personal.get(`/v1/team/activity?studentLinkId=${a}`);
    expect(act.body.items[0]).toMatchObject({ actorName: 'Bia', role: 'PERSONAL_ASSISTENTE' });

    // Removido: perde o acesso e os alunos voltam ao personal.
    await personal.delete(`/v1/team/members/${inv.body.memberId}`);
    expect((await asst.get('/v1/students')).status).toBe(404);
    expect(
      (await ctx.db.studentLink.findUniqueOrThrow({ where: { id: a } })).assistantMemberId,
    ).toBeNull();
  });

  it('limite de assistentes do plano (402) e PRO sem equipe', async () => {
    const pro = await seedWorld(ctx, 'PRO');
    const res = await as(ctx, await login(ctx, pro.ownerEmail), pro.tenantId).post(
      '/v1/team/invites',
      { name: 'X', email: `x-${Date.now()}@test.dev` },
    );
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('LIMIT_REACHED');
  });
});

// ─── 3.3 White label ────────────────────────────────────────────────────────

describe('white label', () => {
  it('valida contraste e sugere a cor mais próxima', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS');
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const bad = await personal.put('/v1/brand/settings', { primaryColor: '#FFE600' });
    expect(bad.status).toBe(400);
    const suggestion = bad.body.details.contrast.primary.suggestion as string;
    expect(suggestion).toMatch(/^#[0-9A-F]{6}$/);
    const ok = await personal.put('/v1/brand/settings', {
      primaryColor: suggestion,
      displayName: 'Studio Sol',
      emailFromName: 'Studio Sol',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.contrast.ok).toBe(true);
  });

  it('o tema de um personal não vaza para alunos de outro', async () => {
    const one = await seedWorld(ctx, 'PRO_PLUS', 1);
    const two = await seedWorld(ctx, 'PRO_PLUS', 1);
    await as(ctx, await login(ctx, one.ownerEmail), one.tenantId).put('/v1/brand/settings', {
      primaryColor: '#7A1FA2',
      displayName: 'Studio Um',
    });
    await as(ctx, await login(ctx, two.ownerEmail), two.tenantId).put('/v1/brand/settings', {
      primaryColor: '#0B6E4F',
      displayName: 'Studio Dois',
    });
    const alunoUm = await login(ctx, one.studentEmails[0]!);
    const alunoDois = await login(ctx, two.studentEmails[0]!);

    const t1 = await as(ctx, alunoUm, one.tenantId).get('/v1/brand/active');
    expect(t1.body).toMatchObject({
      displayName: 'Studio Um',
      whiteLabel: true,
      primaryColor: '#7A1FA2',
    });
    expect(t1.body.css).toContain('#7A1FA2');
    expect(t1.body.css).not.toContain('#0B6E4F');

    const t2 = await as(ctx, alunoDois, two.tenantId).get('/v1/brand/active');
    expect(t2.body.displayName).toBe('Studio Dois');
    expect(t2.body.css).not.toContain('#7A1FA2');

    // Aluno do personal 2 pedindo o tema do personal 1: 404 (sem vínculo).
    expect((await as(ctx, alunoDois, one.tenantId).get('/v1/brand/active')).status).toBe(404);

    // Downgrade: o tema some (dados preservados).
    await ctx.db.tenantSubscription.update({
      where: { tenantId: one.tenantId },
      data: { plan: { connect: { code: 'PRO' } } },
    });
    await ctx.cache.invalidateTenant(one.tenantId);
    const after = await as(ctx, alunoUm, one.tenantId).get('/v1/brand/active');
    expect(after.body).toMatchObject({
      whiteLabel: false,
      css: '',
      displayName: expect.any(String),
    });
    expect(
      (await ctx.db.tenantBrand.findUniqueOrThrow({ where: { tenantId: one.tenantId } }))
        .primaryColor,
    ).toBe('#7A1FA2');
  });

  it('domínio próprio: CNAME, verificação, certificado e tema por host', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS');
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    await personal.put('/v1/brand/settings', {
      primaryColor: '#7A1FA2',
      displayName: 'Studio Host',
    });
    const host = `app.studio-${Date.now()}.com.br`;
    const set = await personal.put('/v1/brand/domain', { domain: `https://${host}/` });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.domain).toMatchObject({
      domain: host,
      status: 'VERIFYING',
      dns: { type: 'CNAME', name: host, value: 'custom.vettafit.dev' },
    });
    // Antes de ativar, o host não resolve.
    expect((await ctx.http.get(`/v1/public/brand?host=${host}`)).status).toBe(404);

    const verified = await personal.post('/v1/brand/domain/verify');
    expect(verified.body.domain.status).toBe('ACTIVE');
    expect(lastEvent(ctx, 'custom_domain.active').payload.domain).toBe(host);

    const pub = await ctx.http.get(`/v1/public/brand?host=${host}`);
    expect(pub.body).toMatchObject({ tenantId: w.tenantId, displayName: 'Studio Host' });

    // Outro personal não pode usar o mesmo domínio.
    const other = await seedWorld(ctx, 'PRO_PLUS');
    const taken = await as(ctx, await login(ctx, other.ownerEmail), other.tenantId).put(
      '/v1/brand/domain',
      { domain: host },
    );
    expect(taken.status).toBe(409);
    expect((await ctx.http.get('/v1/public/brand?host=nao-existe.com.br')).status).toBe(404);
  });
});

// ─── 3.4 / 3.5 Integrações ──────────────────────────────────────────────────

describe('integrações', () => {
  it('WhatsApp: opt-in registrado em consents e revogável', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 1);
    const aluno = as(ctx, await login(ctx, w.studentEmails[0]!));
    const bad = await aluno.put('/v1/integrations/whatsapp', { granted: true });
    expect(bad.status).toBe(400);
    const ok = await aluno.put('/v1/integrations/whatsapp', {
      granted: true,
      phone: '+5511988887777',
    });
    expect(ok.body).toEqual({ optedIn: true, phone: '+5511988887777' });
    const off = await aluno.put('/v1/integrations/whatsapp', { granted: false });
    expect(off.body.optedIn).toBe(false);
    const rows = await ctx.db.consent.findMany({
      where: { userId: w.studentUserIds[0]!, type: 'WHATSAPP' },
      orderBy: { grantedAt: 'asc' },
    });
    expect(rows.map((r) => r.granted)).toEqual([true, false]);
  });

  it('Google Calendar: OAuth, envio de aulas e mudanças vindas do Google', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 1);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const { url } = (await personal.post('/v1/integrations/google/connect')).body;
    const state = new URL(url).searchParams.get('state')!;
    const cb = await ctx.http.get(`/v1/integrations/google/callback?code=abc&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain('google=ok');
    const status = await personal.get('/v1/integrations/google');
    expect(status.body).toMatchObject({ connected: true, email: 'personal@gmail.test' });

    const start = new Date(Date.now() + 5 * 86_400_000);
    start.setUTCHours(13, 0, 0, 0);
    const appt = await personal.post('/v1/schedule/appointments', {
      title: 'Avaliação',
      type: 'IN_PERSON',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    });
    expect(appt.status, JSON.stringify(appt.body)).toBe(201);
    await until(async () =>
      [...calendar.events.values()].some((e) => e.vettaAppointmentId === appt.body.id),
    );
    const gEvent = [...calendar.events.values()].find(
      (e) => e.vettaAppointmentId === appt.body.id,
    )!;

    // O personal move a aula no Google; um evento externo vira bloqueio.
    const moved = new Date(start.getTime() + 2 * 3_600_000);
    calendar.pending = [
      {
        ...gEvent,
        start: moved,
        end: new Date(moved.getTime() + 3_600_000),
        updated: new Date(Date.now() + 1000),
      },
      {
        ...gEvent,
        id: 'externo-1',
        summary: 'Dentista',
        vettaAppointmentId: null,
        updated: new Date(),
      },
    ];
    const integration = await ctx.db.calendarIntegration.findFirstOrThrow({
      where: { tenantId: w.tenantId },
    });
    const hook = await ctx.http
      .post('/v1/integrations/google/webhook')
      .set('x-goog-channel-id', integration.channelId!)
      .set('x-goog-channel-token', integration.channelToken!)
      .set('x-goog-resource-state', 'exists');
    expect(hook.body).toEqual({ ok: true });
    const updated = await ctx.db.appointment.findUniqueOrThrow({ where: { id: appt.body.id } });
    expect(updated.startsAt.toISOString()).toBe(moved.toISOString());
    expect(
      await ctx.db.scheduleBlock.count({ where: { googleEventId: 'externo-1', deletedAt: null } }),
    ).toBe(1);

    // Token do canal errado é ignorado.
    const forged = await ctx.http
      .post('/v1/integrations/google/webhook')
      .set('x-goog-channel-id', integration.channelId!)
      .set('x-goog-channel-token', 'errado');
    expect(forged.body).toEqual({ ok: false });

    await personal.delete('/v1/integrations/google');
    expect(
      await ctx.db.scheduleBlock.count({ where: { googleEventId: 'externo-1', deletedAt: null } }),
    ).toBe(0);
  });

  it('saúde: importação idempotente e personal só vê com consentimento', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 1);
    const aluno = as(ctx, await login(ctx, w.studentEmails[0]!), w.tenantId);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const sample = {
      source: 'HEALTH_CONNECT',
      type: 'STEPS',
      externalId: 'hc-1',
      startAt: new Date(Date.now() - 3_600_000).toISOString(),
      endAt: new Date().toISOString(),
      value: 9000,
      unit: 'count',
    };
    await aluno.post('/v1/integrations/health/samples', { samples: [sample] });
    await aluno.post('/v1/integrations/health/samples', { samples: [{ ...sample, value: 9500 }] });
    const mine = await aluno.get('/v1/integrations/health/samples?type=STEPS');
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].value).toBe(9500);

    await ctx.db.consent.deleteMany({
      where: { userId: w.studentUserIds[0]!, type: 'HEALTH_DATA' },
    });
    const hidden = await personal.get(`/v1/integrations/health/students/${w.studentLinkIds[0]}`);
    expect(hidden.body).toEqual({ consent: false, samples: [] });
    await ctx.db.consent.create({
      data: {
        userId: w.studentUserIds[0]!,
        tenantId: w.tenantId,
        type: 'HEALTH_DATA',
        version: 't',
        granted: true,
      },
    });
    const shown = await personal.get(`/v1/integrations/health/students/${w.studentLinkIds[0]}`);
    expect(shown.body.consent).toBe(true);
    expect(shown.body.samples).toHaveLength(1);
  });

  it('exportações CSV e PDF', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 1);
    const personal = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const csv = await personal.get('/v1/exports/students');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Aluno 0');
    const pdf = await personal
      .get('/v1/exports/workouts?format=pdf')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const pro = await seedWorld(ctx, 'PRO');
    expect(
      (await as(ctx, await login(ctx, pro.ownerEmail), pro.tenantId).get('/v1/exports/students'))
        .status,
    ).toBe(402);
  });
});

// ─── 3.6 Relatórios ─────────────────────────────────────────────────────────

describe('relatórios avançados', () => {
  it('coorte, aderência, receita, inadimplência, risco e exercícios', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 2);
    const r = await as(ctx, await login(ctx, w.ownerEmail), w.tenantId).get(
      '/v1/reports/overview?months=3',
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.retention).toHaveLength(3);
    expect(r.body).toHaveProperty('adherence.average');
    expect(r.body).toHaveProperty('delinquency.rate');
    expect(Array.isArray(r.body.revenue.byPlan)).toBe(true);
    expect(Array.isArray(r.body.atRisk)).toBe(true);
    expect(r.body.topExercises.length).toBeGreaterThan(0);
  });
});

// ─── 3.7 Academy e comunicados ──────────────────────────────────────────────

describe('Academy e comunicados da plataforma', () => {
  it('acesso por plano e progresso', async () => {
    const { token } = await adminToken(ctx);
    const admin = as(ctx, token);
    const slug = `curso-${Date.now()}`;
    const created = await admin.post('/v1/admin/academy', {
      type: 'COURSE',
      slug,
      title: 'Periodização na prática',
      requiredPlan: 'PRO_PLUS',
      status: 'PUBLISHED',
      lessons: [{ title: 'Aula 1' }, { title: 'Aula 2' }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const pro = await seedWorld(ctx, 'PRO');
    const proClient = as(ctx, await login(ctx, pro.ownerEmail), pro.tenantId);
    const list = await proClient.get('/v1/academy');
    expect(list.body.find((c: { slug: string }) => c.slug === slug)).toMatchObject({
      locked: true,
    });
    expect((await proClient.get(`/v1/academy/${slug}`)).status).toBe(403);

    const plus = await seedWorld(ctx, 'PRO_PLUS');
    const plusClient = as(ctx, await login(ctx, plus.ownerEmail), plus.tenantId);
    const course = await plusClient.get(`/v1/academy/${slug}`);
    expect(course.body.lessons).toHaveLength(2);
    await plusClient.put(`/v1/academy/lessons/${course.body.lessons[0].id}/progress`, {
      completed: true,
    });
    const after = await plusClient.get('/v1/academy');
    expect(after.body.find((c: { slug: string }) => c.slug === slug)).toMatchObject({
      locked: false,
      progress: 50,
    });
  });

  it('comunicado segmentado por plano com métricas de entrega e abertura', async () => {
    const plus = await seedWorld(ctx, 'PRO_PLUS');
    const free = await seedWorld(ctx, 'FREE');
    const { token } = await adminToken(ctx);
    const admin = as(ctx, token);
    const preview = await admin.post('/v1/admin/broadcasts/preview', { plans: ['PRO_PLUS'] });
    expect(preview.body.recipients).toBeGreaterThan(0);
    const b = await admin.post('/v1/admin/broadcasts', {
      title: 'Novo: IA de treino',
      body: 'Gere treinos com IA e revise antes de publicar.',
      channels: ['IN_APP'],
      segment: { plans: ['PRO_PLUS'] },
    });
    const sent = await admin.post(`/v1/admin/broadcasts/${b.body.id}/send`, {});
    expect(sent.body.status).toBe('SENT');
    const events = ctx.events
      .of('platform.broadcast')
      .filter((e) => e.payload.broadcastId === b.body.id);
    const users = events.map((e) => e.payload.userId);
    expect(users).toContain(plus.ownerUserId);
    expect(users).not.toContain(free.ownerUserId);

    await as(ctx, await login(ctx, plus.ownerEmail)).post(
      `/v1/platform-broadcasts/${b.body.id}/opened`,
    );
    const stats = (await admin.get('/v1/admin/broadcasts')).body.find(
      (x: { id: string }) => x.id === b.body.id,
    );
    expect(stats.delivered).toBe(users.length);
    expect(stats.opened).toBe(1);
    // Reenviar não duplica.
    expect((await admin.post(`/v1/admin/broadcasts/${b.body.id}/send`, {})).status).toBe(400);
  });
});

// ─── 3.8 Suporte ────────────────────────────────────────────────────────────

describe('suporte', () => {
  it('prioridade e SLA pelo plano, resposta do admin e estouro de SLA', async () => {
    const plus = await seedWorld(ctx, 'PRO_PLUS');
    const client = as(ctx, await login(ctx, plus.ownerEmail), plus.tenantId);
    const t = await client.post('/v1/support/tickets', {
      subject: 'Erro ao publicar',
      category: 'bug',
      body: 'Ao publicar o treino aparece um erro.',
    });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    expect(t.body).toMatchObject({ priority: 'URGENT', planCode: 'PRO_PLUS' });
    const due =
      new Date(t.body.firstResponseDueAt).getTime() - new Date(t.body.createdAt).getTime();
    expect(Math.round(due / 3_600_000)).toBe(4);
    expect(lastEvent(ctx, 'support.ticket_created').payload.ticketId).toBe(t.body.id);

    const free = await seedWorld(ctx, 'FREE');
    // A fixture cria overrides para cobrir a tabela; aqui vale o plano puro.
    await ctx.db.tenantFeatureOverride.deleteMany({ where: { tenantId: free.tenantId } });
    await ctx.cache.invalidateTenant(free.tenantId);
    const tf = await as(ctx, await login(ctx, free.ownerEmail), free.tenantId).post(
      '/v1/support/tickets',
      { subject: 'Dúvida simples', category: 'other', body: 'Como cadastro um aluno?' },
    );
    expect(tf.body, JSON.stringify(tf.body)).toMatchObject({ priority: 'LOW' });

    const { token } = await adminToken(ctx);
    const admin = as(ctx, token);
    const queue = await admin.get('/v1/admin/support/tickets');
    const ids = queue.body.items.map((i: { id: string }) => i.id);
    expect(ids.indexOf(t.body.id)).toBeLessThan(ids.indexOf(tf.body.id));

    await admin.post(`/v1/admin/support/tickets/${t.body.id}/messages`, {
      body: 'Nota interna',
      internal: true,
    });
    await admin.post(`/v1/admin/support/tickets/${t.body.id}/messages`, { body: 'Corrigido!' });
    expect(lastEvent(ctx, 'support.ticket_replied').payload.ticketId).toBe(t.body.id);
    const mine = await client.get(`/v1/support/tickets/${t.body.id}`);
    expect(mine.body.status).toBe('WAITING_USER');
    expect(mine.body.messages.map((m: { body: string }) => m.body)).toEqual([
      'Ao publicar o treino aparece um erro.',
      'Corrigido!',
    ]);

    // Outro personal não vê o chamado.
    expect(
      (
        await as(ctx, await login(ctx, free.ownerEmail), free.tenantId).get(
          `/v1/support/tickets/${t.body.id}`,
        )
      ).status,
    ).toBe(404);

    // SLA estourado pelo job.
    await ctx.db.supportTicket.update({
      where: { id: tf.body.id },
      data: { firstResponseDueAt: new Date(Date.now() - 1000) },
    });
    await markSupportSlaBreaches(ctx.db);
    const late = await admin.get('/v1/admin/support/tickets?breached=true');
    expect(late.body.items.map((i: { id: string }) => i.id)).toContain(tf.body.id);
  });
});

// ─── Assistente e tenant: IA respeita escopo ───────────────────────────────

describe('escopo da IA', () => {
  it('assistente não usa a IA com aluno não atribuído', async () => {
    const w = await seedWorld(ctx, 'PRO_PLUS', 2);
    const asst = await addAssistant(ctx, w, [w.studentLinkIds[0]!]);
    const client = as(ctx, await login(ctx, asst.email), w.tenantId);
    replay = new ReplayMessagesClient(WEEKLY_SUMMARY_RECORDING);
    const res = await client.post('/v1/ai/weekly-summary', { studentLinkId: w.studentLinkIds[1] });
    expect(res.status).toBe(404);
    expect(replay.requests).toHaveLength(0);
  });
});
