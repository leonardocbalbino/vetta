import type { BillingCycle } from '@vetta/contracts';

/**
 * Abstração de gateway de pagamento. A implementação atual é o Asaas (subcontas,
 * split, Pix, boleto, cartão e recorrência); Pagar.me entra como segunda implementação.
 * Valores sempre em centavos; datas civis em "YYYY-MM-DD".
 */

export type PaymentMethodCode = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

/** Status normalizado de uma cobrança no gateway. */
export type ChargeStatus =
  'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'CANCELED' | 'CHARGEBACK';

export interface Charge {
  id: string;
  status: ChargeStatus;
  amountCents: number;
  netCents: number;
  method: PaymentMethodCode | null;
  dueDate: string;
  paidAt: Date | null;
  /** Quando o valor fica disponível na carteira. */
  creditDate: string | null;
  invoiceUrl: string | null;
  boletoUrl: string | null;
  externalReference: string | null;
  subscriptionId: string | null;
  installmentId: string | null;
  installmentNumber: number | null;
  description: string | null;
}

/** Chave da subconta (cobranças do personal); sem ela, usa a conta da plataforma. */
export interface ProviderContext {
  apiKey?: string;
  remoteIp?: string;
}

export interface CustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string | undefined;
  postalCode?: string | undefined;
  addressNumber?: string | undefined;
  externalReference?: string;
}

export interface CardInput {
  customerId: string;
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  holder: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
}

export interface TokenizedCard {
  token: string;
  brand: string;
  last4: string;
}

export interface SplitRule {
  walletId: string;
  /** Percentual (0–100) sobre o valor líquido. */
  percent?: number;
  fixedCents?: number;
}

export interface ChargeInput {
  customerId: string;
  method: PaymentMethodCode;
  amountCents: number;
  dueDate: string;
  description: string;
  externalReference: string;
  /** Parcelado no cartão: amountCents é o total. */
  installments?: number;
  cardToken?: string | undefined;
  split?: SplitRule[];
}

export interface SubscriptionInput {
  customerId: string;
  method: PaymentMethodCode;
  amountCents: number;
  cycle: BillingCycle;
  nextDueDate: string;
  description: string;
  externalReference: string;
  cardToken?: string | undefined;
  split?: SplitRule[];
}

export interface SubscriptionPatch {
  amountCents?: number;
  cycle?: BillingCycle;
  method?: PaymentMethodCode;
  nextDueDate?: string;
  cardToken?: string;
  /** Atualiza também as cobranças pendentes. */
  updatePendingCharges?: boolean;
}

export interface SubaccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string | undefined;
  companyType?: string | undefined;
  mobilePhone: string;
  incomeValueCents: number;
  address: {
    street: string;
    number: string;
    complement?: string | undefined;
    district: string;
    postalCode: string;
  };
  webhookUrl: string;
  webhookToken: string;
  webhookEmail: string;
}

export interface Subaccount {
  id: string;
  walletId: string;
  apiKey: string;
}

export interface KycRequirement {
  id: string;
  type: string;
  status: string;
  onboardingUrl: string | null;
}

export type TransferTarget =
  | { pixKey: string; pixKeyType: string }
  | {
      bankAccount: {
        bankCode: string;
        agency: string;
        account: string;
        accountDigit: string;
        accountType: string;
        holderName: string;
        holderDocument: string;
      };
    };

export interface Transfer {
  id: string;
  status: 'PENDING' | 'DONE' | 'FAILED' | 'CANCELED';
  feeCents: number;
  failureReason: string | null;
}

export type AccountReviewStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

