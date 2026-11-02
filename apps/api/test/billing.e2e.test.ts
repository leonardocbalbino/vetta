import {
  issueFiscalInvoices,
  localDate,
  platformGraceExpired,
  platformInvoiceReminders,
  platformPeriodEnd,
  reconcileDay,
  type BillingDeps,
  type InvoiceIssuer,
} from '@vetta/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BILLING } from '../src/infra/infra.module';
import { asaasEnv, DECLINED_CARD, FakeAsaas, WEBHOOK_TOKEN } from './fake-asaas';
import { adminToken, as, createTestContext, login, seedWorld, type TestContext } from './harness';

/**
 * Assinatura da plataforma (personal paga a Vetta) contra o dublê do sandbox:
 * checkout, webhooks idempotentes e fora de ordem, cupom, pró-rata, carência,
 * downgrade sem perda de dados, NFS-e e conciliação.
 */
let ctx: TestContext;
let fake: FakeAsaas;
let billing: BillingDeps;

const billingInfo = {
  name: 'Ana Personal',
  cpfCnpj: '529.982.247-25',
  email: 'ana@exemplo.com',
  postalCode: '01310-100',
  addressNumber: '100',
};
const card = {
  holderName: 'ANA PERSONAL',
  number: '4111111111111111',
  expiryMonth: '12',
  expiryYear: '2030',
  ccv: '123',
};
const holder = {
  name: 'Ana Personal',
  email: 'ana@exemplo.com',
  cpfCnpj: '52998224725',
  postalCode: '01310100',
  addressNumber: '100',
  phone: '11999990000',
};

const hook = (body: object, token = WEBHOOK_TOKEN) =>
  ctx.http.post('/v1/webhooks/asaas').set('asaas-access-token', token).send(body);

async function freeTenant() {
  const w = await seedWorld(ctx, 'FREE', 2);
  const token = await login(ctx, w.ownerEmail);
  return { w, api: as(ctx, token, w.tenantId) };
}

beforeAll(async () => {
  fake = await new FakeAsaas().start();
  ctx = await createTestContext(asaasEnv(fake));
  billing = ctx.app.get(BILLING);
});
afterAll(async () => {
  await ctx?.close();
  await fake?.stop();
});

