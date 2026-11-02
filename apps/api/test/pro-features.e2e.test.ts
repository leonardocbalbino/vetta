import { seedDevExercises } from '@vetta/db/testing';
import {
  appointmentReminders,
  reapplyAnamnesis,
  sendScheduledBroadcasts,
  switchPeriodizationPhases,
  zonedToUtc,
} from '@vetta/server';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createTestContext, login, seedWorld, uploadFile, type TestContext } from './harness';

/** Agenda, chat, comunicados, periodização, anamnese, postural, documentos e PDF (Pro). */
let ctx: TestContext;
let tenantId: string;
let personal: ReturnType<typeof as>;
let aluno: ReturnType<typeof as>;
let aluno2: ReturnType<typeof as>;
let linkId: string;
let link2Id: string;
let exerciseId: string;
const TZ = 'America/Sao_Paulo';
const jobDeps = () => ({ db: ctx.db, publisher: ctx.events });

const jpeg = () =>
  sharp({ create: { width: 600, height: 900, channels: 3, background: '#2F5BFF' } })
    .jpeg()
    .toBuffer();
const dateIn = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
};

beforeAll(async () => {
  ctx = await createTestContext();
  await seedDevExercises(ctx.db);
  exerciseId = (await ctx.db.exercise.findFirstOrThrow({ where: { tenantId: null } })).id;
  const w = await seedWorld(ctx, 'PRO', 2);
  tenantId = w.tenantId;
  [linkId, link2Id] = w.studentLinkIds as [string, string];
  personal = as(ctx, await login(ctx, w.ownerEmail), tenantId);
  aluno = as(ctx, await login(ctx, w.studentEmails[0]!), tenantId);
  aluno2 = as(ctx, await login(ctx, w.studentEmails[1]!), tenantId);
});
afterAll(async () => ctx?.close());

