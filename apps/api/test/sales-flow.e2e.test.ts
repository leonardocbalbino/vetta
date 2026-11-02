import { seedDevExercises } from '@vetta/db/testing';
import {
  blockOverdueStudents,
  sendKycDocuments,
  studentInvoiceReminders,
  studentPlanEndings,
  type BillingDeps,
} from '@vetta/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BILLING } from '../src/infra/infra.module';
import { addDays, asaasEnv, FakeAsaas, WEBHOOK_TOKEN } from './fake-asaas';
import {
  as,
  createTestContext,
  lastEvent,
  login,
  seedWorld,
  uploadFile,
  type TestContext,
} from './harness';

/**
 * Critério de pronto da Fase 2 (financeiro do aluno): o personal ativa a carteira,
 * publica a página de vendas; um visitante compra, vira aluno, recebe treino e paga a
 * renovação; o split reserva a taxa da plataforma; inadimplência bloqueia e libera.
 */
let ctx: TestContext;
let fake: FakeAsaas;
let billing: BillingDeps;
let personal: ReturnType<typeof as>;
let tenantId: string;
let slug: string;
let planId: string;
let installmentPlanId: string;
let subaccountKey: string;

const hook = (body: unknown) =>
  ctx.http.post('/v1/webhooks/asaas').set('asaas-access-token', WEBHOOK_TOKEN).send(body);
const card = {
  holderName: 'MARIA SILVA',
  number: '4111111111111111',
  expiryMonth: '12',
  expiryYear: '2030',
  ccv: '123',
};
const cardHolder = {
  name: 'Maria Silva',
  email: 'maria.compra@test.dev',
  cpfCnpj: '52998224725',
  postalCode: '01310100',
  addressNumber: '10',
  phone: '11988887777',
};

beforeAll(async () => {
  fake = await new FakeAsaas().start();
  ctx = await createTestContext(asaasEnv(fake));
  billing = ctx.app.get(BILLING);
  await seedDevExercises(ctx.db);
  const w = await seedWorld(ctx, 'PRO');
  tenantId = w.tenantId;
  slug = (await ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).slug;
  personal = as(ctx, await login(ctx, w.ownerEmail), tenantId);
});
afterAll(async () => {
  await ctx?.close();
  await fake?.stop();
});

