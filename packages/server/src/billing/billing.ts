import type { BillingCycle, PlanCode } from '@vetta/contracts';
export { localDate } from '../jobs/engagement';

/**
 * Regras de cobrança puras (sem I/O): ciclos, pró-rata, cupons, carência e
 * réguas de lembrete. Valores sempre em centavos; datas civis em "YYYY-MM-DD".
 */

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

/** Carência da assinatura da plataforma antes do downgrade para FREE. */
export const PLATFORM_GRACE_DAYS = 7;
/** Avisos da fatura da plataforma: 7 dias antes, 1 dia antes e no dia. */
export const PLATFORM_REMINDER_OFFSETS = [-7, -1, 0] as const;
/** Lembretes da fatura do aluno: 3 dias antes, no dia, 1 e 5 dias depois. */
export const STUDENT_REMINDER_OFFSETS = [-3, 0, 1, 5] as const;
/** Aviso de fim do plano vendido ao aluno. */
export const PLAN_END_NOTICE_DAYS = 7;

const DAY = 86_400_000;

/** Soma meses mantendo o dia; se o mês não tiver o dia, usa o último (31/01 + 1 = 28/02). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export const addCycle = (date: Date, cycle: BillingCycle, times = 1) =>
  addMonths(date, CYCLE_MONTHS[cycle] * times);

export const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Dias entre duas datas civis (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

// ─── Pró-rata ────────────────────────────────────────────────────────────────

export interface ProrationInput {
  /** Valor pago pelo período atual (já com desconto). */
  paidCents: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
  /** Preço do novo plano no ciclo escolhido. */
  newAmountCents: number;
  /** Preço mensal equivalente do plano atual e do novo, para classificar a troca. */
  currentMonthlyCents: number;
  newMonthlyCents: number;
}

export type PlanChangeKind = 'UPGRADE' | 'DOWNGRADE' | 'SAME';

export interface Proration {
  kind: PlanChangeKind;
  /** Crédito do tempo não usado (arredondado a favor do cliente). */
  creditCents: number;
  /** Valor da primeira cobrança do novo plano (upgrade). */
  chargeNowCents: number;
  /** Crédito que não coube na primeira cobrança (abate nas seguintes). */
  leftoverCreditCents: number;
  /** Downgrade só vale no fim do período atual. */
  effectiveAt: Date;
}

/**
 * Upgrade: começa agora; o tempo não usado do período atual vira desconto na
 * primeira cobrança. Downgrade: vale no fim do período, sem crédito.
 */
export function prorate(i: ProrationInput): Proration {
  const kind: PlanChangeKind =
    i.newMonthlyCents > i.currentMonthlyCents
      ? 'UPGRADE'
      : i.newMonthlyCents < i.currentMonthlyCents
        ? 'DOWNGRADE'
        : 'SAME';
  if (kind !== 'UPGRADE') {
    return {
      kind,
      creditCents: 0,
      chargeNowCents: 0,
      leftoverCreditCents: 0,
      effectiveAt: i.periodEnd > i.now ? i.periodEnd : i.now,
    };
  }
  const total = i.periodEnd.getTime() - i.periodStart.getTime();
  const remaining = Math.min(Math.max(i.periodEnd.getTime() - i.now.getTime(), 0), total);
  const creditCents = total > 0 ? Math.ceil((i.paidCents * remaining) / total) : 0;
  const chargeNowCents = Math.max(i.newAmountCents - creditCents, 0);
  return {
    kind,
    creditCents,
    chargeNowCents,
    leftoverCreditCents: Math.max(creditCents - i.newAmountCents, 0),
    effectiveAt: i.now,
  };
}

/** Preço mensal equivalente (para comparar planos em ciclos diferentes). */
export const monthlyEquivalent = (amountCents: number, cycle: BillingCycle) =>
  Math.round(amountCents / CYCLE_MONTHS[cycle]);

// ─── Cupons ──────────────────────────────────────────────────────────────────

export interface CouponRules {
  discountType: 'PERCENT' | 'FIXED';
  percentOff: number | null;
  amountOffCents: number | null;
  durationCycles: number | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  planCodes: PlanCode[];
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
}

export type CouponProblem = 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'EXHAUSTED' | 'WRONG_PLAN';

export const COUPON_MESSAGES: Record<CouponProblem, string> = {
  INACTIVE: 'Este cupom não está ativo.',
  NOT_STARTED: 'Este cupom ainda não está valendo.',
  EXPIRED: 'Este cupom expirou.',
  EXHAUSTED: 'Este cupom atingiu o limite de usos.',
  WRONG_PLAN: 'Este cupom não vale para o plano escolhido.',
};

export function couponProblem(c: CouponRules, plan: PlanCode, now: Date): CouponProblem | null {
  if (!c.isActive) return 'INACTIVE';
  if (c.validFrom && now < c.validFrom) return 'NOT_STARTED';
  if (c.validUntil && now > c.validUntil) return 'EXPIRED';
  if (c.maxRedemptions !== null && c.redemptionsCount >= c.maxRedemptions) return 'EXHAUSTED';
  if (c.planCodes.length && !c.planCodes.includes(plan)) return 'WRONG_PLAN';
  return null;
}

/** Desconto do cupom sobre um valor (nunca maior que o valor). */
export function couponDiscount(
  c: Pick<CouponRules, 'discountType' | 'percentOff' | 'amountOffCents'>,
  amountCents: number,
): number {
  const raw =
    c.discountType === 'PERCENT'
      ? Math.round((amountCents * (c.percentOff ?? 0)) / 100)
      : (c.amountOffCents ?? 0);
  return Math.min(Math.max(raw, 0), amountCents);
}

/** O cupom ainda vale para a cobrança de número `cycleIndex` (0 = primeira)? */
export const couponAppliesToCycle = (c: Pick<CouponRules, 'durationCycles'>, cycleIndex: number) =>
  c.durationCycles === null || cycleIndex < c.durationCycles;

// ─── Split ───────────────────────────────────────────────────────────────────

/** Taxa da plataforma em pontos-base (299 = 2,99%) sobre o valor. */
export const platformFeeCents = (amountCents: number, bps: number) =>
  Math.round((amountCents * Math.max(bps, 0)) / 10_000);

// ─── Réguas ──────────────────────────────────────────────────────────────────

/**
 * Se hoje é dia de lembrete: devolve o deslocamento (hoje - vencimento) que bateu
 * com a régua, ou null.
 */
export function reminderOffset(
  dueDate: string,
  today: string,
  offsets: readonly number[],
): number | null {
  const offset = daysBetween(dueDate, today);
  return offsets.includes(offset) ? offset : null;
}

/** Fim da carência da assinatura da plataforma (vencimento + 7 dias). */
export const graceEndsOn = (dueDate: string, graceDays = PLATFORM_GRACE_DAYS) =>
  toDateOnly(new Date(Date.parse(`${dueDate}T00:00:00Z`) + graceDays * DAY));

/** Aluno inadimplente deve ser bloqueado hoje? (dias de atraso > tolerância). */
export const shouldBlockStudent = (dueDate: string, today: string, toleranceDays: number) =>
  daysBetween(dueDate, today) > toleranceDays;

/** Data civil + N dias. */
export const addDaysToDate = (date: string, days: number) =>
  toDateOnly(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY));
