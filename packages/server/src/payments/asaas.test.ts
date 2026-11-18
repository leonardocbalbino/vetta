import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import accountApproved from './fixtures/account-approved.json';
import cardRefused from './fixtures/card-refused.json';
import paymentReceived from './fixtures/payment-received.json';
import transferDone from './fixtures/transfer-done.json';
import {
  ASAAS_PRODUCTION_URL,
  AsaasPaymentProvider,
  asaasStatusMessage,
  mapAsaasPayment,
} from './asaas';
import {
  invoiceStatusOf,
  nextInvoiceStatus,
  PaymentProviderError,
  WebhookAuthError,
} from './provider';

const TOKEN = 'whk_test_token_123456';
const headers = { 'asaas-access-token': TOKEN };

describe('webhooks (payloads do sandbox)', () => {
  const p = new AsaasPaymentProvider({ baseUrl: 'http://x', apiKey: 'k', webhookToken: TOKEN });

  it('recusa token ausente ou errado, e evento sem id', () => {
    expect(() => p.parseWebhook({}, paymentReceived)).toThrow(WebhookAuthError);
    expect(() => p.parseWebhook({ 'asaas-access-token': 'outro' }, paymentReceived)).toThrow(
      WebhookAuthError,
    );
    expect(() => p.parseWebhook(headers, { event: 'PAYMENT_RECEIVED' })).toThrow(/sem id/);
  });

  it('pagamento recebido: valores em centavos, datas e referência', () => {
    const e = p.parseWebhook({ 'asaas-access-token': [TOKEN] }, paymentReceived);
    expect(e).toMatchObject({ kind: 'charge', action: 'RECEIVED', resourceId: 'pay_080225913252' });
    expect(e.charge).toMatchObject({
      status: 'RECEIVED',
      amountCents: 3990,
      netCents: 3891,
      method: 'PIX',
      creditDate: '2026-03-10',
      subscriptionId: 'sub_VXJBYgP2u0eO',
      externalReference: 'pinv:0190f1e2-0000-7000-8000-00000000aa01',
    });
    expect(e.occurredAt.toISOString()).toBe('2026-03-10T17:21:07.000Z');
  });

  it('cartão recusado vira ação FAILED sem mudar o status', () => {
    const e = p.parseWebhook(headers, cardRefused);
    expect(e.action).toBe('FAILED');
    expect(e.charge!.status).toBe('PENDING');
  });

  it('conta aprovada e transferência concluída', () => {
    const a = p.parseWebhook(headers, accountApproved);
    expect(a).toMatchObject({ kind: 'account', account: { status: 'APPROVED' } });
    expect(a.accountId).toBe('a3f0c7e1-55b2-4d1f-9a7e-0c2b1d4e5f60');
    const t = p.parseWebhook(headers, transferDone);
    expect(t).toMatchObject({
      kind: 'transfer',
      action: 'DONE',
      transfer: { status: 'DONE', feeCents: 0 },
    });
  });

  it('cobrança excluída e evento desconhecido', () => {
    const del = p.parseWebhook(headers, { ...paymentReceived, event: 'PAYMENT_DELETED' });
    expect(del.charge!.status).toBe('CANCELED');
    expect(p.parseWebhook(headers, { id: 'evt_1', event: 'INVOICE_CREATED' }).kind).toBe('other');
  });
});

describe('status das faturas', () => {
  it('mapeia status do gateway', () => {
    expect(invoiceStatusOf('CONFIRMED')).toBe('PAID');
    expect(invoiceStatusOf('CHARGEBACK')).toBe('REFUNDED');
    expect(invoiceStatusOf('OVERDUE')).toBe('OVERDUE');
    expect(invoiceStatusOf('CANCELED')).toBe('CANCELED');
    expect(invoiceStatusOf('PENDING')).toBe('PENDING');
    expect(
      mapAsaasPayment({ id: 'p', status: 'ESTRANHO', value: 1, dueDate: '2026-01-01' }).status,
    ).toBe('PENDING');
  });

  it('fora de ordem: nunca regride; estorno depois do pago; novo vencimento reabre', () => {
    expect(nextInvoiceStatus('PAID', 'PENDING')).toBe('PAID');
    expect(nextInvoiceStatus('PAID', 'OVERDUE')).toBe('PAID');
    expect(nextInvoiceStatus('PAID', 'CANCELED')).toBe('PAID');
    expect(nextInvoiceStatus('PAID', 'REFUNDED')).toBe('REFUNDED');
    expect(nextInvoiceStatus('PENDING', 'OVERDUE')).toBe('OVERDUE');
    expect(nextInvoiceStatus('OVERDUE', 'PENDING')).toBe('OVERDUE');
    expect(nextInvoiceStatus('OVERDUE', 'PENDING', { dueDateMovedForward: true })).toBe('PENDING');
  });
});

