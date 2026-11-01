import { FALLBACK_PLAN, UNLIMITED, type BillingCycle } from '@vetta/contracts';
import type { Prisma, PrismaClient } from '@vetta/db';
import { decryptSecret, encryptSecret, randomToken, sha256 } from '../crypto';
import type { EventPublisher } from '../events';
import type { PaymentProvider, SplitRule } from '../payments/provider';
import { addCycle, couponAppliesToCycle, couponDiscount, toDateOnly } from './billing';

export interface BillingDeps {
  db: PrismaClient;
  provider: PaymentProvider | null;
  publisher: EventPublisher;
  invalidateTenant: (tenantId: string) => Promise<void>;
  encryptionKey: string;
  platformWalletId?: string | undefined;
  now?: () => Date;
}

const ACTIVE_LINK = ['INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE'] as const;

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Downgrade para o FREE sem apagar nada: arquiva os alunos excedentes (os que
 * estão há mais tempo sem treinar primeiro). O resto dos dados fica somente leitura
 * pelo próprio plano (features desligadas).
 */
export async function downgradeToFree(
  tx: Tx,
  tenantId: string,
  reason: string,
  now: Date,
): Promise<{ archived: number; max: number }> {
  const free = await tx.plan.findUniqueOrThrow({
    where: { code: FALLBACK_PLAN },
    include: { features: { where: { featureKey: 'students.max' } } },
  });
  const max = free.features[0]?.value ?? 2;
  await tx.tenantSubscription.update({
    where: { tenantId },
    data: {
      planId: free.id,
      status: 'ACTIVE',
      cycle: 'MONTHLY',
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      pendingCycle: null,
      pastDueSince: null,
      graceEndsAt: null,
      gatewaySubscriptionId: null,
      couponId: null,
      couponCyclesUsed: 0,
    },
  });
  if (max === UNLIMITED) return { archived: 0, max };
  const links = await tx.studentLink.findMany({
    where: { tenantId, status: { in: [...ACTIVE_LINK] }, deletedAt: null },
    orderBy: [{ lastWorkoutAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const excess = links.slice(0, Math.max(0, links.length - max)).map((l) => l.id);
  if (excess.length) {
    await tx.studentLink.updateMany({
      where: { id: { in: excess } },
      data: { status: 'ARCHIVED', archivedAt: now, archivedReason: reason },
    });
  }
  return { archived: excess.length, max };
}

/** Valor da próxima cobrança recorrente considerando o cupom (duração em ciclos). */
export async function recurringAmount(
  db: Tx,
  planId: string,
  cycle: BillingCycle,
  couponId: string | null,
  cyclesUsed: number,
): Promise<number> {
  const price = await db.planPrice.findUniqueOrThrow({
    where: { planId_cycle: { planId, cycle } },
  });
  if (!couponId) return price.amountCents;
  const coupon = await db.coupon.findUnique({ where: { id: couponId } });
  if (!coupon || !couponAppliesToCycle(coupon, cyclesUsed)) return price.amountCents;
  return price.amountCents - couponDiscount(coupon, price.amountCents);
}

export const decryptCard = (enc: string | null, key: string) =>
  enc ? decryptSecret(enc, key) : undefined;
export const encryptCard = (token: string, key: string) => encryptSecret(token, key);

/** Chave da subconta do personal (cobranças ao aluno). */
export async function tenantApiKey(db: Tx, tenantId: string, key: string): Promise<string | null> {
  const acc = await db.paymentAccount.findUnique({ where: { tenantId } });
  return acc?.apiKeyEncrypted ? decryptSecret(acc.apiKeyEncrypted, key) : null;
}

/** Split: a taxa da plataforma (bps do plano do personal) vai para a carteira da Vetta. */
export function platformSplit(
  walletId: string | undefined,
  feeBps: number,
): SplitRule[] | undefined {
  if (!walletId || feeBps <= 0) return undefined;
  return [{ walletId, percent: Number((feeBps / 100).toFixed(2)) }];
}

/** Convite do aluno criado pela compra (mesmo token do fluxo de convite da API). */
export async function createStudentInviteToken(
  db: Tx,
  input: { tenantId: string; userId: string; studentLinkId: string },
): Promise<string> {
  const token = randomToken(32);
  await db.authToken.create({
    data: {
      type: 'STUDENT_INVITE',
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      userId: input.userId,
      tenantId: input.tenantId,
      metadata: { studentLinkId: input.studentLinkId, delivery: 'EMAIL', invitedBy: 'checkout' },
    },
  });
  return token;
}

/**
 * Fatura da plataforma paga: ativa ou renova o plano, cria a recorrência no gateway
 * (na primeira cobrança), conta o ciclo do cupom e agenda a NFS-e.
 */
export async function applyPlatformInvoicePaid(
  deps: BillingDeps,
  invoiceId: string,
  paid: {
    paidAt: Date;
    method: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
    /** Cobrança gerada pela recorrência do gateway (renovação). */
    recurring: boolean;
  },
): Promise<void> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const inv = await db.platformInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { subscription: { include: { plan: true } }, plan: true },
  });
  if (inv.status === 'PAID' || inv.status === 'REFUNDED') return;
  const sub = inv.subscription;
  const isFirstCharge = !paid.recurring;
  const planId = inv.planId ?? sub.planId;
  const cycle = inv.cycle ?? sub.cycle;
  const periodStart = isFirstCharge ? now : inv.periodStart;
  const periodEnd = isFirstCharge ? addCycle(now, cycle) : inv.periodEnd;
  const cyclesUsed = inv.couponId ? sub.couponCyclesUsed + 1 : sub.couponCyclesUsed;
  const activation =
    isFirstCharge &&
    (sub.planId !== planId || sub.status !== 'ACTIVE' || !sub.gatewaySubscriptionId);

  await db.$transaction(async (tx) => {
    await tx.platformInvoice.update({
      where: { id: inv.id },
      data: {
        status: 'PAID',
        paidAt: paid.paidAt,
        method: paid.method ?? inv.method,
        failureReason: null,
      },
    });
    await tx.tenantSubscription.update({
      where: { id: sub.id },
      data: {
        planId,
        cycle,
        status: 'ACTIVE',
        trialEndsAt: sub.status === 'TRIALING' ? null : sub.trialEndsAt,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        graceEndsAt: null,
        couponCyclesUsed: cyclesUsed,
        ...(isFirstCharge
          ? { cancelAtPeriodEnd: false, pendingPlanId: null, pendingCycle: null }
          : {}),
        ...(isFirstCharge && inv.couponId ? { couponId: inv.couponId } : {}),
      },
    });
    await tx.fiscalInvoice.upsert({
      where: { platformInvoiceId: inv.id },
      create: {
        tenantId: inv.tenantId,
        platformInvoiceId: inv.id,
        amountCents: inv.amountCents - inv.discountCents - inv.creditCents,
      },
      update: {},
    });
  });

  // Recorrência: criada só depois do primeiro pagamento (checkout não pago não gera assinatura).
  if (isFirstCharge && deps.provider && sub.gatewayCustomerId) {
    if (sub.gatewaySubscriptionId) {
      await deps.provider.cancelSubscription(sub.gatewaySubscriptionId).catch(() => undefined);
    }
    const amount = await recurringAmount(
      db,
      planId,
      cycle,
      inv.couponId ?? sub.couponId,
      cyclesUsed,
    );
    const plan = await db.plan.findUniqueOrThrow({ where: { id: planId } });
    const method = paid.method ?? inv.method ?? 'PIX';
    const created = await deps.provider.createSubscription({
      customerId: sub.gatewayCustomerId,
      method,
      amountCents: amount,
      cycle,
      nextDueDate: toDateOnly(periodEnd),
      description: `Vetta ${plan.name}`,
      externalReference: `psub:${sub.id}`,
      cardToken:
        method === 'CREDIT_CARD'
          ? decryptCard(sub.cardTokenEncrypted, deps.encryptionKey)
          : undefined,
    });
    await db.tenantSubscription.update({
      where: { id: sub.id },
      data: { gatewaySubscriptionId: created.id },
    });
  } else if (!isFirstCharge && deps.provider && sub.gatewaySubscriptionId && sub.couponId) {
    // O cupom acabou neste ciclo: a próxima cobrança volta ao preço cheio.
    const coupon = await db.coupon.findUnique({ where: { id: sub.couponId } });
    if (coupon && !couponAppliesToCycle(coupon, cyclesUsed)) {
      const full = await recurringAmount(db, planId, cycle, null, 0);
      await deps.provider.updateSubscription(sub.gatewaySubscriptionId, { amountCents: full });
    }
  }

  await deps.invalidateTenant(inv.tenantId);
  await deps.publisher.publish('platform_invoice.paid', {
    tenantId: inv.tenantId,
    id: `pinv-paid:${inv.id}`,
    payload: {
      invoiceId: inv.id,
      amount: brl(inv.amountCents - inv.discountCents - inv.creditCents),
    },
  });
  if (activation) {
    const plan = await db.plan.findUniqueOrThrow({ where: { id: planId } });
    await deps.publisher.publish('subscription.activated', {
      tenantId: inv.tenantId,
      id: `sub-activated:${inv.id}`,
      payload: { planName: plan.name },
    });
  }
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtDate = (d: Date | string) =>
  new Date(typeof d === 'string' ? `${d}T12:00:00Z` : d).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