describe('carteira (KYC)', () => {
  it('sem carteira não cobra; cria subconta, envia documento e recebe a aprovação por webhook', async () => {
    const plan = await personal.post('/v1/finance/plans', {
      name: 'Consultoria Online',
      description: 'Treino e acompanhamento pelo app.',
      priceCents: 19900,
      cycle: 'MONTHLY',
      paymentMode: 'RECURRING',
      methods: ['PIX', 'CREDIT_CARD', 'BOLETO'],
      isPublic: true,
      benefits: ['Treino no app', 'Chat com o personal'],
    });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    planId = plan.body.id;
    const inst = await personal.post('/v1/finance/plans', {
      name: 'Trimestral parcelado',
      priceCents: 45000,
      cycle: 'QUARTERLY',
      paymentMode: 'INSTALLMENTS',
      maxInstallments: 3,
      methods: ['CREDIT_CARD'],
      isPublic: true,
      toleranceDays: 2,
    });
    installmentPlanId = inst.body.id;

    const w2 = await ctx.db.studentLink.findFirstOrThrow({ where: { tenantId } });
    const noAccount = await personal.post('/v1/finance/subscriptions', {
      studentLinkId: w2.id,
      consultingPlanId: planId,
      method: 'PIX',
      cpfCnpj: '52998224725',
    });
    expect(noAccount.status).toBe(422);
    expect(noAccount.body.code).toBe('PAYMENT_ACCOUNT_REQUIRED');

    const acc = await personal.put('/v1/finance/account', {
      personType: 'CPF',
      name: 'Ana Personal',
      email: 'ana.pj@test.dev',
      cpfCnpj: '52998224725',
      birthDate: '1990-05-10',
      incomeValueCents: 500000,
      mobilePhone: '11999990000',
      address: {
        street: 'Av. Paulista',
        number: '1000',
        district: 'Bela Vista',
        postalCode: '01310-100',
      },
      bankAccount: {
        bankCode: '341',
        agency: '1234',
        account: '56789',
        accountDigit: '0',
        accountType: 'CONTA_CORRENTE',
        holderName: 'Ana Personal',
        holderDocument: '52998224725',
      },
      pixKey: 'ana.pj@test.dev',
      pixKeyType: 'EMAIL',
    });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(acc.body.status).toBe('UNDER_REVIEW');
    expect(acc.body.account.cpfCnpj).toBe('***4725');
    const created = fake.accounts.at(-1)!;
    subaccountKey = created.apiKey;
    // A subconta já nasce com o webhook apontando para a API.
    expect(JSON.stringify(created.body)).toContain('/v1/webhooks/asaas');
    const row = await ctx.db.paymentAccount.findUniqueOrThrow({ where: { tenantId } });
    expect(row.apiKeyEncrypted).not.toContain(subaccountKey);

    // Documento de KYC: upload kyc_document → worker envia ao gateway.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'.padEnd(300, ' '));
    const mediaId = await uploadFile(ctx, personal, {
      purpose: 'kyc_document',
      fileName: 'rg.pdf',
      mimeType: 'application/pdf',
      body: pdf,
    });
    const doc = await personal.post('/v1/finance/account/documents', {
      mediaId,
      type: 'IDENTIFICATION',
    });
    expect(doc.status, JSON.stringify(doc.body)).toBe(201);
    expect(await sendKycDocuments({ ...billing, storage: ctx.storage })).toBe(1);
    expect(fake.documents.at(-1)).toMatchObject({
      requirementId: 'req-identification',
      apiKey: subaccountKey,
    });

    await hook(fake.accountWebhook(created.id, 'APPROVED'));
    expect((await personal.get('/v1/finance/account')).body.status).toBe('APPROVED');
    expect(ctx.events.of('payment_account.status_changed').at(-1)!.payload.status).toBe('APPROVED');
  });
});

