import type { NotificationDto } from '@vetta/contracts';
import {
  createDomainEvent,
  deliver,
  dispatchEvent,
  UnconfiguredSmsProvider,
  UnconfiguredWhatsAppProvider,
  type DeliveryJobData,
  type EmailMessage,
  type PushProvider,
} from '@vetta/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, createTestContext, login, seedWorld, type TestContext } from './harness';

let ctx: TestContext;
let scheduled: { job: DeliveryJobData; delayMs: number }[];
let emitted: { userId: string; n: NotificationDto }[];

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx?.close());
beforeEach(() => {
  scheduled = [];
  emitted = [];
});

/** 01/11/2026 às HH:MM em São Paulo (UTC-3). */
const spTime = (hh: number, mm = 0) => new Date(Date.UTC(2026, 10, 1, hh + 3, mm));

const deps = (now: Date) => ({
  db: ctx.db,
  redis: ctx.redis,
  now: () => now,
  scheduleDelivery: async (job: DeliveryJobData, delayMs: number) => {
    scheduled.push({ job, delayMs });
  },
  emitInApp: (userId: string, n: NotificationDto) => {
    emitted.push({ userId, n });
  },
});

async function studentWithDevice(plan: 'PRO' | 'PRO_PLUS' = 'PRO') {
  const w = await seedWorld(ctx, plan);
  const token = await login(ctx, w.studentEmails[0]!);
  await as(ctx, token).post('/v1/devices', {
    pushToken: `ExponentPushToken[${Math.random().toString(36).slice(2)}]`,
    platform: 'ANDROID',
  });
  return { w, token, userId: w.studentUserIds[0]!, linkId: w.studentLinkIds[0]! };
}

describe('preferências por categoria e canal', () => {
  it('push desligado para TREINO não é enviado; in-app continua', async () => {
    const { w, token, linkId } = await studentWithDevice();
    const prefs = await as(ctx, token).get('/v1/notifications/preferences');
    expect(prefs.body.quietHours).toEqual({ enabled: true, start: '22:00', end: '07:00' });
    await as(ctx, token).put('/v1/notifications/preferences', {
      items: [{ category: 'TRAINING', channel: 'PUSH', enabled: false }],
      quietHours: prefs.body.quietHours,
    });

    const e = createDomainEvent('workout.published', {
      tenantId: w.tenantId,
      payload: { studentLinkId: linkId, programId: 'p1', workoutName: 'Treino A' },
    });
    const out = await dispatchEvent(deps(spTime(12)), e);
    expect(out.find((o) => o.channel === 'PUSH')).toMatchObject({
      status: 'skipped',
      reason: 'preference',
    });
    expect(out.find((o) => o.channel === 'IN_APP')).toMatchObject({ status: 'sent' });
    expect(scheduled).toHaveLength(0);
    expect(emitted[0]!.n).toMatchObject({ title: 'Treino novo', deepLink: '/treino' });
    expect(emitted[0]!.n.body).toContain('Treino A');

    // sino: lista, contador, marcar como lida
    const list = await as(ctx, token).get('/v1/notifications');
    expect(list.body.items).toHaveLength(1);
    expect((await as(ctx, token).get('/v1/notifications/unread-count')).body.count).toBe(1);
    await as(ctx, token).patch(`/v1/notifications/${list.body.items[0].id}/read`);
    expect((await as(ctx, token).get('/v1/notifications/unread-count')).body.count).toBe(0);
  });

  it('segurança não pode ser desligada', async () => {
    const { token } = await studentWithDevice();
    const res = await as(ctx, token).put('/v1/notifications/preferences', {
      items: [{ category: 'SECURITY', channel: 'EMAIL', enabled: false }],
      quietHours: { enabled: true, start: '22:00', end: '07:00' },
    });
    expect(res.status).toBe(400);
  });
});