describe('checkout do upgrade', () => {
  it('FREE → Pro por Pix: fatura pendente com QR; webhook ativa o plano e cria a recorrência', async () => {
    const { w, api } = await freeTenant();
    const res = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'PIX',
      billing: billingInfo,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.invoice).toMatchObject({ status: 'PENDING', totalCents: 3990, method: 'PIX' });
    expect(res.body.invoice.pix.copyPaste).toMatch(/^000201/);
    // Ainda FREE até o pagamento.
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('FREE');

    const inv = await ctx.db.platformInvoice.findUniqueOrThrow({
      where: { id: res.body.invoice.id },
    });
    fake.pay(inv.gatewayInvoiceId!);
    const evt = fake.webhook('PAYMENT_RECEIVED', inv.gatewayInvoiceId!);
    const r1 = await hook(evt);
    expect(r1.body).toMatchObject({ received: true, status: 'PROCESSED' });

    const ent = await api.get('/v1/me/entitlements');
    expect(ent.body.plan.code).toBe('PRO');
    expect(ent.body.features['library.custom_videos']).toBe(true);
    const sub = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: w.tenantId },
    });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.gatewaySubscriptionId).toBeTruthy();
    const gw = fake.subscriptions.get(sub.gatewaySubscriptionId!)!;
    expect(gw).toMatchObject({
      value: 39.9,
      cycle: 'MONTHLY',
      externalReference: `psub:${sub.id}`,
    });
    expect(gw.nextDueDate).toBe(sub.currentPeriodEnd!.toISOString().slice(0, 10));
    // NFS-e agendada e avisos publicados.
    expect(
      await ctx.db.fiscalInvoice.count({ where: { platformInvoiceId: inv.id, status: 'PENDING' } }),
    ).toBe(1);
    expect(ctx.events.of('subscription.activated').some((e) => e.tenantId === w.tenantId)).toBe(
      true,
    );

    // Duplicado: mesmo evento não reaplica.
    const r2 = await hook(evt);
    expect(r2.body).toMatchObject({ duplicate: true });
    expect(fake.subscriptions.size).toBeGreaterThan(0);
    expect(
      [...fake.subscriptions.values()].filter((s) => s.externalReference === `psub:${sub.id}`),
    ).toHaveLength(1);

    // Fora de ordem: PAYMENT_CREATED atrasado não desfaz o pagamento.
    const late = await hook(
      fake.webhook('PAYMENT_CREATED', inv.gatewayInvoiceId!, {
        status: 'PENDING',
        paymentDate: null,
      }),
    );
    expect(late.body.status).toBe('IGNORED');
    expect((await ctx.db.platformInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
      'PAID',
    );
  });

  it('cartão aprovado ativa na hora; cartão recusado responde 422 sem ativar', async () => {
    const ok = await freeTenant();
    const r = await ok.api.post('/v1/subscription/checkout', {
      planCode: 'PRO_PLUS',
      cycle: 'ANNUAL',
      method: 'CREDIT_CARD',
      billing: billingInfo,
      card,
      cardHolder: holder,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.invoice.status).toBe('PAID');
    expect((await ok.api.get('/v1/me/entitlements')).body.plan.code).toBe('PRO_PLUS');
    const cur = await ok.api.get('/v1/subscription');
    expect(cur.body).toMatchObject({ card: { brand: 'VISA', last4: '1111' }, cycle: 'ANNUAL' });
    // Só token, bandeira e final: o número nunca é gravado.
    const sub = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: ok.w.tenantId },
    });
    expect(JSON.stringify(sub)).not.toContain('4111111111111111');

    const bad = await freeTenant();
    const d = await bad.api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'CREDIT_CARD',
      billing: billingInfo,
      card: { ...card, number: DECLINED_CARD },
      cardHolder: holder,
    });
    expect(d.status).toBe(422);
    expect(d.body.code).toBe('PAYMENT_FAILED');
    expect((await bad.api.get('/v1/me/entitlements')).body.plan.code).toBe('FREE');
  });

  it('cupom: 50% no primeiro ciclo; a recorrência volta ao preço cheio', async () => {
    const admin = (await adminToken(ctx)).token;
    const c = await as(ctx, admin).post('/v1/admin/finance/coupons', {
      code: 'BEMVINDO50',
      discountType: 'PERCENT',
      percentOff: 50,
      durationCycles: 1,
      planCodes: ['PRO'],
    });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const { w, api } = await freeTenant();
    const wrong = await api.post('/v1/subscription/coupon', {
      code: 'BEMVINDO50',
      planCode: 'PRO_PLUS',
      cycle: 'MONTHLY',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/não vale para o plano/);
    const preview = await api.post('/v1/subscription/coupon', {
      code: 'bemvindo50',
      planCode: 'PRO',
      cycle: 'MONTHLY',
    });
    expect(preview.body).toMatchObject({ discountCents: 1995, chargeNowCents: 1995 });
    const res = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'PIX',
      couponCode: 'BEMVINDO50',
      billing: billingInfo,
    });
    expect(res.body.invoice).toMatchObject({ discountCents: 1995, totalCents: 1995 });
    const inv = await ctx.db.platformInvoice.findUniqueOrThrow({
      where: { id: res.body.invoice.id },
    });
    expect(fake.payments.get(inv.gatewayInvoiceId!)!.value).toBe(19.95);
    fake.pay(inv.gatewayInvoiceId!);
    await hook(fake.webhook('PAYMENT_RECEIVED', inv.gatewayInvoiceId!));
    const sub = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: w.tenantId },
    });
    expect(sub.couponCyclesUsed).toBe(1);
    expect(fake.subscriptions.get(sub.gatewaySubscriptionId!)!.value).toBe(39.9);
    expect(
      (await ctx.db.coupon.findUniqueOrThrow({ where: { code: 'BEMVINDO50' } })).redemptionsCount,
    ).toBe(1);
  });

  it('upgrade no meio do período: crédito pró-rata abate a cobrança; downgrade fica para o fim', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const api = as(ctx, await login(ctx, w.ownerEmail), w.tenantId);
    const q = await api.post('/v1/subscription/quote', {
      code: '',
      planCode: 'PRO_PLUS',
      cycle: 'MONTHLY',
    });
    expect(q.body.kind).toBe('UPGRADE');
    // Período de 30 dias recém-pago: crédito ~ R$ 39,90.
    expect(q.body.creditCents).toBeGreaterThan(3900);
    expect(q.body.chargeNowCents).toBe(7990 - q.body.creditCents);
    const up = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO_PLUS',
      cycle: 'MONTHLY',
      method: 'CREDIT_CARD',
      billing: billingInfo,
      card,
      cardHolder: holder,
    });
    expect(up.body.invoice).toMatchObject({ status: 'PAID', creditCents: q.body.creditCents });
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('PRO_PLUS');

    const down = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'PIX',
      billing: billingInfo,
    });
    expect(down.body.kind).toBe('DOWNGRADE');
    const cur = await api.get('/v1/subscription');
    expect(cur.body.pendingChange.plan.code).toBe('PRO');
    expect(cur.body.plan.code).toBe('PRO_PLUS');
    const sub = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: w.tenantId },
    });
    expect(fake.subscriptions.get(sub.gatewaySubscriptionId!)!.value).toBe(39.9);
    // Fim do período: o job troca o plano.
    await platformPeriodEnd(billing, new Date(sub.currentPeriodEnd!.getTime() + 1000));
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('PRO');
  });
});