describe('página de vendas → aluno → treino → renovação', () => {
  let checkoutId: string;
  let studentToken: string;
  let studentLinkId: string;

  it('personal publica a página; visitante vê planos públicos, FAQ e CREF', async () => {
    await ctx.db.tenant.update({
      where: { id: tenantId },
      data: { cref: '012345-G', crefState: 'SP' },
    });
    const save = await personal.put('/v1/sales-page', {
      headline: 'Treino que cabe na sua rotina',
      bio: 'Personal há 10 anos, especialista em hipertrofia.',
      specialties: ['Hipertrofia', 'Emagrecimento'],
      faq: [
        { question: 'Preciso de academia?', answer: 'Não, montamos o treino com o que você tem.' },
      ],
      socialLinks: { instagram: '@ana.personal' },
      isPublished: true,
    });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    const page = await ctx.http.get(`/v1/public/pages/${slug}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({
      cref: '012345-G-SP',
      checkoutEnabled: true,
      specialties: ['Hipertrofia', 'Emagrecimento'],
    });
    expect(page.body.plans.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['Consultoria Online']),
    );
    // Despublicada = 404.
    await personal.put('/v1/sales-page', { ...save.body, isPublished: false, photoMediaId: null });
    expect((await ctx.http.get(`/v1/public/pages/${slug}`)).status).toBe(404);
    await personal.put('/v1/sales-page', {
      headline: 'Treino que cabe na sua rotina',
      isPublished: true,
      specialties: [],
      faq: [],
    });
  });

  it('visitante paga por Pix: vira aluno, recebe convite; o split reserva a taxa da plataforma', async () => {
    const r = await ctx.http.post(`/v1/public/pages/${slug}/checkout`).send({
      consultingPlanId: planId,
      name: 'Maria Silva',
      email: 'maria.compra@test.dev',
      phone: '11988887777',
      cpfCnpj: '529.982.247-25',
      method: 'PIX',
      acceptTerms: true,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', method: 'PIX', amountCents: 19900 });
    expect(r.body.pix.copyPaste).toBeTruthy();
    checkoutId = r.body.id;
    const chk = await ctx.db.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    const pay = fake.payments.get(chk.gatewayPaymentId!)!;
    // Cobrança na subconta do personal com 2,99% (Pro) para a carteira da Vetta.
    expect(pay.apiKey).toBe(subaccountKey);
    expect(pay.split).toEqual([{ walletId: 'wallet-vetta-test', percentualValue: 2.99 }]);

    fake.pay(pay.id);
    expect((await hook(fake.webhook('PAYMENT_RECEIVED', pay.id))).body.status).toBe('PROCESSED');
    const status = await ctx.http.get(`/v1/public/checkouts/${checkoutId}`);
    expect(status.body.status).toBe('PAID');

    const link = await ctx.db.studentLink.findFirstOrThrow({
      where: { tenantId, email: 'maria.compra@test.dev' },
    });
    studentLinkId = link.id;
    expect(link.status).toBe('INVITED');
    const ss = await ctx.db.studentSubscription.findFirstOrThrow({ where: { studentLinkId } });
    expect(ss).toMatchObject({
      status: 'ACTIVE',
      source: 'SALES_PAGE',
      platformFeeBps: 299,
      priceCents: 19900,
    });
    // Recorrente: assinatura criada no gateway depois do pagamento, para o próximo ciclo.
    expect(fake.subscriptions.get(ss.gatewaySubscriptionId!)).toMatchObject({
      externalReference: `ssub:${ss.id}`,
      apiKey: subaccountKey,
    });
    const inv = await ctx.db.invoice.findFirstOrThrow({ where: { studentLinkId, status: 'PAID' } });
    // R$ 199,00 − 0,99 gateway = 198,01; 2,99% Vetta = 5,92; líquido 192,09.
    expect(inv).toMatchObject({
      amountCents: 19900,
      gatewayFeeCents: 99,
      platformFeeCents: 592,
      netCents: 19209,
    });
    const credit = await ctx.db.walletEntry.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(credit.amountCents).toBe(19209);
    expect(ctx.events.of('checkout.paid').at(-1)!.payload.studentName).toBe('Maria Silva');

    // Webhook duplicado e o mesmo pagamento de novo: nada duplica.
    await hook(fake.webhook('PAYMENT_CONFIRMED', pay.id));
    expect(await ctx.db.studentSubscription.count({ where: { studentLinkId } })).toBe(1);
    expect(await ctx.db.walletEntry.count({ where: { invoiceId: inv.id } })).toBe(1);

    // Convite: o aluno cria a senha e entra.
    const invite = lastEvent(ctx, 'student.invited');
    const accept = await ctx.http.post('/v1/invites/accept').send({
      token: invite.payload.token,
      password: 'Maria-2026',
      acceptTerms: true,
      acceptHealthDataConsent: true,
    });
    expect(accept.status, JSON.stringify(accept.body)).toBe(200);
    studentToken = accept.body.accessToken;
  });

  it('personal prescreve; aluno vê o treino do dia e as cobranças', async () => {
    const squat = await ctx.db.exercise.findFirstOrThrow({ where: { tenantId: null } });
    const p = await personal.post('/v1/programs', {
      studentLinkId,
      name: 'Início',
      publish: true,
      routines: [
        { label: 'A', items: [{ exerciseId: squat.id, sets: [{ reps: '10', targetLoadKg: 30 }] }] },
      ],
    });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    const student = as(ctx, studentToken, tenantId);
    const today = await student.get('/v1/training/today');
    expect(today.status).toBe(200);
    expect(today.body.programs[0].name).toBe('Início');
    const mine = await student.get('/v1/me/finance');
    expect(mine.body.subscriptions[0]).toMatchObject({
      status: 'ACTIVE',
      plan: { name: 'Consultoria Online' },
    });
    expect(mine.body.invoices[0].status).toBe('PAID');
  });

  it('renovação: o gateway gera a próxima cobrança; lembretes; atraso bloqueia; pagamento com cartão libera', async () => {
    const student = as(ctx, studentToken, tenantId);
    const ss = await ctx.db.studentSubscription.findFirstOrThrow({ where: { studentLinkId } });
    const due = addDays(new Date().toISOString().slice(0, 10), 3);
    const next = fake.nextCharge(ss.gatewaySubscriptionId!, due);
    expect((await hook(fake.webhook('PAYMENT_CREATED', next.id))).body.status).toBe('PROCESSED');
    const renewal = await ctx.db.invoice.findUniqueOrThrow({ where: { gatewayChargeId: next.id } });
    expect(renewal).toMatchObject({
      status: 'PENDING',
      amountCents: 19900,
      studentSubscriptionId: ss.id,
    });

    // D-3 hoje: lembrete uma vez.
    await studentInvoiceReminders(billing);
    await studentInvoiceReminders(billing);
    expect(
      ctx.events.of('invoice.reminder').filter((e) => e.payload.invoiceId === renewal.id),
    ).toHaveLength(1);

    // Vence; personal ligou o bloqueio após 1 dia.
    await personal.put('/v1/finance/settings', {
      blockOverdueStudents: true,
      blockOverdueAfterDays: 1,
    });
    const pastDue = addDays(new Date().toISOString().slice(0, 10), -2);
    await hook(fake.webhook('PAYMENT_OVERDUE', next.id, { status: 'OVERDUE', dueDate: pastDue }));
    await ctx.db.invoice.update({
      where: { id: renewal.id },
      data: { dueDate: new Date(`${pastDue}T12:00:00Z`) },
    });
    expect(await blockOverdueStudents(billing)).toBe(1);
    const blocked = await student.get('/v1/training/today');
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('PAYMENT_OVERDUE');
    // Pagamento liberado mesmo bloqueado; Pix aparece na cobrança.
    const detail = await student.get(`/v1/me/finance/invoices/${renewal.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.pix.copyPaste).toBeTruthy();

    const paid = await student.post(`/v1/me/finance/invoices/${renewal.id}/pay-card`, {
      card,
      cardHolder,
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body.status).toBe('PAID');
    expect((await student.get('/v1/training/today')).status).toBe(200);
    expect(
      ctx.events.of('student.unblocked').some((e) => e.payload.studentLinkId === studentLinkId),
    ).toBe(true);
  });

  it('parcelado no cartão: 3 faturas, todas confirmadas; aviso 7 dias antes do fim do plano', async () => {
    const r = await ctx.http.post(`/v1/public/pages/${slug}/checkout`).send({
      consultingPlanId: installmentPlanId,
      name: 'João Lima',
      email: 'joao.compra@test.dev',
      phone: '11977776666',
      cpfCnpj: '11222333000181',
      method: 'CREDIT_CARD',
      installments: 3,
      card,
      cardHolder: { ...cardHolder, email: 'joao.compra@test.dev' },
      acceptTerms: true,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.status).toBe('PAID');
    const link = await ctx.db.studentLink.findFirstOrThrow({
      where: { tenantId, email: 'joao.compra@test.dev' },
    });
    const ss = await ctx.db.studentSubscription.findFirstOrThrow({
      where: { studentLinkId: link.id },
    });
    expect(ss).toMatchObject({ paymentMode: 'INSTALLMENTS', installments: 3 });
    // As outras parcelas chegam por webhook e entram como faturas do mesmo plano.
    const others = [...fake.payments.values()].filter(
      (p) => p.externalReference === `chk:${r.body.id}` && p.installmentNumber !== 1,
    );
    for (const p of others) await hook(fake.webhook('PAYMENT_CONFIRMED', p.id));
    expect(
      await ctx.db.invoice.count({ where: { studentSubscriptionId: ss.id, status: 'PAID' } }),
    ).toBe(3);

    const r2 = await studentPlanEndings(billing, new Date(ss.endsAt!.getTime() - 5 * 86_400_000));
    expect(r2.notified).toBeGreaterThanOrEqual(1);
    expect(
      ctx.events.of('student_plan.ending').some((e) => e.payload.studentLinkId === link.id),
    ).toBe(true);
  });

  it('painel: receita do mês, a receber, vencidas, saldo; extrato, despesas, saque e relatório CSV', async () => {
    const before = (await personal.get('/v1/finance/summary')).body.manual;
    await personal.post('/v1/finance/entries', {
      kind: 'EXPENSE',
      description: 'Aluguel do estúdio',
      category: 'Estrutura',
      amountCents: 50000,
      paidOn: new Date().toISOString().slice(0, 10),
    });
    await personal.post('/v1/finance/entries', {
      kind: 'INCOME',
      description: 'Aula avulsa',
      category: 'Aulas',
      amountCents: 8000,
      paidOn: new Date().toISOString().slice(0, 10),
    });
    fake.balances.set(subaccountKey, 300);
    const s = await personal.get('/v1/finance/summary');
    expect(s.status).toBe(200);
    expect(s.body.revenue.count).toBeGreaterThanOrEqual(5);
    expect(s.body.revenue.platformFeeCents).toBeGreaterThan(0);
    expect(s.body.manual.expensesCents - before.expensesCents).toBe(50000);
    expect(s.body.manual.incomesCents - before.incomesCents).toBe(8000);
    expect(s.body.balance.source).toBe('gateway');
    expect(s.body.balance.toReleaseCents).toBeGreaterThan(0); // cartão libera em 30 dias

    const st = await personal.get('/v1/finance/statement');
    expect(
      st.body.items.some((i: { description: string }) => i.description.includes('Aluguel')),
    ).toBe(true);

    const tooMuch = await personal.post('/v1/finance/withdrawals', { amountCents: 99_999_999 });
    expect(tooMuch.status).toBe(400);
    const w = await personal.post('/v1/finance/withdrawals', { amountCents: 10000 });
    expect(w.status, JSON.stringify(w.body)).toBe(201);
    expect(fake.transfers.at(-1)!.body).toMatchObject({
      value: 100,
      pixAddressKey: 'ana.pj@test.dev',
    });
    await hook(fake.transferWebhook(w.body.gatewayTransferId, 'DONE'));
    expect((await ctx.db.withdrawal.findUniqueOrThrow({ where: { id: w.body.id } })).status).toBe(
      'DONE',
    );

    const csv = await personal.get('/v1/finance/report');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Consultoria Online');
    expect(csv.text).toContain('Aluguel do estúdio');
  });

  it('sem vaga no plano do personal a página não vende', async () => {
    const free = await seedWorld(ctx, 'FREE', 2);
    await ctx.db.tenantFeatureOverride.create({
      data: { tenantId: free.tenantId, featureKey: 'brand.sales_page', value: 1, reason: 'teste' },
    });
    await ctx.db.tenantFeatureOverride.create({
      data: {
        tenantId: free.tenantId,
        featureKey: 'finance.student_billing',
        value: 1,
        reason: 'teste',
      },
    });
    await ctx.cache.invalidateTenant(free.tenantId);
    const p = await ctx.db.consultingPlan.create({
      data: {
        tenantId: free.tenantId,
        name: 'X',
        priceCents: 1000,
        methods: ['PIX'],
        isPublic: true,
      },
    });
    await ctx.db.salesPage.upsert({
      where: { tenantId: free.tenantId },
      create: { tenantId: free.tenantId, isPublished: true },
      update: { isPublished: true },
    });
    const key = (await ctx.db.paymentAccount.findUniqueOrThrow({ where: { tenantId } }))
      .apiKeyEncrypted;
    await ctx.db.paymentAccount.upsert({
      where: { tenantId: free.tenantId },
      create: { tenantId: free.tenantId, apiKeyEncrypted: key, status: 'APPROVED' },
      update: { apiKeyEncrypted: key, status: 'APPROVED' },
    });
    const fslug = (await ctx.db.tenant.findUniqueOrThrow({ where: { id: free.tenantId } })).slug;
    const r = await ctx.http.post(`/v1/public/pages/${fslug}/checkout`).send({
      consultingPlanId: p.id,
      name: 'Lotado',
      email: 'lotado@test.dev',
      phone: '11999990000',
      cpfCnpj: '52998224725',
      method: 'PIX',
      acceptTerms: true,
    });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/não está aceitando novos alunos/);
  });
});
