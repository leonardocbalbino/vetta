import type { BillingCycle } from '@vetta/contracts';
import { safeEqual } from '../crypto';
import {
  PaymentProviderError,
  WebhookAuthError,
  type AccountReviewStatus,
  type CardInput,
  type Charge,
  type ChargeInput,
  type ChargeStatus,
  type CustomerInput,
  type KycRequirement,
  type PaymentMethodCode,
  type PaymentProvider,
  type ProviderContext,
  type Subaccount,
  type SubaccountInput,
  type SubscriptionInput,
  type SubscriptionPatch,
  type TokenizedCard,
  type Transfer,
  type TransferTarget,
  type WebhookEventNormalized,
} from './provider';

export const ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
export const ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';

export interface AsaasConfig {
  baseUrl: string;
  apiKey: string;
  /** Token configurado nos webhooks (header asaas-access-token). */
  webhookToken: string;
  /** walletId da conta da Vetta (destino da taxa no split). */
  platformWalletId?: string | undefined;
  /** Permite a URL de produção (só NODE_ENV=production). */
  allowProduction?: boolean;
  timeoutMs?: number;
}

const CYCLE: Record<BillingCycle, string> = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  SEMIANNUAL: 'SEMIANNUALLY',
  ANNUAL: 'YEARLY',
};

const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const toReais = (cents: number) => Number((cents / 100).toFixed(2));

const STATUS: Record<string, ChargeStatus> = {
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  RECEIVED: 'RECEIVED',
  RECEIVED_IN_CASH: 'RECEIVED',
  DUNNING_RECEIVED: 'RECEIVED',
  OVERDUE: 'OVERDUE',
  DUNNING_REQUESTED: 'OVERDUE',
  REFUNDED: 'REFUNDED',
  REFUND_REQUESTED: 'REFUNDED',
  REFUND_IN_PROGRESS: 'REFUNDED',
  CHARGEBACK_REQUESTED: 'CHARGEBACK',
  CHARGEBACK_DISPUTE: 'CHARGEBACK',
  AWAITING_CHARGEBACK_REVERSAL: 'CHARGEBACK',
};

const METHOD: Record<string, PaymentMethodCode> = {
  PIX: 'PIX',
  BOLETO: 'BOLETO',
  CREDIT_CARD: 'CREDIT_CARD',
};

interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType?: string;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  creditDate?: string | null;
  estimatedCreditDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
  subscription?: string | null;
  installment?: string | null;
  installmentNumber?: number | null;
  description?: string | null;
  deleted?: boolean;
}

export function mapAsaasPayment(p: AsaasPayment): Charge {
  const paidDay = p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate ?? null;
  return {
    id: p.id,
    status: p.deleted ? 'CANCELED' : (STATUS[p.status] ?? 'PENDING'),
    amountCents: toCents(p.value),
    netCents: toCents(p.netValue ?? p.value),
    method: p.billingType ? (METHOD[p.billingType] ?? null) : null,
    dueDate: p.dueDate,
    paidAt: paidDay ? new Date(`${paidDay}T12:00:00-03:00`) : null,
    creditDate: p.creditDate ?? p.estimatedCreditDate ?? null,
    invoiceUrl: p.invoiceUrl ?? null,
    boletoUrl: p.bankSlipUrl ?? null,
    externalReference: p.externalReference ?? null,
    subscriptionId: p.subscription ?? null,
    installmentId: p.installment ?? null,
    installmentNumber: p.installmentNumber ?? null,
    description: p.description ?? null,
  };
}

const ACCOUNT_STATUS: Record<string, AccountReviewStatus> = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  AWAITING_APPROVAL: 'UNDER_REVIEW',
  PENDING: 'PENDING',
};

const TRANSFER_STATUS: Record<string, Transfer['status']> = {
  PENDING: 'PENDING',
  BANK_PROCESSING: 'PENDING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELED',
};

/** Cliente HTTP do Asaas (API v3). Fora de produção, só o sandbox é aceito. */
/** Mensagem para respostas do Asaas sem descrição (o 403 costuma vir vazio). */
export function asaasStatusMessage(status: number, path: string): string {
  if (status === 401) return 'Chave do Asaas inválida (ASAAS_API_KEY).';
  if (status === 403 && path.startsWith('/accounts'))
    return 'O Asaas recusou a criação da subconta (403). A conta-mãe precisa ser de pessoa jurídica (CNPJ) e o IP do servidor precisa estar liberado, se houver lista de IPs.';
  if (status === 403)
    return 'O Asaas recusou a operação (403). Confira a lista de IPs autorizados e as permissões da conta.';
  return `Asaas respondeu ${status}`;
}