describe('agenda', () => {
  it('disponibilidade semanal vira horários livres; aluno agenda, confirma e cancela dentro da política', async () => {
    const target = dateIn(3);
    const weekday = new Date(`${target}T12:00:00Z`).getUTCDay();
    const av = await personal.put('/v1/schedule/availability', {
      rules: [
        {
          weekday,
          startMinute: 7 * 60,
          endMinute: 10 * 60,
          slotMinutes: 60,
          type: 'IN_PERSON',
          location: 'Estúdio Centro',
        },
      ],
    });
    expect(av.status, JSON.stringify(av.body)).toBe(200);
    const overlap = await personal.put('/v1/schedule/availability', {
      rules: [
        { weekday, startMinute: 420, endMinute: 600, slotMinutes: 60 },
        { weekday, startMinute: 540, endMinute: 660, slotMinutes: 60 },
      ],
    });
    expect(overlap.status).toBe(400);
    // Bloqueio das 9h às 10h.
    await personal.post('/v1/schedule/blocks', {
      startsAt: zonedToUtc(target, '09:00', TZ).toISOString(),
      endsAt: zonedToUtc(target, '10:00', TZ).toISOString(),
      reason: 'Consulta médica',
    });
    const from = zonedToUtc(target, '00:00', TZ).toISOString();
    const to = zonedToUtc(target, '23:59', TZ).toISOString();
    const slots = await aluno.get(`/v1/schedule/slots?from=${from}&to=${to}`);
    expect(slots.status, JSON.stringify(slots.body)).toBe(200);
    expect(slots.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      zonedToUtc(target, '07:00', TZ).toISOString(),
      zonedToUtc(target, '08:00', TZ).toISOString(),
    ]);
    const book = await aluno.post('/v1/schedule/book', { startsAt: slots.body.slots[0].startsAt });
    expect(book.status, JSON.stringify(book.body)).toBe(201);
    expect(book.body.location).toBe('Estúdio Centro');
    // Horário ocupado some e não pode ser reservado de novo.
    const again = await aluno2.post('/v1/schedule/book', {
      startsAt: slots.body.slots[0].startsAt,
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SLOT_UNAVAILABLE');
    expect(
      (await aluno.post(`/v1/schedule/appointments/${book.body.id}/confirm`)).body.status,
    ).toBe('CONFIRMED');
    // O aluno só vê as aulas dele.
    const mine = await aluno2.get(`/v1/schedule/appointments?from=${from}&to=${to}`);
    expect(mine.body).toHaveLength(0);
    expect((await aluno.post(`/v1/schedule/appointments/${book.body.id}/leave`)).status).toBe(200);
    expect(ctx.events.of('appointment.canceled').length).toBeGreaterThan(0);
  });

  it('cancelamento fora da política é recusado; turma com capacidade, recorrência e presença', async () => {
    await personal.put('/v1/schedule/settings', { bookingMinHours: 2, cancelMinHours: 24 });
    const soon = new Date(Date.now() + 5 * 3_600_000);
    const one = await personal.post('/v1/schedule/appointments', {
      title: 'Avaliação',
      type: 'ONLINE',
      meetingUrl: 'https://meet.example.com/abc',
      startsAt: soon.toISOString(),
      endsAt: new Date(soon.getTime() + 3_600_000).toISOString(),
      studentLinkIds: [linkId],
    });
    expect(one.status, JSON.stringify(one.body)).toBe(201);
    const late = await aluno.post(`/v1/schedule/appointments/${one.body.id}/leave`);
    expect(late.status).toBe(400);
    expect(late.body.message).toMatch(/24 h/);

    const start = zonedToUtc(dateIn(10), '18:00', TZ);
    const turma = await personal.post('/v1/schedule/appointments', {
      title: 'Funcional em grupo',
      type: 'IN_PERSON',
      location: 'Parque',
      capacity: 2,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
      recurrenceRule:
        'FREQ=WEEKLY;BYDAY=' +
        ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][
          new Date(`${dateIn(10)}T12:00:00Z`).getUTCDay()
        ] +
        ';COUNT=4',
      studentLinkIds: [linkId],
    });
    expect(turma.status, JSON.stringify(turma.body)).toBe(201);
    expect(turma.body.occurrences).toBe(4);
    // Conflito com a série.
    const clash = await personal.post('/v1/schedule/appointments', {
      title: 'Outro',
      type: 'IN_PERSON',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 1_800_000).toISOString(),
    });
    expect(clash.status).toBe(409);
    // Aluno 2 vê a turma com vaga e entra; terceiro não cabe.
    const r = await aluno2.get(
      `/v1/schedule/slots?from=${new Date(start.getTime() - 3_600_000).toISOString()}&to=${new Date(start.getTime() + 3_600_000).toISOString()}`,
    );
    expect(r.body.classes[0]).toMatchObject({ appointmentId: turma.body.id, spotsLeft: 1 });
    expect(
      (
        await aluno2.post('/v1/schedule/book', {
          startsAt: start.toISOString(),
          appointmentId: turma.body.id,
        })
      ).status,
    ).toBe(201);
    const full = await personal.post(`/v1/schedule/appointments/${turma.body.id}/attendees`, {
      studentLinkId: link2Id,
    });
    expect(full.status).toBe(409);
    const att = await personal.post(`/v1/schedule/appointments/${turma.body.id}/attendance`, {
      items: [
        { studentLinkId: linkId, status: 'ATTENDED' },
        { studentLinkId: link2Id, status: 'NO_SHOW' },
      ],
    });
    expect(att.body.status).toBe('DONE');
    expect(att.body.attendees.map((a: { status: string }) => a.status).sort()).toEqual([
      'ATTENDED',
      'NO_SHOW',
    ]);
  });

  it('lembretes 24 h e 1 h antes, uma vez cada', async () => {
    const start = new Date(Date.now() + 20 * 3_600_000);
    const a = await personal.post('/v1/schedule/appointments', {
      title: 'Treino individual',
      type: 'IN_PERSON',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
      studentLinkIds: [link2Id],
    });
    expect(a.status).toBe(201);
    await appointmentReminders(jobDeps());
    await appointmentReminders(jobDeps());
    const r24 = ctx.events
      .of('appointment.reminder')
      .filter((e) => e.payload.appointmentId === a.body.id);
    expect(r24).toHaveLength(1);
    expect(r24[0]!.payload.when).toBe('amanhã');
    await appointmentReminders(jobDeps(), new Date(start.getTime() - 50 * 60_000));
    const all = ctx.events
      .of('appointment.reminder')
      .filter((e) => e.payload.appointmentId === a.body.id);
    expect(all.map((e) => e.payload.when)).toEqual(['amanhã', 'em 1 hora']);
  });
});

