import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Dublê do sandbox do Asaas (API v3) para os testes: mesmas rotas, formatos de
 * resposta e de webhook. O cliente HTTP real (AsaasPaymentProvider) fala com ele.
 */

export const WEBHOOK_TOKEN = 'whk-test-token-0123456789';
/** Número que o sandbox recusa (simula cartão negado). */
export const DECLINED_CARD = '5184019740373151';

export interface FakePayment {
  object: 'payment';
  id: string;
  customer: string;
  subscription: string | null;
  installment: string | null;
  installmentNumber: number | null;
  dueDate: string;
  value: number;
  netValue: number;
  billingType: string;
  status: string;
  description: string | null;
  externalReference: string | null;
  invoiceUrl: string;
  bankSlipUrl: string | null;
  paymentDate: string | null;
  clientPaymentDate: string | null;
  confirmedDate: string | null;
  creditDate: string | null;
  estimatedCreditDate: string | null;
  dateCreated: string;
  deleted: boolean;
  split: unknown;
  apiKey: string;
}

interface FakeSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: string;
  nextDueDate: string;
  billingType: string;
  externalReference: string | null;
  description: string | null;
  deleted: boolean;
  creditCardToken: string | null;
  split: unknown;
  apiKey: string;
}

/** O Asaas trabalha com datas de Brasília. */
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
/** Taxa do gateway no dublê: 2,49% (Pix/boleto R$ 0,99 fixo). */
const fee = (value: number, type: string) =>
  Number((type === 'CREDIT_CARD' ? value * 0.0249 : 0.99).toFixed(2));

