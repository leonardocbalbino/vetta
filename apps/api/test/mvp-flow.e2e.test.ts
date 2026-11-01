import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDevExercises } from '../../../packages/db/src/seed/exercises';
import { syncGlobalContent } from '@vetta/db';
import {
  adminToken,
  as,
  createTestContext,
  lastEvent,
  login,
  PASSWORD,
  seedWorld,
  type TestContext,
} from './harness';

/**
 * Critério de pronto da Fase 1: personal se cadastra, convida aluno, prescreve;
 * o aluno treina (inclusive sessão offline reenviada) e o personal vê feedback e evolução.
 */
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
  await syncGlobalContent(ctx.db);
  await seedDevExercises(ctx.db);
});
afterAll(async () => ctx?.close());

async function exerciseIds(token: string, tenantId: string, q: string) {
  const r = await as(ctx, token, tenantId).get(`/v1/exercises?q=${encodeURIComponent(q)}`);
  expect(r.status).toBe(200);
  return r.body.items as { id: string; name: string }[];
}

const sessionBody = (o: {
  programId: string;
  routineId: string;
  itemId: string;
  exerciseId: string;
  load: number;
  rating: number;
  pain?: boolean;
  client?: string;
}) => ({
  clientSessionId: o.client ?? randomUUID(),
  programId: o.programId,
  routineId: o.routineId,
  startedAt: new Date(Date.now() - 3600_000).toISOString(),
  finishedAt: new Date().toISOString(),
  sets: [0, 1, 2].map((i) => ({
    routineExerciseId: o.itemId,
    exerciseId: o.exerciseId,
    setOrder: i,
    reps: 10,
    loadKg: o.load,
  })),
  feedback: {
    rating: o.rating,
    perceivedEffort: 7,
    hasPain: !!o.pain,
    painLocation: o.pain ? 'joelho' : null,
    comment: 'Bom treino',
  },
});