describe('chat e comunicados', () => {
  let conversationId: string;

  it('texto em tempo real, idempotente por clientId, status lido, busca e paginação', async () => {
    const conv = await aluno.get('/v1/chat/conversations');
    expect(conv.status).toBe(200);
    conversationId = conv.body[0].id;
    const clientId = randomUUID();
    const m1 = await aluno.post(`/v1/chat/conversations/${conversationId}/messages`, {
      clientId,
      type: 'TEXT',
      body: 'Oi! Posso trocar o treino de quinta?',
    });
    expect(m1.status, JSON.stringify(m1.body)).toBe(201);
    expect(m1.body).toMatchObject({ status: 'SENT', fromStaff: false });
    const dup = await aluno.post(`/v1/chat/conversations/${conversationId}/messages`, {
      clientId,
      type: 'TEXT',
      body: 'Oi! Posso trocar o treino de quinta?',
    });
    expect(dup.body.id).toBe(m1.body.id);
    expect(ctx.events.of('chat.message_created').at(-1)!.payload.preview).toContain('quinta');

    const list = await personal.get('/v1/chat/conversations');
    expect(
      list.body.find((c: { id: string }) => c.id === conversationId).unread,
    ).toBeGreaterThanOrEqual(1);
    await personal.post(`/v1/chat/conversations/${conversationId}/read`);
    const seen = await aluno.get(`/v1/chat/conversations/${conversationId}/messages`);
    expect(seen.body.items[0].status).toBe('READ');

    for (let i = 0; i < 5; i++)
      await personal.post(`/v1/chat/conversations/${conversationId}/messages`, {
        clientId: randomUUID(),
        type: 'TEXT',
        body: `Mensagem ${i}`,
      });
    const p1 = await aluno.get(`/v1/chat/conversations/${conversationId}/messages?limit=3`);
    expect(p1.body.items).toHaveLength(3);
    expect(p1.body.items[0].body).toBe('Mensagem 4');
    const p2 = await aluno.get(
      `/v1/chat/conversations/${conversationId}/messages?limit=3&before=${p1.body.nextBefore}`,
    );
    expect(p2.body.items.map((m: { body: string }) => m.body)).toEqual([
      'Mensagem 1',
      'Mensagem 0',
      'Oi! Posso trocar o treino de quinta?',
    ]);
    const search = await personal.get(`/v1/chat/conversations/${conversationId}/messages?q=QUINTA`);
    expect(search.body.items).toHaveLength(1);
    // Aluno não lê conversa de outro aluno.
    expect((await aluno2.get(`/v1/chat/conversations/${conversationId}/messages`)).status).toBe(
      404,
    );
  });

  it('mídia (imagem e áudio) no Pro; FREE só texto (402 comms.chat_media)', async () => {
    const img = await uploadFile(ctx, aluno, {
      purpose: 'chat_media',
      fileName: 'foto.jpg',
      mimeType: 'image/jpeg',
      body: await jpeg(),
    });
    const m = await aluno.post(`/v1/chat/conversations/${conversationId}/messages`, {
      clientId: randomUUID(),
      type: 'IMAGE',
      mediaId: img,
    });
    expect(m.status, JSON.stringify(m.body)).toBe(201);
    expect(m.body.media.url).toMatch(/^http/);
    const wrong = await aluno.post(`/v1/chat/conversations/${conversationId}/messages`, {
      clientId: randomUUID(),
      type: 'AUDIO',
      mediaId: img,
    });
    expect(wrong.status).toBe(400);

    const free = await seedWorld(ctx, 'FREE');
    const fs = as(ctx, await login(ctx, free.studentEmails[0]!), free.tenantId);
    const fc = (await fs.get('/v1/chat/conversations')).body[0].id;
    expect(
      (
        await fs.post(`/v1/chat/conversations/${fc}/messages`, {
          clientId: randomUUID(),
          type: 'TEXT',
          body: 'Olá',
        })
      ).status,
    ).toBe(201);
    const up = await fs.post('/v1/uploads', {
      purpose: 'chat_media',
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 1000,
    });
    expect(up.status).toBe(402);
    expect(up.body.details.feature).toBe('comms.chat_media');
  });

  it('responder o feedback abre o chat com a citação do treino', async () => {
    const p = await personal.post('/v1/programs', {
      studentLinkId: linkId,
      name: 'Base',
      publish: true,
      routines: [{ label: 'A', items: [{ exerciseId, sets: [{ reps: '10', targetLoadKg: 20 }] }] }],
    });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    const routine = p.body.routines[0];
    const s = await aluno.post('/v1/training/sessions', {
      clientSessionId: randomUUID(),
      programId: p.body.id,
      routineId: routine.id,
      startedAt: new Date(Date.now() - 3_600_000).toISOString(),
      finishedAt: new Date().toISOString(),
      sets: [
        {
          routineExerciseId: routine.exercises[0].id,
          exerciseId,
          setOrder: 0,
          reps: 10,
          loadKg: 20,
        },
      ],
      feedback: { rating: 2, perceivedEffort: 9, hasPain: false, comment: 'Muito pesado' },
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    const r = await personal.post(`/v1/feedbacks/${s.body.sessionId}/reply`, {
      message: 'Vamos ajustar a carga.',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const msgs = await aluno.get(
      `/v1/chat/conversations/${r.body.conversationId}/messages?limit=1`,
    );
    expect(msgs.body.items[0]).toMatchObject({
      body: 'Vamos ajustar a carga.',
      fromStaff: true,
      quote: { kind: 'workout_session', rating: 2, comment: 'Muito pesado' },
    });
  });

  it('comunicado por filtro, agendado e com taxa de abertura', async () => {
    const count = await personal.post('/v1/broadcasts/audience', {
      audience: { studentLinkIds: [linkId] },
    });
    expect(count.body.count).toBe(1);
    const now = await personal.post('/v1/broadcasts', {
      title: 'Feriado',
      body: 'Sem aulas na segunda.',
      audience: { all: true },
      channels: ['IN_APP', 'PUSH'],
    });
    expect(now.status, JSON.stringify(now.body)).toBe(201);
    expect(now.body).toMatchObject({ status: 'SENT', recipientsCount: 2 });
    const ev = ctx.events.of('broadcast.sent').at(-1)!;
    expect(ev.payload.channels).toEqual(['IN_APP', 'PUSH']);
    // Simula a entrega in-app e a leitura de um aluno.
    const users = ev.payload.userIds as string[];
    for (const u of users)
      await ctx.db.notification.create({
        data: {
          userId: u,
          tenantId,
          eventId: ev.id,
          event: 'broadcast.sent',
          category: 'CHAT',
          title: 'Feriado',
          body: 'x',
        },
      });
    await ctx.db.notification.updateMany({
      where: { eventId: ev.id, userId: users[0] },
      data: { readAt: new Date() },
    });
    expect((await personal.get(`/v1/broadcasts/${now.body.id}`)).body).toMatchObject({
      openedCount: 1,
      openRate: 50,
    });

    const later = await personal.post('/v1/broadcasts', {
      title: 'Desafio',
      body: 'Desafio de 30 dias começa amanhã!',
      audience: { filter: { inactiveDays: 30 } },
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(later.body.status).toBe('SCHEDULED');
    expect(await sendScheduledBroadcasts(jobDeps())).toBe(0);
    expect(await sendScheduledBroadcasts(jobDeps(), new Date(Date.now() + 2 * 3_600_000))).toBe(1);
    expect((await personal.get(`/v1/broadcasts/${later.body.id}`)).body.status).toBe('SENT');
  });
});

describe('periodização', () => {
  it('blocos por semanas com progressão e deload; calendário; troca automática de rotina; treino do dia ajustado', async () => {
    const mk = (name: string, load: number) =>
      personal.post('/v1/programs', {
        studentLinkId: link2Id,
        name,
        routines: [
          {
            label: 'A',
            items: [
              {
                exerciseId,
                sets: [
                  { reps: '8-12', targetLoadKg: load },
                  { reps: '8-12', targetLoadKg: load },
                  { reps: '8-12', targetLoadKg: load },
                ],
              },
            ],
          },
        ],
      });
    const p1 = await mk('Acumulação', 100);
    const p2 = await mk('Intensificação', 120);
    const startsOn = dateIn(-7); // começou há uma semana: estamos na semana 2
    const res = await personal.post('/v1/periodizations', {
      studentLinkId: link2Id,
      name: 'Macrociclo hipertrofia',
      model: 'LINEAR',
      startsOn,
      phases: [
        {
          name: 'Acumulação',
          weeks: 4,
          programId: p1.body.id,
          progression: { model: 'LINEAR', perWeek: { loadPct: 5, repsDelta: -1 }, deloadEvery: 4 },
        },
        {
          name: 'Intensificação',
          weeks: 3,
          programId: p2.body.id,
          progression: { model: 'UNDULATING', wave: [{ repsDelta: -2 }, { loadPct: 5 }] },
        },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.current).toMatchObject({ phaseIndex: 0, week: 2 });
    expect(
      res.body.phases[0].schedule.map((w: { loadPct: number; deload: boolean }) => [
        w.loadPct,
        w.deload,
      ]),
    ).toEqual([
      [0, false],
      [5, false],
      [10, false],
      [-1, true],
    ]);
    const invalid = await personal.post('/v1/periodizations', {
      ...res.body,
      studentLinkId: link2Id,
      phases: [{ name: 'X', weeks: 2, progression: { model: 'UNDULATING' } }],
    });
    expect(invalid.status).toBe(400);

    expect(await switchPeriodizationPhases(jobDeps())).toBeGreaterThanOrEqual(1);
    const phaseEvents = () =>
      ctx.events
        .of('periodization.phase_started')
        .filter((e) => e.payload.periodizationId === res.body.id);
    expect(phaseEvents()).toHaveLength(1);
    expect(
      (await ctx.db.workoutProgram.findUniqueOrThrow({ where: { id: p1.body.id } })).status,
    ).toBe('ACTIVE');
    expect(phaseEvents()[0]!.payload.phaseName).toBe('Acumulação');
    await switchPeriodizationPhases(jobDeps());
    expect(phaseEvents()).toHaveLength(1);

    const today = await aluno2.get('/v1/training/today');
    const prog = today.body.programs.find((p: { id: string }) => p.id === p1.body.id);
    expect(prog.periodization).toMatchObject({ phase: 'Acumulação', week: 2, deload: false });
    const sets = prog.routines[0].exercises[0].sets;
    expect(
      sets.map((s: { reps: string; targetLoadKg: number }) => [s.reps, Number(s.targetLoadKg)]),
    ).toEqual([
      ['7-11', 105],
      ['7-11', 105],
      ['7-11', 105],
    ]);

    // Quatro semanas depois: troca para a fase 2 e publica o outro programa.
    await switchPeriodizationPhases(jobDeps(), new Date(Date.now() + 22 * 86_400_000));
    expect(phaseEvents()).toHaveLength(2);
    expect(
      (await ctx.db.workoutProgram.findUniqueOrThrow({ where: { id: p1.body.id } })).status,
    ).toBe('ARCHIVED');
    expect(
      (await ctx.db.workoutProgram.findUniqueOrThrow({ where: { id: p2.body.id } })).status,
    ).toBe('ACTIVE');
  });
});

describe('anamnese, postural, documentos e PDF', () => {
  it('construtor com condicionais, nova versão ao editar e reaplicação periódica', async () => {
    const tpl = await personal.post('/v1/anamnesis/templates', {
      name: 'Triagem de lesões',
      questions: [
        { id: 'lesao', type: 'yes_no', label: 'Você tem alguma lesão?', required: true },
        {
          id: 'onde',
          type: 'long_text',
          label: 'Onde e desde quando?',
          required: true,
          showIf: { questionId: 'lesao', equals: true },
        },
        { id: 'dor', type: 'scale', label: 'Dor (0 a 10)', min: 0, max: 10 },
        { id: 'exame', type: 'upload', label: 'Exame (opcional)' },
        { id: 'assinatura', type: 'signature', label: 'Assinatura', required: true },
      ],
    });
    expect(tpl.status, JSON.stringify(tpl.body)).toBe(201);
    const send = await personal.post('/v1/anamnesis/requests', {
      templateId: tpl.body.id,
      studentLinkIds: [linkId],
    });
    const responseId = send.body.ids[0];
    const sig = await uploadFile(ctx, aluno, {
      purpose: 'progress_photo',
      fileName: 'assinatura.jpg',
      mimeType: 'image/jpeg',
      body: await jpeg(),
    });
    const missing = await aluno.post(`/v1/anamnesis/responses/${responseId}/answer`, {
      answers: { lesao: true, assinatura: sig },
      acceptHealthDataConsent: true,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.details.errors).toEqual({ onde: 'Resposta obrigatória.' });
    const ok = await aluno.post(`/v1/anamnesis/responses/${responseId}/answer`, {
      answers: { lesao: false, dor: 3, assinatura: sig },
      acceptHealthDataConsent: true,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    const edited = await personal.put(`/v1/anamnesis/templates/${tpl.body.id}`, {
      name: 'Triagem de lesões v2',
      questions: [{ id: 'lesao', type: 'yes_no', label: 'Você tem alguma lesão?' }],
    });
    expect(edited.body.version).toBe(2);

    const assign = await personal.post('/v1/anamnesis/assignments', {
      templateId: tpl.body.id,
      studentLinkIds: [link2Id],
      repeatEveryDays: 90,
    });
    expect(assign.status, JSON.stringify(assign.body)).toBe(201);
    expect(await reapplyAnamnesis(jobDeps())).toBe(1);
    expect(await reapplyAnamnesis(jobDeps())).toBe(0);
    const a = await ctx.db.anamnesisAssignment.findFirstOrThrow({
      where: { studentLinkId: link2Id },
    });
    expect(a.nextDueOn.toISOString().slice(0, 10)).toBe(dateIn(90));
    expect(
      await ctx.db.anamnesisResponse.count({
        where: { studentLinkId: link2Id, templateId: tpl.body.id, status: 'PENDING' },
      }),
    ).toBe(1);
  });

  it('postural com fotos, marcações e checklist; comparativo mostra a evolução', async () => {
    const photos = [];
    for (const view of ['FRONT', 'BACK', 'LEFT', 'RIGHT']) {
      const id = await uploadFile(ctx, personal, {
        purpose: 'posture_photo',
        fileName: `${view}.jpg`,
        mimeType: 'image/jpeg',
        body: await jpeg(),
        studentLinkId: linkId,
      });
      photos.push({
        view,
        mediaId: id,
        markers: [{ kind: 'line', x1: 0.5, y1: 0, x2: 0.5, y2: 1, label: 'Fio de prumo' }],
      });
    }
    const first = await personal.post(`/v1/students/${linkId}/posture`, {
      assessedAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
      findings: { hipercifose_toracica: 'acentuado', joelho_valgo: 'leve' },
      photos,
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.photos.map((p: { view: string }) => p.view)).toEqual([
      'FRONT',
      'BACK',
      'LEFT',
      'RIGHT',
    ]);
    expect(first.body.photos[0].url).toMatch(/^http/);
    const dupView = await personal.post(`/v1/students/${linkId}/posture`, {
      photos: [photos[0], photos[0]],
    });
    expect(dupView.status).toBe(400);
    const second = await personal.post(`/v1/students/${linkId}/posture`, {
      findings: { hipercifose_toracica: 'moderado', joelho_valgo: 'leve' },
      photos: photos.slice(0, 2),
    });
    const cmp = await personal.get(`/v1/posture/compare?ids=${first.body.id},${second.body.id}`);
    expect(cmp.status).toBe(200);
    expect(
      cmp.body.changes.find((c: { deviation: string }) => c.deviation === 'hipercifose_toracica'),
    ).toMatchObject({ trend: 'improved' });
    expect(cmp.body.views[0].photos).toHaveLength(2);
    // Aluno vê as próprias avaliações (leitura), outro aluno não.
    expect((await aluno.get(`/v1/posture/${first.body.id}`)).status).toBe(200);
    expect((await aluno2.get(`/v1/posture/${first.body.id}`)).status).toBe(404);
  });

  it('pasta de documentos: personal compartilha, aluno vê e baixa; ocultos não aparecem', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'.padEnd(400, ' '));
    const media = await uploadFile(ctx, personal, {
      purpose: 'document',
      fileName: 'plano-alimentar.pdf',
      mimeType: 'application/pdf',
      body: pdf,
      studentLinkId: linkId,
    });
    const d = await personal.post(`/v1/students/${linkId}/documents`, {
      mediaId: media,
      title: 'Plano alimentar',
      category: 'MEAL_PLAN',
    });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    expect(ctx.events.of('document.shared').at(-1)!.payload.title).toBe('Plano alimentar');
    const hiddenMedia = await uploadFile(ctx, personal, {
      purpose: 'document',
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      body: pdf,
      studentLinkId: linkId,
    });
    await personal.post(`/v1/students/${linkId}/documents`, {
      mediaId: hiddenMedia,
      title: 'Notas internas',
      category: 'OTHER',
      visibleToStudent: false,
    });
    const seen = await aluno.get(`/v1/students/${linkId}/documents`);
    const titles = seen.body.map((x: { title: string }) => x.title);
    expect(titles).toContain('Plano alimentar');
    expect(titles).not.toContain('Notas internas');
    expect(
      seen.body.find((x: { title: string }) => x.title === 'Plano alimentar').file.url,
    ).toMatch(/^http/);
    expect((await aluno.delete(`/v1/documents/${d.body.id}`)).status).toBe(404);
  });

  it('PDF do treino: Pro leva a marca do personal; Free leva a Vetta', async () => {
    const p = await personal.post('/v1/programs', {
      studentLinkId: linkId,
      name: 'PDF',
      routines: [{ label: 'A', items: [{ exerciseId, sets: [{ reps: '10', targetLoadKg: 40 }] }] }],
    });
    const pdf = await personal
      .get(`/v1/programs/${p.body.id}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('lembrete de reavaliação a cada N dias', async () => {
    await personal.patch('/v1/tenants/current/settings', { reassessmentDays: 60 });
    const a = await personal.post(`/v1/students/${linkId}/assessments`, {
      protocol: 'NONE',
      sex: 'female',
      weightKg: 60,
      heightCm: 165,
    });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const row = await ctx.db.physicalAssessment.findUniqueOrThrow({ where: { id: a.body.id } });
    expect(row.nextAssessmentOn?.toISOString().slice(0, 10)).toBe(
      new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
    );
  });
});

describe('plano errado = 402 com o plano mínimo', () => {
  it.each([
    ['get', '/v1/finance/summary', 'finance.student_billing'],
    ['get', '/v1/sales-page', 'brand.sales_page'],
    ['get', '/v1/schedule/settings', 'schedule.calendar'],
    ['get', '/v1/broadcasts', 'comms.broadcast'],
    ['get', '/v1/periodizations', 'workouts.periodization'],
    ['put', '/v1/brand/logo', 'assessment.pdf_branding'],
  ] as const)('%s %s → %s', async (method, url, feature) => {
    const free = await seedWorld(ctx, 'FREE');
    const c = as(ctx, await login(ctx, free.ownerEmail), free.tenantId);
    const res = method === 'get' ? await c.get(url) : await c.put(url, { mediaId: null });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'FEATURE_LOCKED',
      details: { feature, requiredPlan: 'PRO' },
    });
  });

  it('posture e documentos no FREE', async () => {
    const free = await seedWorld(ctx, 'FREE');
    const c = as(ctx, await login(ctx, free.ownerEmail), free.tenantId);
    expect(
      (await c.get(`/v1/students/${free.studentLinkIds[0]}/posture`)).body.details.feature,
    ).toBe('assessment.posture');
    expect(
      (await c.get(`/v1/students/${free.studentLinkIds[0]}/documents`)).body.details.feature,
    ).toBe('docs.student_folder');
  });
});