describe('cliente HTTP', () => {
  let server: Server;
  let base: string;
  const calls: { method: string; url: string; key: string; body: string }[] = [];
  const read = (req: IncomingMessage) =>
    new Promise<string>((r) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => r(b));
    });

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const body = await read(req);
      calls.push({
        method: req.method!,
        url: req.url!,
        key: String(req.headers.access_token),
        body,
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/payments' && req.method === 'POST') {
        const b = JSON.parse(body);
        if (!b.customer) {
          res.statusCode = 400;
          return res.end(
            JSON.stringify({ errors: [{ code: 'invalid', description: 'Cliente obrigatório.' }] }),
          );
        }
        return res.end(
          JSON.stringify({
            id: 'pay_1',
            status: 'PENDING',
            value: b.value ?? b.totalValue,
            netValue: 0,
            billingType: b.billingType,
            dueDate: b.dueDate,
            externalReference: b.externalReference,
          }),
        );
      }
      if (req.url?.startsWith('/payments?'))
        return res.end(JSON.stringify({ data: [], hasMore: false }));
      if (req.url === '/finance/balance') return res.end(JSON.stringify({ balance: 123.45 }));
      if (req.url === '/transfers')
        return res.end(JSON.stringify({ id: 't1', status: 'BANK_PROCESSING', transferFee: 2 }));
      if (req.url === '/subscriptions') return res.end(JSON.stringify({ id: 'sub_1' }));
      if (req.url === '/subscriptions/sub_1' && req.method === 'DELETE')
        return res.end('{"deleted":true}');
      if (req.url === '/subscriptions/sub_1') return res.end('{}');
      res.statusCode = 404;
      res.end('');
    });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('bloqueia a URL de produção fora de produção', () => {
    expect(
      () =>
        new AsaasPaymentProvider({
          baseUrl: ASAAS_PRODUCTION_URL,
          apiKey: 'k',
          webhookToken: TOKEN,
        }),
    ).toThrow(/sandbox/);
    expect(
      () =>
        new AsaasPaymentProvider({
          baseUrl: ASAAS_PRODUCTION_URL,
          apiKey: 'k',
          webhookToken: TOKEN,
          allowProduction: true,
        }),
    ).not.toThrow();
  });

  it('envia reais, split, parcelamento e a chave da subconta', async () => {
    const p = new AsaasPaymentProvider({ baseUrl: base, apiKey: 'master', webhookToken: TOKEN });
    const c = await p.createCharge(
      {
        customerId: 'cus_1',
        method: 'CREDIT_CARD',
        amountCents: 29970,
        dueDate: '2026-03-10',
        description: 'Consultoria',
        externalReference: 'inv:1',
        installments: 3,
        cardToken: 'tok',
        split: [{ walletId: 'w_vetta', percent: 2.99 }],
      },
      { apiKey: 'sub_key' },
    );
    expect(c.amountCents).toBe(29970);
    const sent = JSON.parse(calls.at(-1)!.body);
    expect(calls.at(-1)!.key).toBe('sub_key');
    expect(sent).toMatchObject({
      installmentCount: 3,
      totalValue: 299.7,
      split: [{ walletId: 'w_vetta', percentualValue: 2.99 }],
    });
    expect(sent.value).toBeUndefined();

    await p.createSubscription({
      customerId: 'cus_1',
      method: 'PIX',
      amountCents: 3990,
      cycle: 'SEMIANNUAL',
      nextDueDate: '2026-03-10',
      description: 'Pro',
      externalReference: 'psub:1',
      split: [{ walletId: 'w', fixedCents: 150 }],
    });
    expect(JSON.parse(calls.at(-1)!.body)).toMatchObject({
      cycle: 'SEMIANNUALLY',
      value: 39.9,
      split: [{ fixedValue: 1.5 }],
    });
    expect(calls.at(-1)!.key).toBe('master');
    await p.updateSubscription('sub_1', { amountCents: 7990, cycle: 'ANNUAL' });
    expect(JSON.parse(calls.at(-1)!.body)).toMatchObject({
      value: 79.9,
      cycle: 'YEARLY',
      updatePendingPayments: false,
    });
    await p.cancelSubscription('sub_1');
    expect(calls.at(-1)!.method).toBe('DELETE');
  });

  it('saldo, transferência, listagem e erros do gateway', async () => {
    const p = new AsaasPaymentProvider({ baseUrl: base, apiKey: 'master', webhookToken: TOKEN });
    expect(await p.balance({ apiKey: 's' })).toEqual({ availableCents: 12345 });
    expect(
      await p.transfer(15000, { pixKey: 'a@b.com', pixKeyType: 'EMAIL' }, { apiKey: 's' }),
    ).toMatchObject({
      status: 'PENDING',
      feeCents: 200,
    });
    expect(await p.listCharges({ createdFrom: '2026-03-01', createdTo: '2026-03-01' })).toEqual({
      items: [],
      hasMore: false,
    });
    await expect(
      p.createCharge({
        customerId: '',
        method: 'PIX',
        amountCents: 100,
        dueDate: '2026-01-01',
        description: 'x',
        externalReference: 'x',
      }),
    ).rejects.toThrow(PaymentProviderError);
    await expect(p.getCharge('nao-existe')).rejects.toMatchObject({ status: 404 });
  });
});

describe('mensagens de erro do Asaas sem descrição', () => {
  it('403 na criação de subconta explica a exigência de CNPJ', () => {
    expect(asaasStatusMessage(403, '/accounts')).toContain('pessoa jurídica (CNPJ)');
    expect(asaasStatusMessage(403, '/payments')).toContain('lista de IPs');
    expect(asaasStatusMessage(401, '/payments')).toContain('ASAAS_API_KEY');
    expect(asaasStatusMessage(500, '/payments')).toBe('Asaas respondeu 500');
  });
});