export class FakeAsaas {
  server!: Server;
  url = '';
  payments = new Map<string, FakePayment>();
  subscriptions = new Map<string, FakeSubscription>();
  accounts: { id: string; walletId: string; apiKey: string; body: Record<string, unknown> }[] = [];
  transfers: { id: string; value: number; apiKey: string; body: unknown }[] = [];
  documents: { requirementId: string; apiKey: string; size: number }[] = [];
  balances = new Map<string, number>();
  calls: { method: string; path: string; apiKey: string; body: unknown }[] = [];
  private seq = 0;

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}_${String(this.seq).padStart(10, '0')}`;
  }

  async start() {
    this.server = createServer((req, res) => {
      void this.handle(req).then(
        ({ status, body }) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        },
        (err: Error) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ errors: [{ code: 'internal', description: err.message }] }));
        },
      );
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  stop() {
    return new Promise<void>((r) => this.server.close(() => r()));
  }

  private read(req: IncomingMessage): Promise<{ json: Record<string, unknown>; raw: Buffer }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks);
        const isJson = (req.headers['content-type'] ?? '').includes('json');
        resolve({ json: isJson && raw.length ? JSON.parse(raw.toString()) : {}, raw });
      });
    });
  }

  private err(description: string, status = 400) {
    return { status, body: { errors: [{ code: 'invalid_action', description }] } };
  }

  private newPayment(
    input: Partial<FakePayment> & {
      customer: string;
      value: number;
      dueDate: string;
      billingType: string;
      apiKey: string;
    },
  ) {
    const id = this.id('pay');
    const p: FakePayment = {
      object: 'payment',
      id,
      subscription: null,
      installment: null,
      installmentNumber: null,
      status: 'PENDING',
      description: null,
      externalReference: null,
      invoiceUrl: `https://sandbox.asaas.com/i/${id.slice(4)}`,
      bankSlipUrl:
        input.billingType === 'BOLETO' ? `https://sandbox.asaas.com/b/pdf/${id.slice(4)}` : null,
      paymentDate: null,
      clientPaymentDate: null,
      confirmedDate: null,
      creditDate: null,
      estimatedCreditDate: null,
      dateCreated: today(),
      deleted: false,
      split: null,
      netValue: Number((input.value - fee(input.value, input.billingType)).toFixed(2)),
      ...input,
    };
    this.payments.set(id, p);
    return p;
  }

  /** Marca como pago (como o sandbox faz ao "confirmar pagamento" no painel). */
  pay(paymentId: string, status: 'RECEIVED' | 'CONFIRMED' = 'RECEIVED') {
    const p = this.payments.get(paymentId)!;
    p.status = status;
    p.paymentDate = today();
    p.clientPaymentDate = today();
    p.confirmedDate = today();
    p.creditDate = p.billingType === 'CREDIT_CARD' ? addDays(today(), 30) : today();
    p.estimatedCreditDate = p.creditDate;
    return p;
  }

  /** Gera a próxima cobrança de uma assinatura (o sandbox faz isso antes do vencimento). */
  nextCharge(subscriptionId: string, dueDate = addDays(today(), 3)) {
    const s = this.subscriptions.get(subscriptionId)!;
    return this.newPayment({
      customer: s.customer,
      value: s.value,
      dueDate,
      billingType: s.billingType,
      subscription: s.id,
      externalReference: s.externalReference,
      description: s.description,
      apiKey: s.apiKey,
      split: s.split,
    });
  }

  /** Payload de webhook no formato do sandbox. */
  webhook(
    event: string,
    paymentId: string,
    overrides: Partial<FakePayment> = {},
    eventId?: string,
  ) {
    const p = { ...this.payments.get(paymentId)!, ...overrides } as Partial<FakePayment>;
    delete p.apiKey;
    return {
      id: eventId ?? `evt_${Math.random().toString(16).slice(2)}&${this.seq++}`,
      event,
      dateCreated: new Date().toISOString().slice(0, 19).replace('T', ' '),
      payment: p,
    };
  }

  accountWebhook(accountId: string, status: 'APPROVED' | 'REJECTED' | 'AWAITING_APPROVAL') {
    return {
      id: `evt_acc_${Math.random().toString(16).slice(2)}`,
      event: `ACCOUNT_STATUS_GENERAL_APPROVAL_${status}`,
      dateCreated: new Date().toISOString().slice(0, 19).replace('T', ' '),
      accountStatus: {
        id: accountId,
        general: status,
        documentation: status,
        commercialInfo: status,
        bankAccountInfo: status,
      },
    };
  }

  transferWebhook(transferId: string, status: 'DONE' | 'FAILED') {
    return {
      id: `evt_tr_${Math.random().toString(16).slice(2)}`,
      event: `TRANSFER_${status}`,
      dateCreated: new Date().toISOString().slice(0, 19).replace('T', ' '),
      transfer: {
        object: 'transfer',
        id: transferId,
        status,
        value: 0,
        transferFee: 0,
        failReason: status === 'FAILED' ? 'Conta inválida' : null,
      },
    };
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; body: unknown }> {
    const url = new URL(req.url!, 'http://x');
    const path = url.pathname;
    const apiKey = String(req.headers.access_token ?? '');
    const { json, raw } = await this.read(req);
    this.calls.push({ method: req.method!, path, apiKey, body: json });
    if (!apiKey) return this.err('access_token ausente', 401);
    const m = req.method;

    if (m === 'POST' && path === '/customers') {
      if (!json.cpfCnpj) return this.err('O campo cpfCnpj é obrigatório.');
      return { status: 200, body: { object: 'customer', id: this.id('cus'), ...json } };
    }
    if (m === 'POST' && path === '/creditCard/tokenize') {
      const card = json.creditCard as { number: string };
      if (card.number === DECLINED_CARD)
        return this.err('Transação não autorizada. Verifique os dados do cartão.');
      return {
        status: 200,
        body: {
          creditCardNumber: card.number.slice(-4),
          creditCardBrand: 'VISA',
          creditCardToken: `tok_${card.number.slice(-4)}_${this.seq++}`,
        },
      };
    }
    if (m === 'POST' && path === '/payments') {
      const billingType = String(json.billingType);
      const n = Number(json.installmentCount ?? 1);
      const total = Number(json.totalValue ?? json.value);
      const card = billingType === 'CREDIT_CARD' && json.creditCardToken;
      if (n > 1) {
        const installment = this.id('ins');
        const each = Number((total / n).toFixed(2));
        const created = Array.from({ length: n }, (_, i) =>
          this.newPayment({
            customer: String(json.customer),
            value: i === n - 1 ? Number((total - each * (n - 1)).toFixed(2)) : each,
            dueDate: addMonthsIso(String(json.dueDate), i),
            billingType,
            installment,
            installmentNumber: i + 1,
            externalReference: (json.externalReference as string) ?? null,
            description: (json.description as string) ?? null,
            apiKey,
            split: json.split ?? null,
          }),
        );
        if (card) for (const p of created) this.pay(p.id, 'CONFIRMED');
        return { status: 200, body: strip(created[0]!) };
      }
      const p = this.newPayment({
        customer: String(json.customer),
        value: total,
        dueDate: String(json.dueDate),
        billingType,
        externalReference: (json.externalReference as string) ?? null,
        description: (json.description as string) ?? null,
        apiKey,
        split: json.split ?? null,
      });
      if (card) this.pay(p.id, 'CONFIRMED');
      return { status: 200, body: strip(p) };
    }
    let r = /^\/payments\/([\w-]+)$/.exec(path);
    if (r && m === 'GET') {
      const p = this.payments.get(r[1]!);
      return p ? { status: 200, body: strip(p) } : this.err('Cobrança não encontrada.', 404);
    }
    r = /^\/payments\/([\w-]+)\/pixQrCode$/.exec(path);
    if (r)
      return {
        status: 200,
        body: {
          encodedImage: 'iVBORw0KGgo=',
          payload: `00020126580014br.gov.bcb.pix0136${r[1]}`,
          expirationDate: `${addDays(today(), 1)} 23:59:59`,
        },
      };
    r = /^\/payments\/([\w-]+)\/payWithCreditCard$/.exec(path);
    if (r) {
      const card = json.creditCard as { number: string };
      if (card?.number === DECLINED_CARD) return this.err('Transação não autorizada.');
      const p = this.payments.get(r[1]!)!;
      p.billingType = 'CREDIT_CARD';
      p.netValue = Number((p.value - fee(p.value, 'CREDIT_CARD')).toFixed(2));
      return { status: 200, body: strip(this.pay(p.id, 'CONFIRMED')) };
    }
    r = /^\/payments\/([\w-]+)\/refund$/.exec(path);
    if (r) {
      const p = this.payments.get(r[1]!)!;
      p.status = 'REFUNDED';
      return { status: 200, body: strip(p) };
    }
    if (m === 'GET' && path === '/payments') {
      const ge = url.searchParams.get('dateCreated[ge]');
      const le = url.searchParams.get('dateCreated[le]');
      const data = [...this.payments.values()].filter(
        (p) => p.apiKey === apiKey && (!ge || p.dateCreated >= ge) && (!le || p.dateCreated <= le),
      );
      return {
        status: 200,
        body: { object: 'list', hasMore: false, totalCount: data.length, data: data.map(strip) },
      };
    }
    if (m === 'POST' && path === '/subscriptions') {
      const s: FakeSubscription = {
        id: this.id('sub'),
        customer: String(json.customer),
        value: Number(json.value),
        cycle: String(json.cycle),
        nextDueDate: String(json.nextDueDate),
        billingType: String(json.billingType),
        externalReference: (json.externalReference as string) ?? null,
        description: (json.description as string) ?? null,
        deleted: false,
        creditCardToken: (json.creditCardToken as string) ?? null,
        split: json.split ?? null,
        apiKey,
      };
      this.subscriptions.set(s.id, s);
      // Como o sandbox: a primeira cobrança nasce junto, no próximo vencimento.
      this.nextCharge(s.id, s.nextDueDate);
      return { status: 200, body: { object: 'subscription', ...s } };
    }
    r = /^\/subscriptions\/([\w-]+)\/payments$/.exec(path);
    if (r) {
      const data = [...this.payments.values()].filter((p) => p.subscription === r![1]);
      return { status: 200, body: { object: 'list', hasMore: false, data: data.map(strip) } };
    }
    r = /^\/subscriptions\/([\w-]+)$/.exec(path);
    if (r) {
      const s = this.subscriptions.get(r[1]!);
      if (!s) return this.err('Assinatura não encontrada.', 404);
      if (m === 'DELETE') {
        s.deleted = true;
        return { status: 200, body: { deleted: true, id: s.id } };
      }
      if (json.value !== undefined) s.value = Number(json.value);
      if (json.cycle) s.cycle = String(json.cycle);
      if (json.nextDueDate) s.nextDueDate = String(json.nextDueDate);
      if (json.billingType) s.billingType = String(json.billingType);
      return { status: 200, body: { object: 'subscription', ...s } };
    }
    r = /^\/installments\/([\w-]+)\/payments$/.exec(path);
    if (r) {
      const data = [...this.payments.values()].filter((p) => p.installment === r![1]);
      return { status: 200, body: { object: 'list', hasMore: false, data: data.map(strip) } };
    }
    if (m === 'POST' && path === '/accounts') {
      const a = {
        id: crypto.randomUUID(),
        walletId: crypto.randomUUID(),
        apiKey: `$aact_sub_${this.seq++}`,
        body: json,
      };
      this.accounts.push(a);
      return {
        status: 200,
        body: { object: 'account', id: a.id, walletId: a.walletId, apiKey: a.apiKey },
      };
    }
    if (m === 'GET' && path === '/myAccount/documents') {
      return {
        status: 200,
        body: {
          rejectReasons: null,
          data: [
            {
              id: 'req-identification',
              status: 'NOT_SENT',
              type: 'IDENTIFICATION',
              title: 'Documento de identificação',
              onboardingUrl: 'https://sandbox.asaas.com/onboarding/abc',
            },
          ],
        },
      };
    }
    r = /^\/myAccount\/documents\/([\w-]+)$/.exec(path);
    if (r && m === 'POST') {
      this.documents.push({ requirementId: r[1]!, apiKey, size: raw.length });
      return { status: 200, body: { id: `docfile-${this.seq++}`, status: 'PENDING' } };
    }
    if (path === '/finance/balance')
      return { status: 200, body: { balance: this.balances.get(apiKey) ?? 0 } };
    if (m === 'POST' && path === '/transfers') {
      const t = { id: crypto.randomUUID(), value: Number(json.value), apiKey, body: json };
      this.transfers.push(t);
      return {
        status: 200,
        body: { object: 'transfer', id: t.id, status: 'PENDING', value: t.value, transferFee: 0 },
      };
    }
    return this.err(`Rota não simulada: ${m} ${path}`, 404);
  }
}

function strip(p: FakePayment) {
  const { apiKey: _k, ...rest } = p;
  return rest;
}

export function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Variáveis de ambiente da API apontando para o dublê. */
export const asaasEnv = (fake: FakeAsaas) => ({
  ASAAS_BASE_URL: fake.url,
  ASAAS_API_KEY: '$aact_master_test',
  ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
  ASAAS_PLATFORM_WALLET_ID: 'wallet-vetta-test',
});