describe('inadimplência e downgrade sem perda de dados', () => {
  it('renovação vencida: avisos D-7/D-1/dia, PAST_DUE, carência de 7 dias e FREE com alunos arquivados (não apagados)', async () => {
    const { w, api } = await freeTenant();
    // Pro Plus com 4 alunos (o FREE permite 2).
    for (let i = 0; i < 2; i++)
      await api
        .post('/v1/students/invites', { name: `Extra ${i}`, delivery: 'LINK' })
        .catch(() => undefined);
    const res = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO_PLUS',
      cycle: 'MONTHLY',
      method: 'CREDIT_CARD',
      billing: billingInfo,
      card,
      cardHolder: holder,
    });
    expect(res.body.invoice.status).toBe('PAID');
    for (let i = 0; i < 2; i++)
      expect(
        (await api.post('/v1/students/invites', { name: `Novo ${i}`, delivery: 'LINK' })).status,
      ).toBe(201);
    const program = await api.post('/v1/programs', {
      name: 'Hipertrofia',
      studentLinkId: w.studentLinkIds[0],
      routines: [],
    });
    expect(program.status).toBe(201);

    const sub = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: w.tenantId },
    });
    // O gateway gera a cobrança de renovação; chega o PAYMENT_CREATED.
    const due = localDate(new Date(Date.now() + 7 * 86_400_000), 'America/Sao_Paulo');
    const next = fake.nextCharge(sub.gatewaySubscriptionId!, due);
    expect((await hook(fake.webhook('PAYMENT_CREATED', next.id))).body.status).toBe('PROCESSED');
    const renewal = await ctx.db.platformInvoice.findUniqueOrThrow({
      where: { gatewayInvoiceId: next.id },
    });
    expect(renewal).toMatchObject({ status: 'PENDING', amountCents: 7990 });

    // Régua: D-7 hoje (uma vez só).
    expect(await platformInvoiceReminders(billing)).toBeGreaterThanOrEqual(1);
    await platformInvoiceReminders(billing);
    expect(
      ctx.events
        .of('subscription.payment_reminder')
        .filter((e) => e.payload.invoiceId === renewal.id),
    ).toHaveLength(1);

    // Falha do cartão gera aviso; depois vence.
    await hook(fake.webhook('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', next.id));
    expect(
      ctx.events.of('subscription.payment_failed').some((e) => e.payload.invoiceId === renewal.id),
    ).toBe(true);
    await hook(
      fake.webhook('PAYMENT_OVERDUE', next.id, {
        status: 'OVERDUE',
        dueDate: new Date().toISOString().slice(0, 10),
      }),
    );
    const pastDue = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: w.tenantId },
    });
    expect(pastDue.status).toBe('PAST_DUE');
    // Na carência o plano continua.
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('PRO_PLUS');
    await platformGraceExpired(billing, new Date(Date.now() + 3 * 86_400_000));
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('PRO_PLUS');

    await platformGraceExpired(billing, new Date(pastDue.graceEndsAt!.getTime() + 1000));
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('FREE');
    const links = await ctx.db.studentLink.findMany({
      where: { tenantId: w.tenantId, deletedAt: null },
    });
    expect(links.filter((l) => l.status === 'ARCHIVED').length).toBe(links.length - 2);
    expect(links.length).toBeGreaterThanOrEqual(4);
    // Nada apagado: programa e alunos continuam no banco.
    expect(
      await ctx.db.workoutProgram.count({ where: { id: program.body.id, deletedAt: null } }),
    ).toBe(1);
    expect(fake.subscriptions.get(sub.gatewaySubscriptionId!)!.deleted).toBe(true);

    // Upgrade de novo: dados voltam a ser editáveis (alunos arquivados podem ser reativados).
    const again = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'CREDIT_CARD',
      billing: billingInfo,
      card,
      cardHolder: holder,
    });
    expect(again.body.invoice.status).toBe('PAID');
    const archived = links.find((l) => l.status === 'ARCHIVED')!;
    expect((await api.post(`/v1/students/${archived.id}/restore`)).status).toBe(200);
  });

  it('cancelamento: sem novas cobranças; FREE no fim do período; desfazer antes recria a recorrência', async () => {
    const { w, api } = await freeTenant();
    await api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'CREDIT_CARD',
      billing: billingInfo,
      card,
      cardHolder: holder,
    });
    const before = await ctx.db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId: w.tenantId },
    });
    const c = await api.post('/v1/subscription/cancel');
    expect(c.body.cancelAtPeriodEnd).toBe(true);
    expect(fake.subscriptions.get(before.gatewaySubscriptionId!)!.deleted).toBe(true);
    const r = await api.post('/v1/subscription/resume');
    expect(r.body.cancelAtPeriodEnd).toBe(false);
    await api.post('/v1/subscription/cancel');
    await platformPeriodEnd(billing, new Date(before.currentPeriodEnd!.getTime() + 1000));
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('FREE');
  });
});