describe('horário de silêncio (22h–7h no fuso do usuário)', () => {
  it('push às 23h fica agendado para as 7h; in-app é imediato', async () => {
    const { w, linkId } = await studentWithDevice();
    const now = spTime(23);
    const out = await dispatchEvent(
      deps(now),
      createDomainEvent('workout.published', {
        tenantId: w.tenantId,
        payload: { studentLinkId: linkId, programId: 'p2' },
      }),
    );
    expect(out.find((o) => o.channel === 'IN_APP')?.status).toBe('sent');
    const push = out.find((o) => o.channel === 'PUSH')!;
    expect(push.status).toBe('queued');
    expect(push.scheduledFor!.toISOString()).toBe('2026-11-02T10:00:00.000Z'); // 07:00 em SP
    expect(scheduled[0]!.delayMs).toBe(8 * 3_600_000);
    const log = await ctx.db.deliveryLog.findUniqueOrThrow({
      where: { id: scheduled[0]!.job.deliveryLogId },
    });
    expect(log.status).toBe('QUEUED');
  });

  it('usuário em outro fuso: 23h em SP é 11h em Tóquio, envia na hora', async () => {
    const { w, userId, linkId } = await studentWithDevice();
    await ctx.db.user.update({ where: { id: userId }, data: { timezone: 'Asia/Tokyo' } });
    await dispatchEvent(
      deps(spTime(23)),
      createDomainEvent('workout.published', {
        tenantId: w.tenantId,
        payload: { studentLinkId: linkId, programId: 'p3' },
      }),
    );
    expect(scheduled[0]!.delayMs).toBe(0);
  });

  it('segurança ignora o silêncio', async () => {
    const { userId } = await studentWithDevice();
    const out = await dispatchEvent(
      deps(spTime(2)),
      createDomainEvent('auth.new_login', {
        payload: { userId, device: 'Chrome', ip: '1.2.3.4', when: 'agora' },
      }),
    );
    expect(
      out
        .filter((o) => o.status === 'queued')
        .map((o) => o.channel)
        .sort(),
    ).toEqual(['EMAIL', 'PUSH']);
    expect(scheduled.every((s) => s.delayMs === 0)).toBe(true);
  });
});