export class AsaasPaymentProvider implements PaymentProvider {
  readonly code = 'ASAAS' as const;

  constructor(private readonly config: AsaasConfig) {
    if (config.baseUrl.startsWith(ASAAS_PRODUCTION_URL) && !config.allowProduction) {
      throw new Error('Asaas de produção bloqueado fora de NODE_ENV=production. Use o sandbox.');
    }
  }

  get platformWalletId() {
    return this.config.platformWalletId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    ctx: ProviderContext = {},
    form?: FormData,
  ): Promise<T> {
    const headers: Record<string, string> = {
      access_token: ctx.apiKey ?? this.config.apiKey,
      'User-Agent': 'vetta',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 20_000),
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      if (res.ok) throw new PaymentProviderError('Resposta inválida do Asaas.', res.status);
    }
    if (!res.ok) {
      const errors = (json as { errors?: { description?: string }[] }).errors;
      throw new PaymentProviderError(
        errors?.map((e) => e.description).join(' ') || asaasStatusMessage(res.status, path),
        res.status,
        errors,
      );
    }
    return json as T;
  }

  async createCustomer(input: CustomerInput, ctx?: ProviderContext) {
    const c = await this.request<{ id: string }>(
      'POST',
      '/customers',
      {
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        mobilePhone: input.phone,
        postalCode: input.postalCode,
        addressNumber: input.addressNumber,
        externalReference: input.externalReference,
        // Os avisos de cobrança são nossos (NotificationService), não do gateway.
        notificationDisabled: true,
      },
      ctx,
    );
    return { id: c.id };
  }

  async tokenizeCard(input: CardInput, ctx?: ProviderContext): Promise<TokenizedCard> {
    const r = await this.request<{
      creditCardToken: string;
      creditCardBrand: string;
      creditCardNumber: string;
    }>(
      'POST',
      '/creditCard/tokenize',
      {
        customer: input.customerId,
        creditCard: input.card,
        creditCardHolderInfo: input.holder,
        remoteIp: ctx?.remoteIp,
      },
      ctx,
    );
    return {
      token: r.creditCardToken,
      brand: r.creditCardBrand,
      last4: r.creditCardNumber.slice(-4),
    };
  }

  private split(rules?: ChargeInput['split']) {
    return rules?.length
      ? rules.map((s) =>
          s.fixedCents !== undefined
            ? { walletId: s.walletId, fixedValue: toReais(s.fixedCents) }
            : { walletId: s.walletId, percentualValue: s.percent },
        )
      : undefined;
  }

  async createCharge(input: ChargeInput, ctx?: ProviderContext) {
    const installments =
      input.installments && input.installments > 1 ? input.installments : undefined;
    const p = await this.request<AsaasPayment>(
      'POST',
      '/payments',
      {
        customer: input.customerId,
        billingType: input.method,
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.externalReference,
        ...(installments
          ? { installmentCount: installments, totalValue: toReais(input.amountCents) }
          : { value: toReais(input.amountCents) }),
        creditCardToken: input.cardToken,
        remoteIp: ctx?.remoteIp,
        split: this.split(input.split),
      },
      ctx,
    );
    return mapAsaasPayment(p);
  }

  async getCharge(id: string, ctx?: ProviderContext) {
    return mapAsaasPayment(
      await this.request<AsaasPayment>('GET', `/payments/${id}`, undefined, ctx),
    );
  }

  async getPix(chargeId: string, ctx?: ProviderContext) {
    const r = await this.request<{ encodedImage: string; payload: string }>(
      'GET',
      `/payments/${chargeId}/pixQrCode`,
      undefined,
      ctx,
    );
    return { qrCode: r.encodedImage, copyPaste: r.payload };
  }

  async payWithCard(chargeId: string, card: CardInput, ctx?: ProviderContext) {
    const p = await this.request<AsaasPayment>(
      'POST',
      `/payments/${chargeId}/payWithCreditCard`,
      { creditCard: card.card, creditCardHolderInfo: card.holder },
      ctx,
    );
    return mapAsaasPayment(p);
  }

  async refundCharge(id: string, amountCents?: number, ctx?: ProviderContext) {
    const p = await this.request<AsaasPayment>(
      'POST',
      `/payments/${id}/refund`,
      amountCents ? { value: toReais(amountCents) } : {},
      ctx,
    );
    return mapAsaasPayment(p);
  }

  async listCharges(
    q: { createdFrom: string; createdTo: string; offset?: number },
    ctx?: ProviderContext,
  ) {
    const params = new URLSearchParams({
      'dateCreated[ge]': q.createdFrom,
      'dateCreated[le]': q.createdTo,
      offset: String(q.offset ?? 0),
      limit: '100',
    });
    const r = await this.request<{ data: AsaasPayment[]; hasMore: boolean }>(
      'GET',
      `/payments?${params}`,
      undefined,
      ctx,
    );
    return { items: r.data.map(mapAsaasPayment), hasMore: r.hasMore };
  }

  async listChargesOf(
    ref: { subscriptionId?: string; installmentId?: string },
    ctx?: ProviderContext,
  ) {
    const path = ref.subscriptionId
      ? `/subscriptions/${ref.subscriptionId}/payments`
      : `/installments/${ref.installmentId}/payments`;
    const r = await this.request<{ data: AsaasPayment[] }>('GET', path, undefined, ctx);
    return r.data.map(mapAsaasPayment);
  }

  async createSubscription(input: SubscriptionInput, ctx?: ProviderContext) {
    const s = await this.request<{ id: string }>(
      'POST',
      '/subscriptions',
      {
        customer: input.customerId,
        billingType: input.method,
        value: toReais(input.amountCents),
        nextDueDate: input.nextDueDate,
        cycle: CYCLE[input.cycle],
        description: input.description,
        externalReference: input.externalReference,
        creditCardToken: input.cardToken,
        remoteIp: ctx?.remoteIp,
        split: this.split(input.split),
      },
      ctx,
    );
    return { id: s.id };
  }

  async updateSubscription(id: string, patch: SubscriptionPatch, ctx?: ProviderContext) {
    await this.request(
      'POST',
      `/subscriptions/${id}`,
      {
        value: patch.amountCents === undefined ? undefined : toReais(patch.amountCents),
        cycle: patch.cycle ? CYCLE[patch.cycle] : undefined,
        billingType: patch.method,
        nextDueDate: patch.nextDueDate,
        creditCardToken: patch.cardToken,
        updatePendingPayments: patch.updatePendingCharges ?? false,
      },
      ctx,
    );
  }

  async cancelSubscription(id: string, ctx?: ProviderContext) {
    await this.request('DELETE', `/subscriptions/${id}`, undefined, ctx);
  }

  async createSubaccount(input: SubaccountInput): Promise<Subaccount> {
    const r = await this.request<{ id: string; walletId: string; apiKey: string }>(
      'POST',
      '/accounts',
      {
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        birthDate: input.birthDate,
        companyType: input.companyType,
        mobilePhone: input.mobilePhone,
        incomeValue: toReais(input.incomeValueCents),
        address: input.address.street,
        addressNumber: input.address.number,
        complement: input.address.complement,
        province: input.address.district,
        postalCode: input.address.postalCode,
        webhooks: [
          {
            name: 'vetta',
            url: input.webhookUrl,
            email: input.webhookEmail,
            sendType: 'SEQUENTIALLY',
            interrupted: false,
            enabled: true,
            apiVersion: 3,
            authToken: input.webhookToken,
            events: [
              'PAYMENT_CREATED',
              'PAYMENT_UPDATED',
              'PAYMENT_CONFIRMED',
              'PAYMENT_RECEIVED',
              'PAYMENT_OVERDUE',
              'PAYMENT_DELETED',
              'PAYMENT_REFUNDED',
              'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
              'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
              'PAYMENT_CHARGEBACK_REQUESTED',
              'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
              'ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED',
              'ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING',
              'ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL',
              'TRANSFER_DONE',
              'TRANSFER_FAILED',
              'TRANSFER_CANCELLED',
            ],
          },
        ],
      },
    );
    return { id: r.id, walletId: r.walletId, apiKey: r.apiKey };
  }

  async kycRequirements(ctx: ProviderContext): Promise<KycRequirement[]> {
    const r = await this.request<{
      data: { id: string; type: string; status: string; onboardingUrl?: string | null }[];
    }>('GET', '/myAccount/documents', undefined, ctx);
    return r.data.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      onboardingUrl: d.onboardingUrl ?? null,
    }));
  }

  async uploadKycDocument(
    requirementId: string,
    file: { type: string; name: string; mimeType: string; bytes: Buffer },
    ctx: ProviderContext,
  ) {
    const form = new FormData();
    form.append('type', file.type);
    form.append(
      'documentFile',
      new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
      file.name,
    );
    return this.request<{ id: string }>(
      'POST',
      `/myAccount/documents/${requirementId}`,
      undefined,
      ctx,
      form,
    );
  }

  async balance(ctx: ProviderContext) {
    const r = await this.request<{ balance: number }>('GET', '/finance/balance', undefined, ctx);
    return { availableCents: toCents(r.balance) };
  }

  async transfer(
    amountCents: number,
    target: TransferTarget,
    ctx: ProviderContext,
  ): Promise<Transfer> {
    const body =
      'pixKey' in target
        ? {
            value: toReais(amountCents),
            pixAddressKey: target.pixKey,
            pixAddressKeyType: target.pixKeyType,
          }
        : {
            value: toReais(amountCents),
            bankAccount: {
              bank: { code: target.bankAccount.bankCode },
              accountName: target.bankAccount.holderName,
              ownerName: target.bankAccount.holderName,
              cpfCnpj: target.bankAccount.holderDocument,
              agency: target.bankAccount.agency,
              account: target.bankAccount.account,
              accountDigit: target.bankAccount.accountDigit,
              bankAccountType: target.bankAccount.accountType,
            },
          };
    const r = await this.request<{
      id: string;
      status: string;
      transferFee?: number;
      failReason?: string;
    }>('POST', '/transfers', body, ctx);
    return {
      id: r.id,
      status: TRANSFER_STATUS[r.status] ?? 'PENDING',
      feeCents: toCents(r.transferFee),
      failureReason: r.failReason ?? null,
    };
  }

  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): WebhookEventNormalized {
    const raw = headers['asaas-access-token'];
    const token = Array.isArray(raw) ? raw[0] : raw;
    if (!token || !safeEqual(token, this.config.webhookToken))
      throw new WebhookAuthError('Token do webhook inválido.');
    return this.normalizeWebhook(body);
  }

  /** Normaliza sem checar o token (reprocessamento de eventos já autenticados). */
  normalizeWebhook(body: unknown): WebhookEventNormalized {
    const b = body as {
      id?: string;
      event?: string;
      dateCreated?: string;
      payment?: AsaasPayment;
      account?: { id?: string };
      accountStatus?: { id?: string; general?: string };
      transfer?: { id: string; status: string; transferFee?: number; failReason?: string };
    };
    if (!b?.id || !b.event) throw new WebhookAuthError('Evento sem id ou tipo.');
    const occurredAt = b.dateCreated
      ? new Date(b.dateCreated.replace(' ', 'T') + '-03:00')
      : new Date();
    const base = {
      id: b.id,
      type: b.event,
      occurredAt,
      raw: body,
      accountId: b.account?.id ?? null,
    };

    if (b.event.startsWith('PAYMENT_') && b.payment) {
      const action =
        {
          PAYMENT_CONFIRMED: 'CONFIRMED',
          PAYMENT_RECEIVED: 'RECEIVED',
          PAYMENT_OVERDUE: 'OVERDUE',
          PAYMENT_REFUNDED: 'REFUNDED',
          PAYMENT_PARTIALLY_REFUNDED: 'REFUNDED',
          PAYMENT_DELETED: 'CANCELED',
          PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'FAILED',
          PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'FAILED',
          PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
          PAYMENT_CREATED: 'CREATED',
        }[b.event] ?? 'UPDATED';
      const charge = mapAsaasPayment({
        ...b.payment,
        deleted: b.event === 'PAYMENT_DELETED' || b.payment.deleted,
      });
      return { ...base, kind: 'charge', action, charge, resourceId: b.payment.id };
    }
    if (b.event.startsWith('ACCOUNT_STATUS_') && b.accountStatus) {
      const general = b.event.replace('ACCOUNT_STATUS_GENERAL_APPROVAL_', '');
      return {
        ...base,
        kind: 'account',
        action: general,
        accountId: b.accountStatus.id ?? base.accountId,
        account: { status: ACCOUNT_STATUS[general] ?? 'UNDER_REVIEW', reason: null },
        resourceId: b.accountStatus.id ?? null,
      };
    }
    if (b.event.startsWith('TRANSFER_') && b.transfer) {
      return {
        ...base,
        kind: 'transfer',
        action: b.event.replace('TRANSFER_', ''),
        transfer: {
          id: b.transfer.id,
          status: TRANSFER_STATUS[b.transfer.status] ?? 'PENDING',
          feeCents: toCents(b.transfer.transferFee),
          failureReason: b.transfer.failReason ?? null,
        },
        resourceId: b.transfer.id,
      };
    }
    return { ...base, kind: 'other', action: b.event, resourceId: null };
  }
}

/** Gateway não configurado: rotas respondem 503 PAYMENT_NOT_CONFIGURED. */
export class PaymentNotConfiguredError extends Error {
  constructor() {
    super('Pagamentos não configurados neste ambiente (defina ASAAS_API_KEY do sandbox).');
  }
}