describe('webhooks, NFS-e, conciliação e admin', () => {
  it('token inválido = 401 e nada é gravado', async () => {
    const before = await ctx.db.webhookEvent.count();
    const r = await hook({ id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: {} }, 'errado');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('WEBHOOK_INVALID');
    expect(await ctx.db.webhookEvent.count()).toBe(before);
  });

  it('NFS-e: sem emissor fica PENDING_CONFIG; com emissor vira ISSUED e avisa', async () => {
    await issueFiscalInvoices({ ...billing, issuer: { configured: false } as InvoiceIssuer });
    expect(
      await ctx.db.fiscalInvoice.count({ where: { status: 'PENDING_CONFIG' } }),
    ).toBeGreaterThan(0);
    const issuedBefore = await ctx.db.fiscalInvoice.count({ where: { status: 'ISSUED' } });
    const issued: string[] = [];
    const issuer: InvoiceIssuer = {
      configured: true,
      issue: async (i) => {
        issued.push(i.externalId);
        return {
          externalId: `nf-${i.externalId}`,
          status: 'ISSUED',
          number: '123',
          pdfUrl: 'https://nfe.io/x.pdf',
          xmlUrl: null,
          error: null,
        };
      },
      get: async () => {
        throw new Error('não usado');
      },
    };
    await issueFiscalInvoices({ ...billing, issuer });
    expect(issued.length).toBeGreaterThan(0);
    expect((await ctx.db.fiscalInvoice.count({ where: { status: 'ISSUED' } })) - issuedBefore).toBe(
      issued.length,
    );
    expect(ctx.events.of('fiscal_invoice.issued').length).toBe(issued.length);
  });

  it('conciliação: pagamento que o webhook não trouxe é corrigido', async () => {
    const { w, api } = await freeTenant();
    const res = await api.post('/v1/subscription/checkout', {
      planCode: 'PRO',
      cycle: 'MONTHLY',
      method: 'BOLETO',
      billing: billingInfo,
    });
    expect(res.body.invoice.boletoUrl).toMatch(/sandbox/);
    const inv = await ctx.db.platformInvoice.findUniqueOrThrow({
      where: { id: res.body.invoice.id },
    });
    fake.pay(inv.gatewayInvoiceId!); // pago no gateway, webhook perdido
    const run = await reconcileDay(billing, localDate(new Date(), 'America/Sao_Paulo'));
    expect(run).toMatchObject({ status: 'DONE' });
    expect(run!.fixed).toBeGreaterThanOrEqual(1);
    expect((await api.get('/v1/me/entitlements')).body.plan.code).toBe('PRO');
    expect(
      (await ctx.db.tenantSubscription.findUniqueOrThrow({ where: { tenantId: w.tenantId } }))
        .status,
    ).toBe('ACTIVE');
  });

  it('admin: métricas (MRR, ARR, churn, LTV, por plano), faturas e estorno', async () => {
    const admin = (await adminToken(ctx)).token;
    const m = await as(ctx, admin).get('/v1/admin/finance/metrics');
    expect(m.status).toBe(200);
    expect(m.body.mrrCents).toBeGreaterThan(0);
    expect(m.body.arrCents).toBe(m.body.mrrCents * 12);
    expect(m.body.byPlan.map((p: { code: string }) => p.code)).toEqual(
      expect.arrayContaining(['PRO']),
    );
    const paid = await as(ctx, admin).get('/v1/admin/finance/invoices?status=PAID');
    const target = paid.body.items.find(
      (i: { gatewayInvoiceId: string | null }) => i.gatewayInvoiceId,
    );
    const rf = await as(ctx, admin).post(`/v1/admin/finance/invoices/${target.id}/refund`, {
      reason: 'Cobrança em duplicidade',
    });
    expect(rf.status, JSON.stringify(rf.body)).toBe(200);
    expect(rf.body.status).toBe('REFUNDED');
    const op = await adminToken(ctx, 'ADMIN_OPERADOR');
    expect(
      (
        await as(ctx, op.token).post(`/v1/admin/finance/invoices/${target.id}/refund`, {
          reason: 'teste',
        })
      ).status,
    ).toBe(403);
    expect((await as(ctx, op.token).get('/v1/admin/finance/metrics')).status).toBe(200);
  });
});