describe('fluxo completo do MVP', () => {
  let personal: string;
  let tenantId: string;
  let student: string;
  let studentLinkId: string;
  let programId: string;
  let routineId: string;
  let itemId: string;
  let squatId: string;

  it('1. personal se cadastra (trial Pro Plus) e o admin é avisado', async () => {
    const r = await ctx.http.post('/v1/auth/register').send({
      name: 'Rafa Personal',
      email: 'rafa@mvp.dev',
      password: PASSWORD,
      businessName: 'Rafa Treinos',
      acceptTerms: true,
    });
    expect(r.status).toBe(201);
    personal = r.body.accessToken;
    tenantId = (await as(ctx, personal).get('/v1/me')).body.memberships[0].tenantId;
    expect(lastEvent(ctx, 'personal.registered').payload).toMatchObject({
      tenantName: 'Rafa Treinos',
    });
    const dash = await as(ctx, personal, tenantId).get('/v1/dashboard');
    expect(dash.body.onboarding).toEqual({
      profile: false,
      firstStudent: false,
      firstWorkout: false,
    });
  });

  it('2. convida o aluno (link + WhatsApp) e ele aceita', async () => {
    const inv = await as(ctx, personal, tenantId).post('/v1/students/invites', {
      name: 'Bia Aluna',
      email: 'bia@mvp.dev',
      phone: '+5511988887777',
    });
    expect(inv.status).toBe(201);
    expect(inv.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    const token = lastEvent(ctx, 'student.invited').payload.token as string;
    const acc = await ctx.http
      .post('/v1/invites/accept')
      .send({ token, password: PASSWORD, acceptTerms: true, acceptHealthDataConsent: true });
    expect(acc.status).toBe(200);
    student = acc.body.accessToken;
    studentLinkId = inv.body.studentLinkId;
    await as(ctx, personal, tenantId).patch(`/v1/students/${studentLinkId}`, {
      birthDate: '1995-03-10',
      sex: 'FEMALE',
      tags: ['Manhã', 'Hipertrofia'],
      injuries: 'Condromalácia leve no joelho direito',
      notes: 'Prefere treinar cedo',
    });
    const detail = await as(ctx, personal, tenantId).get(`/v1/students/${studentLinkId}`);
    expect(detail.body.tags).toEqual(['manha', 'hipertrofia']);
    // aluno não vê observações privadas da ficha (rota é só da equipe)
    expect((await as(ctx, student, tenantId).get(`/v1/students/${studentLinkId}`)).status).toBe(
      403,
    );
  });

  it('3. busca na biblioteca ignora acentos', async () => {
    const r = await exerciseIds(personal, tenantId, 'AGACHAMENTO BULGARO');
    expect(r.map((e) => e.name)).toContain('Agachamento búlgaro');
    const bySynonym = await exerciseIds(personal, tenantId, 'hip thrust');
    expect(bySynonym[0]!.name).toBe('Elevação pélvica');
    squatId = (await exerciseIds(personal, tenantId, 'agachamento livre'))[0]!.id;
    const fav = await as(ctx, personal, tenantId).post(`/v1/exercises/${squatId}/favorite`);
    expect(fav.body.favorite).toBe(true);
    const favs = await as(ctx, personal, tenantId).get('/v1/exercises?scope=favorites');
    expect(favs.body.items.map((e: { id: string }) => e.id)).toEqual([squatId]);
    const g = await as(ctx, personal, tenantId).get(`/v1/exercises/${squatId}`);
    expect(g.body.equivalents.length).toBeGreaterThan(0);
  });

  it('4. prescreve programa com bi-set e publica (aluno é notificado)', async () => {
    const [bench] = await exerciseIds(personal, tenantId, 'supino reto');
    const [row] = await exerciseIds(personal, tenantId, 'remada curvada');
    const r = await as(ctx, personal, tenantId).post('/v1/programs', {
      studentLinkId,
      name: 'Hipertrofia — Fase 1',
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10),
      publish: true,
      routines: [
        {
          label: 'A',
          name: 'Inferiores',
          items: [
            {
              exerciseId: squatId,
              restSeconds: 90,
              sets: [
                { type: 'WARMUP', reps: '15', targetLoadKg: 20 },
                { reps: '8-12', targetLoadKg: 40, rir: 2 },
              ],
            },
          ],
        },
        {
          label: 'B',
          name: 'Superiores',
          items: [
            { exerciseId: bench!.id, method: 'BI_SET', groupId: 'g1', sets: [{ reps: '10' }] },
            { exerciseId: row!.id, method: 'BI_SET', groupId: 'g1', sets: [{ reps: '10' }] },
          ],
        },
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.status).toBe('ACTIVE');
    programId = r.body.id;
    routineId = r.body.routines[0].id;
    itemId = r.body.routines[0].exercises[0].id;
    expect(r.body.routines[1].exercises.map((i: { groupKey: string }) => i.groupKey)).toEqual([
      'g1',
      'g1',
    ]);
    expect(lastEvent(ctx, 'workout.published').payload).toMatchObject({
      studentLinkId,
      workoutName: 'Hipertrofia — Fase 1',
    });

    // edição mantém o id do item (histórico continua ligado) e avisa o aluno
    const edit = await as(ctx, personal, tenantId).put(`/v1/programs/${programId}`, {
      name: r.body.name,
      routines: r.body.routines.map(
        (ro: {
          id: string;
          label: string;
          name: string;
          exercises: {
            id: string;
            exerciseId: string;
            method: string;
            groupKey: string | null;
            sets: object[];
          }[];
        }) => ({
          id: ro.id,
          label: ro.label,
          name: ro.name,
          items: ro.exercises.map((i) => ({
            id: i.id,
            exerciseId: i.exerciseId,
            method: i.method,
            groupId: i.groupKey,
            sets: [{ reps: '10-12', targetLoadKg: 42.5 }],
          })),
        }),
      ),
    });
    expect(edit.status).toBe(200);
    expect(edit.body.version).toBe(2);
    expect(edit.body.routines[0].exercises[0].id).toBe(itemId);
    expect(ctx.events.of('workout.updated').length).toBeGreaterThan(0);
  });

  it('5. aluno vê o treino do dia e sincroniza a sessão (offline: reenvio não duplica)', async () => {
    const today = await as(ctx, student, tenantId).get('/v1/training/today');
    expect(today.status).toBe(200);
    expect(today.body.programs[0].nextRoutineId).toBe(routineId);
    const clientId = randomUUID();
    const body = sessionBody({
      programId,
      routineId,
      itemId,
      exerciseId: squatId,
      load: 40,
      rating: 4,
      client: clientId,
    });
    const first = await as(ctx, student, tenantId).post('/v1/training/sessions', body);
    expect(first.status).toBe(201);
    expect(first.body.duplicated).toBe(false);
    expect(first.body.records.map((r: { type: string }) => r.type).sort()).toEqual([
      'MAX_LOAD',
      'MAX_VOLUME',
      'ONE_RM',
    ]);
    const again = await as(ctx, student, tenantId).post('/v1/training/sessions', body);
    expect(again.body).toMatchObject({ duplicated: true, sessionId: first.body.sessionId });
    expect(await ctx.db.workoutSession.count({ where: { clientId } })).toBe(1);

    // próxima rotina em rodízio + carga pré-preenchida pela última execução
    const next = await as(ctx, student, tenantId).get('/v1/training/today');
    expect(next.body.programs[0].nextRoutineId).not.toBe(routineId);
    const itemA = next.body.programs[0].routines[0].exercises[0];
    expect(itemA.lastPerformance.sets[0]).toEqual({ loadKg: 40, reps: 10 });
    expect(itemA.suggestion).toMatchObject({ reason: 'repeat', loadKg: 40 });
  });

  it('6. feedback com dor alerta o personal na hora; recordes são detectados', async () => {
    const r = await as(ctx, student, tenantId).post(
      '/v1/training/sessions',
      sessionBody({
        programId,
        routineId,
        itemId,
        exerciseId: squatId,
        load: 45,
        rating: 2,
        pain: true,
      }),
    );
    expect(r.body.records.find((x: { type: string }) => x.type === 'MAX_LOAD').value).toBe(45);
    const crit = lastEvent(ctx, 'feedback.critical');
    expect(crit.payload).toMatchObject({ sessionId: r.body.sessionId, rating: 2 });
    expect(crit.payload.painText).toContain('joelho');
    expect(ctx.events.of('record.achieved').length).toBeGreaterThan(0);

    const inbox = await as(ctx, personal, tenantId).get('/v1/feedbacks?unread=true');
    expect(inbox.body[0]).toMatchObject({ id: r.body.sessionId, critical: true, hasPain: true });
    const reply = await as(ctx, personal, tenantId).post(
      `/v1/feedbacks/${r.body.sessionId}/reply`,
      { message: 'Vamos ajustar o agachamento. Me conta mais?' },
    );
    expect(reply.status).toBe(201);
    expect(lastEvent(ctx, 'chat.message_created').payload).toMatchObject({
      conversationId: reply.body.conversationId,
    });
    expect(
      (await as(ctx, personal, tenantId).get('/v1/feedbacks?unread=true')).body.find(
        (s: { id: string }) => s.id === r.body.sessionId,
      ),
    ).toBeUndefined();
  });

  it('7. personal vê evolução e dashboard', async () => {
    const prog = await as(ctx, personal, tenantId).get(`/v1/progress/${studentLinkId}`);
    expect(prog.status).toBe(200);
    expect(prog.body.exercises[0].points.map((p: { maxLoadKg: number }) => p.maxLoadKg)).toEqual([
      40, 45,
    ]);
    expect(prog.body.weeklyVolume.at(-1).volumeKg).toBe(2550);
    const hist = await as(ctx, personal, tenantId).get(
      `/v1/progress/${studentLinkId}/exercise?exerciseId=${squatId}`,
    );
    expect(hist.body.sessions).toHaveLength(2);
    const mine = await as(ctx, student, tenantId).get('/v1/progress/me');
    expect(mine.status).toBe(200);
    const dash = await as(ctx, personal, tenantId).get('/v1/dashboard');
    expect(dash.body).toMatchObject({
      activeStudents: 1,
      workoutsToday: 2,
      onboarding: { firstStudent: true, firstWorkout: true },
    });
    const records = await as(ctx, student, tenantId).get('/v1/training/records');
    expect(records.body.find((r: { type: string }) => r.type === 'MAX_LOAD').value).toBe('45');
  });

  it('8. link público: aluno conclui sem login; revogar invalida', async () => {
    const link = await as(ctx, personal, tenantId).post(`/v1/programs/${programId}/public-link`);
    expect(link.body.url).toContain('/t/');
    const pub = await ctx.http.get(`/v1/public/workouts/${link.body.token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.studentFirstName).toBe('Bia');
    expect(pub.body.studentLink).toBeUndefined();
    const done = await ctx.http
      .post(`/v1/public/workouts/${link.body.token}/sessions`)
      .send(
        sessionBody({ programId, routineId, itemId, exerciseId: squatId, load: 40, rating: 5 }),
      );
    expect(done.status).toBe(201);
    await as(ctx, personal, tenantId).delete(`/v1/programs/${programId}/public-link`);
    expect((await ctx.http.get(`/v1/public/workouts/${link.body.token}`)).status).toBe(404);
  });

  it('9. anamnese PAR-Q com risco alerta o personal e registra o consentimento', async () => {
    const templates = await as(ctx, personal, tenantId).get('/v1/anamnesis/templates');
    const parq = templates.body.find((t: { kind: string }) => t.kind === 'PARQ');
    const send = await as(ctx, personal, tenantId).post('/v1/anamnesis/requests', {
      templateId: parq.id,
      studentLinkIds: [studentLinkId],
      dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    expect(send.body.created).toBe(1);
    expect(lastEvent(ctx, 'anamnesis.requested').payload.dueText).toMatch(/até/);
    const pending = await as(ctx, student, tenantId).get('/v1/anamnesis/responses?status=PENDING');
    const id = pending.body[0].id;
    const answers = Object.fromEntries(
      ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'].map((q) => [q, q === 'q5']),
    );
    const noConsent = await as(ctx, student, tenantId).post(
      `/v1/anamnesis/responses/${id}/answer`,
      { answers },
    );
    expect(noConsent.status).toBe(400);
    const ok = await as(ctx, student, tenantId).post(`/v1/anamnesis/responses/${id}/answer`, {
      answers,
      acceptHealthDataConsent: true,
    });
    expect(ok.body).toEqual({ ok: true, hasRisk: true });
    expect(lastEvent(ctx, 'anamnesis.risk').payload).toMatchObject({ studentLinkId });
    expect(
      (
        await as(ctx, student, tenantId).post(`/v1/anamnesis/responses/${id}/answer`, {
          answers,
          acceptHealthDataConsent: true,
        })
      ).status,
    ).toBe(409);
  });

  it('10. avaliação física calcula composição e entra na evolução; PDF vai para a fila', async () => {
    const r = await as(ctx, personal, tenantId).post(`/v1/students/${studentLinkId}/assessments`, {
      protocol: 'POLLOCK_3',
      sex: 'female',
      weightKg: 62,
      heightCm: 165,
      skinfolds: { triceps: 18, suprailiac: 15, thigh: 25 },
      perimeters: { cintura: 70, quadril: 96 },
      nextAssessmentOn: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(r.status).toBe(201);
    expect(r.body.results).toMatchObject({
      bmiClass: 'normal',
      waistHipRisk: 'low',
      sumSkinfolds: 58,
    });
    expect(r.body.results.bodyFatPct).toBeGreaterThan(15);
    const missing = await as(ctx, personal, tenantId).post(
      `/v1/students/${studentLinkId}/assessments`,
      {
        protocol: 'POLLOCK_7',
        sex: 'female',
        weightKg: 62,
        heightCm: 165,
        skinfolds: { triceps: 18 },
      },
    );
    expect(missing.status).toBe(400);
    expect(missing.body.details.missing.length).toBe(6);
    expect(
      (await as(ctx, personal, tenantId).post(`/v1/assessments/${r.body.id}/pdf`)).status,
    ).toBe(202);
    const prog = await as(ctx, personal, tenantId).get(`/v1/progress/${studentLinkId}`);
    expect(prog.body.bodyFat).toHaveLength(1);
  });
});

describe('limites do plano', () => {
  it('FREE: 1 avaliação física por aluno (402 com plano mínimo)', async () => {
    const w = await seedWorld(ctx, 'FREE');
    const t = await login(ctx, w.ownerEmail);
    // a fixture já cria 1 avaliação para o primeiro aluno
    const r = await as(ctx, t, w.tenantId).post(`/v1/students/${w.studentLinkIds[0]}/assessments`, {
      protocol: 'NONE',
      sex: 'male',
      weightKg: 80,
      heightCm: 180,
    });
    expect(r.status).toBe(402);
    expect(r.body).toMatchObject({
      code: 'LIMIT_REACHED',
      details: { feature: 'assessment.physical_per_student', requiredPlan: 'PRO' },
    });
  });

  it('FREE: sem biblioteca própria, modelos, grupos ou link público', async () => {
    const w = await seedWorld(ctx, 'FREE');
    const t = await login(ctx, w.ownerEmail);
    const c = as(ctx, t, w.tenantId);
    expect((await c.post('/v1/exercises', { name: 'Meu exercício' })).body.code).toBe(
      'FEATURE_LOCKED',
    );
    expect((await c.post('/v1/student-groups', { name: 'Turma' })).body.code).toBe(
      'FEATURE_LOCKED',
    );
    expect(
      (await c.post('/v1/programs', { name: 'Modelo', isTemplate: true, routines: [] })).body.code,
    ).toBe('FEATURE_LOCKED');
    const p = await ctx.db.workoutProgram.findFirstOrThrow({ where: { tenantId: w.tenantId } });
    expect((await c.post(`/v1/programs/${p.id}/public-link`)).body.code).toBe('FEATURE_LOCKED');
  });

  it('alerta de limite de alunos em 80% e 100%', async () => {
    const w = await seedWorld(ctx, 'FREE', 1);
    const t = await login(ctx, w.ownerEmail);
    await as(ctx, t, w.tenantId).post('/v1/students/invites', {
      name: 'Segundo',
      delivery: 'LINK',
    });
    expect(ctx.events.of('plan.limit_reached').some((e) => e.tenantId === w.tenantId)).toBe(true);
  });
});

describe('alunos: grupos, filtros, CSV, frequência e sumidos', () => {
  it('fluxo de gestão', async () => {
    const w = await seedWorld(ctx, 'PRO', 3);
    const t = await login(ctx, w.ownerEmail);
    const c = as(ctx, t, w.tenantId);
    const g = await c.post('/v1/student-groups', { name: 'Turma das 7h', color: '#2F5BFF' });
    await c.post(`/v1/student-groups/${g.body.id}/members`, {
      studentLinkIds: w.studentLinkIds.slice(0, 2),
    });
    expect((await c.get(`/v1/students?groupId=${g.body.id}`)).body.items).toHaveLength(2);
    await c.post('/v1/students/bulk', {
      ids: w.studentLinkIds,
      action: 'add_tag',
      tag: 'Promoção',
    });
    expect((await c.get('/v1/students?tag=promocao')).body.items).toHaveLength(3);
    const imp = await c.post('/v1/students/import', {
      csv: 'nome;email;whatsapp;objetivo;tags\nCarlos Lima;carlos@imp.dev;+5511911112222;Emagrecer;novo\n;sem-nome@imp.dev;;;',
      sendInvites: false,
    });
    expect(imp.body).toMatchObject({ rows: 2, created: 1 });
    expect(imp.body.errors[0].line).toBe(3);
    const freq = await c.get('/v1/students/frequency?weeks=4');
    expect(freq.body.weeks).toHaveLength(4);
    await ctx.db.studentLink.updateMany({
      where: { id: w.studentLinkIds[0] },
      data: { lastWorkoutAt: new Date(Date.now() - 10 * 86_400_000) },
    });
    const inactive = await c.get('/v1/students/inactive');
    expect(inactive.body.days).toBe(5);
    expect(inactive.body.items.map((i: { id: string }) => i.id)).toContain(w.studentLinkIds[0]);
    await c.patch('/v1/tenants/current/settings', { inactivityAlertDays: 15 });
    expect(
      (await c.get('/v1/students/inactive')).body.items.map((i: { id: string }) => i.id),
    ).not.toContain(w.studentLinkIds[0]);
    const tl = await c.get(`/v1/students/${w.studentLinkIds[0]}/timeline`);
    expect(tl.body.items.length).toBeGreaterThan(0);
  });
});

describe('admin: biblioteca global, dashboard e personais', () => {
  it('importa CSV, bloqueia/reativa personal e prevê impacto de mudança de plano', async () => {
    const admin = await adminToken(ctx);
    const a = as(ctx, admin.token);
    const csv = [
      'codigo;nome;apelidos;tipo;nivel;musculos_primarios;musculos_secundarios;equipamentos;instrucoes;dicas;erros_comuns;video',
      'IMP-01;Remada cavalinho;t-bar row;força;intermediário;dorsais;bíceps;barra;Puxe;Contraia;Arredondar;remada.mp4',
      'IMP-02;Prancha com toque no ombro;;funcional;iniciante;core;ombros;;;;;',
      ';Sem código;;;;;;;;;;',
    ].join('\n');
    const dry = await a.post('/v1/admin/exercises/import', { csv, dryRun: true });
    expect(dry.body).toMatchObject({ rows: 3, created: 0 });
    const run = await a.post('/v1/admin/exercises/import', { csv });
    expect(run.body).toMatchObject({ created: 2, updated: 0 });
    expect(run.body.errors.map((e: { line: number }) => e.line).sort()).toEqual([2, 4]);
    expect((await a.post('/v1/admin/exercises/import', { csv })).body.updated).toBe(2);
    const imported = await ctx.db.exercise.findFirstOrThrow({
      where: { code: 'IMP-01', tenantId: null },
    });
    expect(imported).toMatchObject({
      category: 'STRENGTH',
      level: 'INTERMEDIATE',
      aliases: ['t-bar row'],
    });

    const dash = await a.get('/v1/admin/dashboard');
    expect(dash.body.tenants).toBeGreaterThan(0);
    const w = await seedWorld(ctx, 'PRO');
    const owner = await login(ctx, w.ownerEmail);
    const detail = await a.get(`/v1/admin/tenants/${w.tenantId}`);
    expect(detail.body.subscription.plan.code).toBe('PRO');
    await a.post(`/v1/admin/tenants/${w.tenantId}/block`, { reason: 'Chargeback em análise' });
    expect((await as(ctx, owner, w.tenantId).get('/v1/tenants/current')).status).toBe(401);
    const fresh = await login(ctx, w.ownerEmail);
    expect((await as(ctx, fresh, w.tenantId).get('/v1/tenants/current')).status).toBe(403);
    await a.post(`/v1/admin/tenants/${w.tenantId}/unblock`);
    expect((await as(ctx, fresh, w.tenantId).get('/v1/tenants/current')).status).toBe(200);

    const impact = await a.get('/v1/admin/plans/PRO/impact?feature=students.max&value=0');
    expect(impact.body.overLimit.map((o: { tenantId: string }) => o.tenantId)).toContain(
      w.tenantId,
    );
    const audit = await a.get('/v1/admin/audit?action=tenant.');
    expect(audit.body.items.map((i: { action: string }) => i.action)).toEqual(
      expect.arrayContaining(['tenant.block', 'tenant.unblock']),
    );
    expect((await ctx.http.get('/v1/legal/terms')).body.title).toBe('Termos de uso');
  });
});