describe('plano, agrupamento e entrega', () => {
  it('WhatsApp só no Pro Plus, com opt-in registrado', async () => {
    const pro = await studentWithDevice('PRO');
    await ctx.db.user.update({ where: { id: pro.userId }, data: { phone: '+5511999990000' } });
    const out = await dispatchEvent(
      deps(spTime(12)),
      createDomainEvent('invoice.created', {
        tenantId: pro.w.tenantId,
        payload: { studentLinkId: pro.linkId, invoiceId: 'i1' },
      }),
    );
    expect(out.find((o) => o.channel === 'WHATSAPP')).toMatchObject({
      status: 'skipped',
      reason: 'plan',
    });

    const plus = await studentWithDevice('PRO_PLUS');
    await ctx.db.user.update({ where: { id: plus.userId }, data: { phone: '+5511999990001' } });
    const event = (id: string) =>
      createDomainEvent('invoice.created', {
        tenantId: plus.w.tenantId,
        payload: { studentLinkId: plus.linkId, invoiceId: id },
      });
    // Sem opt-in de WhatsApp: não envia.
    const noOptIn = await dispatchEvent(deps(spTime(12)), event('i2'));
    expect(noOptIn.find((o) => o.channel === 'WHATSAPP')).toMatchObject({
      status: 'skipped',
      reason: 'no_opt_in',
    });
    await ctx.db.consent.create({
      data: { userId: plus.userId, type: 'WHATSAPP', version: 't', granted: true },
    });
    const out2 = await dispatchEvent(deps(spTime(12)), event('i3'));
    expect(out2.find((o) => o.channel === 'WHATSAPP')?.status).toBe('queued');
  });

  it('treinos concluídos em sequência viram uma notificação agrupada', async () => {
    const w = await seedWorld(ctx, 'PRO', 2);
    const mk = (i: number) =>
      createDomainEvent('workout.completed', {
        tenantId: w.tenantId,
        payload: {
          studentLinkId: w.studentLinkIds[i],
          studentName: `Aluno ${i}`,
          workoutName: 'A',
        },
      });
    await dispatchEvent(deps(spTime(12)), mk(0));
    const second = await dispatchEvent(deps(spTime(12, 1)), mk(1));
    expect(second.find((o) => o.channel === 'IN_APP')?.status).toBe('sent');
    const notes = await ctx.db.notification.findMany({
      where: { userId: w.ownerUserId, event: 'workout.completed' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.groupCount).toBe(2);
  });

  it('entrega por e-mail grava SENT; falha temporária refaz e a última marca FAILED', async () => {
    const { userId } = await studentWithDevice();
    await dispatchEvent(
      deps(spTime(12)),
      createDomainEvent('auth.magic_link_requested', { payload: { userId, token: 'abc' } }),
    );
    const job = scheduled.find((s) => s.job.channel === 'EMAIL')!.job;
    const sent: EmailMessage[] = [];
    const base = {
      db: ctx.db,
      redis: ctx.redis,
      push: {} as PushProvider,
      whatsapp: new UnconfiguredWhatsAppProvider(),
      sms: new UnconfiguredSmsProvider(),
      webUrl: 'https://app.vettafit.com.br',
    };

    const failing = { name: 'fake', send: async () => Promise.reject(new Error('timeout SMTP')) };
    await expect(
      deliver({ ...base, email: failing }, job, { attemptsMade: 0, maxAttempts: 3 }),
    ).rejects.toThrow('timeout');
    let log = await ctx.db.deliveryLog.findUniqueOrThrow({ where: { id: job.deliveryLogId } });
    expect(log).toMatchObject({ status: 'QUEUED', attempts: 1 });

    const ok = { name: 'fake', send: async (m: EmailMessage) => (sent.push(m), { id: 'msg-1' }) };
    await deliver({ ...base, email: ok }, job, { attemptsMade: 1, maxAttempts: 3 });
    log = await ctx.db.deliveryLog.findUniqueOrThrow({ where: { id: job.deliveryLogId } });
    expect(log).toMatchObject({ status: 'SENT', providerMessageId: 'msg-1', attempts: 2 });
    expect(sent[0]!.subject).toBe('Seu link de acesso');
    expect(sent[0]!.html).toContain('https://app.vettafit.com.br/entrar/link?token=abc');

    // outro e-mail que falha em todas as tentativas
    await dispatchEvent(
      deps(spTime(12)),
      createDomainEvent('auth.password_reset_requested', { payload: { userId, token: 'x' } }),
    );
    const job2 = scheduled.filter((s) => s.job.channel === 'EMAIL').at(-1)!.job;
    await deliver({ ...base, email: failing }, job2, { attemptsMade: 2, maxAttempts: 3 });
    expect(
      (await ctx.db.deliveryLog.findUniqueOrThrow({ where: { id: job2.deliveryLogId } })).status,
    ).toBe('FAILED');
  });

  it('push com token inválido remove o dispositivo', async () => {
    const { userId } = await studentWithDevice();
    await dispatchEvent(
      deps(spTime(12)),
      createDomainEvent('auth.new_login', { payload: { userId, device: 'x', ip: '', when: '' } }),
    );
    const job = scheduled.find((s) => s.job.channel === 'PUSH')!.job;
    const push: PushProvider = {
      name: 'fake',
      isValidToken: () => true,
      send: async (msgs) => {
        expect(msgs[0]!.url).toBe('vetta://conta/seguranca');
        return msgs.map(() => ({
          ok: false as const,
          error: 'DeviceNotRegistered',
          invalidToken: true,
        }));
      },
      getReceipts: async () => ({}),
    };
    await deliver(
      {
        db: ctx.db,
        redis: ctx.redis,
        push,
        email: { name: 'x', send: async () => ({ id: 'x' }) },
        whatsapp: new UnconfiguredWhatsAppProvider(),
        sms: new UnconfiguredSmsProvider(),
        webUrl: 'http://x',
      },
      job,
      { attemptsMade: 4, maxAttempts: 5 },
    );
    expect(await ctx.db.device.count({ where: { userId } })).toBe(0);
  });
});