/** Webhook normalizado. */
export interface WebhookEventNormalized {
  id: string;
  /** Tipo original do gateway (ex.: PAYMENT_RECEIVED). */
  type: string;
  kind: 'charge' | 'account' | 'transfer' | 'other';
  /** CONFIRMED, RECEIVED, OVERDUE, REFUNDED, CANCELED, FAILED, CREATED, UPDATED, CHARGEBACK. */
  action: string;
  occurredAt: Date;
  charge?: Charge;
  /** Conta (subconta) a que o evento pertence. */
  accountId?: string | null;
  account?: { status: AccountReviewStatus; reason: string | null };
  transfer?: Transfer & { id: string };
  resourceId: string | null;
  raw: unknown;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class WebhookAuthError extends Error {}

export interface PaymentProvider {
  readonly code: 'ASAAS' | 'PAGARME';
  createCustomer(input: CustomerInput, ctx?: ProviderContext): Promise<{ id: string }>;
  tokenizeCard(input: CardInput, ctx?: ProviderContext): Promise<TokenizedCard>;
  createCharge(input: ChargeInput, ctx?: ProviderContext): Promise<Charge>;
  getCharge(id: string, ctx?: ProviderContext): Promise<Charge>;
  getPix(chargeId: string, ctx?: ProviderContext): Promise<{ qrCode: string; copyPaste: string }>;
  /** Paga uma cobrança existente com cartão (o aluno escolhe cartão na fatura). */
  payWithCard(chargeId: string, card: CardInput, ctx?: ProviderContext): Promise<Charge>;
  refundCharge(id: string, amountCents?: number, ctx?: ProviderContext): Promise<Charge>;
  listCharges(
    q: { createdFrom: string; createdTo: string; offset?: number },
    ctx?: ProviderContext,
  ): Promise<{ items: Charge[]; hasMore: boolean }>;
  /** Cobranças de uma assinatura ou de um parcelamento. */
  listChargesOf(
    ref: { subscriptionId?: string; installmentId?: string },
    ctx?: ProviderContext,
  ): Promise<Charge[]>;
  createSubscription(input: SubscriptionInput, ctx?: ProviderContext): Promise<{ id: string }>;
  updateSubscription(id: string, patch: SubscriptionPatch, ctx?: ProviderContext): Promise<void>;
  cancelSubscription(id: string, ctx?: ProviderContext): Promise<void>;
  createSubaccount(input: SubaccountInput): Promise<Subaccount>;
  kycRequirements(ctx: ProviderContext): Promise<KycRequirement[]>;
  uploadKycDocument(
    requirementId: string,
    file: { type: string; name: string; mimeType: string; bytes: Buffer },
    ctx: ProviderContext,
  ): Promise<{ id: string }>;
  balance(ctx: ProviderContext): Promise<{ availableCents: number }>;
  transfer(amountCents: number, target: TransferTarget, ctx: ProviderContext): Promise<Transfer>;
  /** Verifica a autenticidade e normaliza o evento. Lança WebhookAuthError. */
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): WebhookEventNormalized;
  normalizeWebhook(body: unknown): WebhookEventNormalized;
}

/** Converte o status do gateway no status da nossa fatura. */
export function invoiceStatusOf(
  s: ChargeStatus,
): 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'REFUNDED' {
  switch (s) {
    case 'CONFIRMED':
    case 'RECEIVED':
      return 'PAID';
    case 'OVERDUE':
      return 'OVERDUE';
    case 'REFUNDED':
    case 'CHARGEBACK':
      return 'REFUNDED';
    case 'CANCELED':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

const RANK = { PENDING: 0, OVERDUE: 1, CANCELED: 2, PAID: 3, REFUNDED: 4 } as const;
export type InvoiceStatusCode = keyof typeof RANK;

/**
 * Webhooks chegam fora de ordem: o status só avança. Um PAYMENT_CREATED atrasado
 * não desfaz um pagamento; estorno vale depois do pagamento; cancelar não apaga pago.
 * Exceção: cobrança vencida que recebe novo vencimento volta a PENDING.
 */
export function nextInvoiceStatus(
  current: InvoiceStatusCode,
  incoming: InvoiceStatusCode,
  opts: { dueDateMovedForward?: boolean } = {},
): InvoiceStatusCode {
  if (current === 'OVERDUE' && incoming === 'PENDING' && opts.dueDateMovedForward) return 'PENDING';
  return RANK[incoming] > RANK[current] ? incoming : current;
}
