import type { Prisma } from '@vetta/db';
import {
  invoiceStatusOf,
  nextInvoiceStatus,
  type Charge,
  type InvoiceStatusCode,
  type WebhookEventNormalized,
} from '../payments/provider';
import { addCycle, platformFeeCents, toDateOnly } from './billing';
import {
  applyPlatformInvoicePaid,
  brl,
  createStudentInviteToken,
  fmtDate,
  platformSplit,
  tenantApiKey,
  type BillingDeps,
} from './platform';

/**
 * Processa um webhook já gravado em webhook_events (idempotente: o mesmo evento
 * nunca é aplicado duas vezes, e eventos fora de ordem não fazem o status regredir).
 */
export async function processWebhookEvent(
  deps: BillingDeps,
  eventRowId: string,
  event: WebhookEventNormalized,
): Promise<'PROCESSED' | 'IGNORED'> {
  const { db } = deps;
  const row = await db.webhookEvent.findUniqueOrThrow({ where: { id: eventRowId } });
  if (row.status === 'PROCESSED' || row.status === 'IGNORED') return row.status;
  try {
    let result: 'PROCESSED' | 'IGNORED' = 'IGNORED';
    if (event.kind === 'charge' && event.charge) result = await onCharge(deps, event, event.charge);
    else if (event.kind === 'account') result = await onAccount(deps, event);
    else if (event.kind === 'transfer') result = await onTransfer(deps, event);
    await db.webhookEvent.update({
      where: { id: eventRowId },
      data: { status: result, processedAt: new Date(), error: null, attempts: { increment: 1 } },
    });
    return result;
  } catch (err) {
    await db.webhookEvent.update({
      where: { id: eventRowId },
      data: {
        status: 'FAILED',
        error: (err as Error).message.slice(0, 1000),
        attempts: { increment: 1 },
      },
    });
    throw err;
  }
}

function ref(charge: Charge): { kind: string; id: string } | null {
  const m = /^(pinv|psub|inv|ssub|chk):([0-9a-f-]{36})$/i.exec(charge.externalReference ?? '');
  return m ? { kind: m[1]!.toLowerCase(), id: m[2]! } : null;
}

async function onCharge(deps: BillingDeps, e: WebhookEventNormalized, charge: Charge) {
  const r = ref(charge);
  // Plataforma (personal → Vetta)
  if (r?.kind === 'pinv' || r?.kind === 'psub') return onPlatformCharge(deps, e, charge, r);
  const known = await deps.db.platformInvoice.findUnique({
    where: { gatewayInvoiceId: charge.id },
  });
  if (known) return onPlatformCharge(deps, e, charge, { kind: 'pinv', id: known.id });
  // Personal → aluno
  if (r?.kind === 'chk') return onCheckoutCharge(deps, e, charge, r.id);
  return onStudentCharge(deps, e, charge, r);
}

// ─── Plataforma ──────────────────────────────────────────────────────────────

async function onPlatformCharge(
  deps: BillingDeps,
  e: WebhookEventNormalized,
  charge: Charge,
  r: { kind: string; id: string },
) {
  const { db } = deps;
  let inv =
    (await db.platformInvoice.findUnique({ where: { gatewayInvoiceId: charge.id } })) ??
    (r.kind === 'pinv' ? await db.platformInvoice.findUnique({ where: { id: r.id } }) : null);

  if (!inv && r.kind === 'psub') {
    // Cobrança nova gerada pela recorrência: cria a fatura do período.
    const sub = await db.tenantSubscription.findUnique({ where: { id: r.id } });
    if (!sub) return 'IGNORED';
    const due = new Date(`${charge.dueDate}T12:00:00Z`);
    inv = await db.platformInvoice.create({
      data: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        planId: sub.planId,
        cycle: sub.cycle,
        couponId: sub.couponId,
        amountCents: charge.amountCents,
        status: 'PENDING',
        method: charge.method,
        dueDate: due,
        periodStart: due,
        periodEnd: addCycle(due, sub.cycle),
        gatewayInvoiceId: charge.id,
        invoiceUrl: charge.invoiceUrl,
        boletoUrl: charge.boletoUrl,
        description: charge.description,
      },
    });
  }
  if (!inv) return 'IGNORED';
  if (!inv.gatewayInvoiceId)
    inv = await db.platformInvoice.update({
      where: { id: inv.id },
      data: { gatewayInvoiceId: charge.id },
    });

  const recurring = r.kind === 'psub' || !!charge.subscriptionId;

  if (e.action === 'FAILED') {
    await db.platformInvoice.update({
      where: { id: inv.id },
      data: { failureReason: 'Cartão recusado', failedAt: e.occurredAt },
    });
    await deps.publisher.publish('subscription.payment_failed', {
      tenantId: inv.tenantId,
      id: `pinv-failed:${e.id}`,
      payload: { invoiceId: inv.id, amount: brl(charge.amountCents) },
    });
    return 'PROCESSED';
  }

  const incoming = invoiceStatusOf(charge.status);
  const next = nextInvoiceStatus(inv.status as InvoiceStatusCode, incoming, {
    dueDateMovedForward: charge.dueDate > toDateOnly(inv.dueDate),
  });
  if (next === inv.status && incoming !== 'PAID') return 'IGNORED';

  if (next === 'PAID') {
    await applyPlatformInvoicePaid(deps, inv.id, {
      paidAt: charge.paidAt ?? e.occurredAt,
      method: charge.method,
      recurring,
    });
    return 'PROCESSED';
  }
  await db.platformInvoice.update({
    where: { id: inv.id },
    data: {
      status: next,
      ...(next === 'PENDING' ? { dueDate: new Date(`${charge.dueDate}T12:00:00Z`) } : {}),
      ...(next === 'REFUNDED'
        ? { refundedAt: e.occurredAt, refundedCents: charge.amountCents }
        : {}),
    },
  });
  if (next === 'OVERDUE') {
    const graceEndsAt = new Date(
      new Date(`${charge.dueDate}T12:00:00Z`).getTime() + 7 * 86_400_000,
    );
    await db.tenantSubscription.updateMany({
      where: { id: inv.subscriptionId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
      data: { status: 'PAST_DUE', pastDueSince: e.occurredAt, graceEndsAt },
    });
    await deps.invalidateTenant(inv.tenantId);
    await deps.publisher.publish('subscription.past_due', {
      tenantId: inv.tenantId,
      id: `sub-past-due:${inv.id}`,
      payload: { invoiceId: inv.id, amount: brl(inv.amountCents), graceDate: fmtDate(graceEndsAt) },
    });
  }
  if (next === 'REFUNDED') {
    await deps.publisher.publish('platform_invoice.refunded', {
      tenantId: inv.tenantId,
      id: `pinv-refunded:${inv.id}`,
      payload: { invoiceId: inv.id, amount: brl(charge.amountCents) },
    });
  }
  return 'PROCESSED';
}

// ─── Personal → aluno ────────────────────────────────────────────────────────

type StudentInvoice = Prisma.InvoiceGetPayload<{ include: { subscription: true } }>;

async function onStudentCharge(
  deps: BillingDeps,
  e: WebhookEventNormalized,
  charge: Charge,
  r: { kind: string; id: string } | null,
) {
  const { db } = deps;
  let inv: StudentInvoice | null = await db.invoice.findUnique({
    where: { gatewayChargeId: charge.id },
    include: { subscription: true },
  });
  if (!inv && r?.kind === 'inv')
    inv = await db.invoice.findUnique({ where: { id: r.id }, include: { subscription: true } });
  if (!inv) {
    // Cobrança nova da recorrência ou do parcelamento: cria a fatura.
    const ss =
      r?.kind === 'ssub'
        ? await db.studentSubscription.findUnique({ where: { id: r.id } })
        : charge.subscriptionId
          ? await db.studentSubscription.findUnique({
              where: { gatewaySubscriptionId: charge.subscriptionId },
            })
          : null;
    if (!ss) return 'IGNORED';
    inv = await createStudentInvoiceFromCharge(db, ss, charge);
  }
  return applyStudentCharge(deps, e, inv, charge);
}

export async function createStudentInvoiceFromCharge(
  db: BillingDeps['db'],
  ss: {
    id: string;
    tenantId: string;
    studentLinkId: string;
    consultingPlanId: string;
    installments: number;
  },
  charge: Charge,
): Promise<StudentInvoice> {
  const plan = await db.consultingPlan.findUniqueOrThrow({ where: { id: ss.consultingPlanId } });
  return db.invoice.upsert({
    where: { gatewayChargeId: charge.id },
    create: {
      tenantId: ss.tenantId,
      studentLinkId: ss.studentLinkId,
      studentSubscriptionId: ss.id,
      description:
        charge.installmentNumber && ss.installments > 1
          ? `${plan.name} (${charge.installmentNumber}/${ss.installments})`
          : plan.name,
      amountCents: charge.amountCents,
      status: 'PENDING',
      method: charge.method,
      dueDate: new Date(`${charge.dueDate}T12:00:00Z`),
      provider: 'ASAAS',
      gatewayChargeId: charge.id,
      gatewayInstallmentId: charge.installmentId,
      installmentNumber: charge.installmentNumber,
      installmentCount: ss.installments > 1 ? ss.installments : null,
      invoiceUrl: charge.invoiceUrl,
      boletoUrl: charge.boletoUrl,
    },
    update: {},
    include: { subscription: true },
  });
}

async function applyStudentCharge(
  deps: BillingDeps,
  e: WebhookEventNormalized,
  inv: StudentInvoice,
  charge: Charge,
) {
  const { db } = deps;
  const link = await db.studentLink.findUniqueOrThrow({ where: { id: inv.studentLinkId } });
  if (e.action === 'FAILED') {
    await db.invoice.update({ where: { id: inv.id }, data: { failureReason: 'Cartão recusado' } });
    await deps.publisher.publish('invoice.payment_failed', {
      tenantId: inv.tenantId,
      id: `inv-failed:${e.id}`,
      payload: {
        studentLinkId: inv.studentLinkId,
        invoiceId: inv.id,
        amount: brl(inv.amountCents),
      },
    });
    return 'PROCESSED';
  }
  const incoming = invoiceStatusOf(charge.status);
  const next = nextInvoiceStatus(inv.status as InvoiceStatusCode, incoming, {
    dueDateMovedForward: charge.dueDate > toDateOnly(inv.dueDate),
  });
  if (next === inv.status) return 'IGNORED';

  if (next === 'PAID') {
    const bps = inv.subscription?.platformFeeBps ?? 0;
    const platformFee = platformFeeCents(charge.netCents, bps);
    const net = charge.netCents - platformFee;
    const creditAt = charge.creditDate ? new Date(`${charge.creditDate}T12:00:00Z`) : null;
    const paidAt = charge.paidAt ?? e.occurredAt;
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: 'PAID',
          paidAt,
          method: charge.method ?? inv.method,
          gatewayFeeCents: charge.amountCents - charge.netCents,
          platformFeeCents: platformFee,
          netCents: net,
          creditAt,
          failureReason: null,
        },
      });
      await tx.walletEntry.upsert({
        where: { dedupeKey: `credit:${inv.id}` },
        create: {
          tenantId: inv.tenantId,
          type: 'CREDIT',
          amountCents: net,
          invoiceId: inv.id,
          description: `${inv.description} – ${link.displayName}`,
          availableAt: creditAt,
          occurredAt: paidAt,
          dedupeKey: `credit:${inv.id}`,
        },
        update: {},
      });
      if (inv.subscription) {
        const ss = inv.subscription;
        await tx.studentSubscription.update({
          where: { id: ss.id },
          data: {
            status: ss.status === 'CANCELED' || ss.status === 'ENDED' ? ss.status : 'ACTIVE',
            ...(ss.paymentMode === 'RECURRING'
              ? {
                  endsAt: addCycle(
                    new Date(`${charge.dueDate}T12:00:00Z`),
                    await planCycle(tx, ss.consultingPlanId),
                  ),
                }
              : {}),
          },
        });
      }
    });
    await unblockIfSettled(deps, inv.tenantId, inv.studentLinkId);
    await deps.publisher.publish('invoice.paid', {
      tenantId: inv.tenantId,
      id: `inv-paid:${inv.id}`,
      payload: {
        studentLinkId: inv.studentLinkId,
        invoiceId: inv.id,
        amount: brl(inv.amountCents),
        studentName: link.displayName,
      },
    });
    return 'PROCESSED';
  }

  await db.invoice.update({
    where: { id: inv.id },
    data: {
      status: next,
      ...(next === 'PENDING' ? { dueDate: new Date(`${charge.dueDate}T12:00:00Z`) } : {}),
      ...(next === 'REFUNDED' ? { refundedAt: e.occurredAt } : {}),
    },
  });
  if (next === 'REFUNDED' && inv.status === 'PAID') {
    await db.walletEntry.upsert({
      where: { dedupeKey: `refund:${inv.id}` },
      create: {
        tenantId: inv.tenantId,
        type: 'REFUND',
        amountCents: -inv.netCents,
        invoiceId: inv.id,
        description: `Estorno – ${inv.description}`,
        occurredAt: e.occurredAt,
        dedupeKey: `refund:${inv.id}`,
      },
      update: {},
    });
  }
  if (next === 'OVERDUE') {
    if (inv.studentSubscriptionId)
      await db.studentSubscription.updateMany({
        where: { id: inv.studentSubscriptionId, status: 'ACTIVE' },
        data: { status: 'OVERDUE' },
      });
    await deps.publisher.publish('invoice.overdue', {
      tenantId: inv.tenantId,
      id: `inv-overdue:${inv.id}`,
      payload: {
        studentLinkId: inv.studentLinkId,
        invoiceId: inv.id,
        amount: brl(inv.amountCents),
        dueDate: fmtDate(charge.dueDate),
        link: inv.invoiceUrl ?? '',
      },
    });
  }
  return 'PROCESSED';
}

async function planCycle(tx: Prisma.TransactionClient, consultingPlanId: string) {
  return (await tx.consultingPlan.findUniqueOrThrow({ where: { id: consultingPlanId } })).cycle;
}

/** Sem faturas vencidas: desbloqueia o aluno e reativa as assinaturas. */
export async function unblockIfSettled(deps: BillingDeps, tenantId: string, studentLinkId: string) {
  const { db } = deps;
  const overdue = await db.invoice.count({
    where: { tenantId, studentLinkId, status: 'OVERDUE', deletedAt: null },
  });
  if (overdue) return false;
  await db.studentSubscription.updateMany({
    where: { tenantId, studentLinkId, status: 'OVERDUE' },
    data: { status: 'ACTIVE', blockedAt: null },
  });
  const link = await db.studentLink.findUniqueOrThrow({ where: { id: studentLinkId } });
  if (link.status !== 'OVERDUE') return false;
  await db.studentLink.update({ where: { id: studentLinkId }, data: { status: 'ACTIVE' } });
  await deps.publisher.publish('student.unblocked', {
    tenantId,
    id: `unblocked:${studentLinkId}:${Date.now()}`,
    payload: { studentLinkId, studentName: link.displayName },
  });
  return true;
}

// ─── Checkout da página de vendas ────────────────────────────────────────────

async function onCheckoutCharge(
  deps: BillingDeps,
  e: WebhookEventNormalized,
  charge: Charge,
  checkoutId: string,
) {
  const { db } = deps;
  const chk = await db.checkout.findUnique({ where: { id: checkoutId } });
  if (!chk) return 'IGNORED';
  // Parcelas seguintes do mesmo checkout: já há assinatura, segue como cobrança do aluno.
  if (chk.status === 'PAID' && chk.studentSubscriptionId) {
    return onStudentCharge(deps, e, charge, { kind: 'ssub', id: chk.studentSubscriptionId });
  }
  const status = invoiceStatusOf(charge.status);
  if (e.action === 'FAILED' || status === 'CANCELED') {
    await db.checkout.update({
      where: { id: chk.id },
      data: {
        status: 'FAILED',
        failureReason: e.action === 'FAILED' ? 'Cartão recusado' : 'Cobrança cancelada',
      },
    });
    return 'PROCESSED';
  }
  if (status !== 'PAID') return 'IGNORED';
  await completeCheckout(deps, chk.id, charge);
  return 'PROCESSED';
}

/**
 * Pagamento confirmado da página de vendas: cria (ou reaproveita) o usuário, o vínculo
 * de aluno, a assinatura e a fatura paga; recorrente cria a assinatura no gateway;
 * envia o convite e avisa o personal.
 */
export async function completeCheckout(deps: BillingDeps, checkoutId: string, charge: Charge) {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const chk = await db.checkout.findUniqueOrThrow({
    where: { id: checkoutId },
    include: { consultingPlan: true, tenant: { select: { name: true } } },
  });
  if (chk.status === 'PAID') return;
  const plan = chk.consultingPlan;
  const bps = await feeBps(db, chk.tenantId);

  const result = await db.$transaction(async (tx) => {
    const user =
      (await tx.user.findUnique({ where: { email: chk.buyerEmail } })) ??
      (await tx.user.create({
        data: {
          email: chk.buyerEmail,
          name: chk.buyerName,
          phone: chk.buyerPhone,
          status: 'PENDING',
        },
      }));
    let link = await tx.studentLink.findUnique({
      where: { tenantId_userId: { tenantId: chk.tenantId, userId: user.id } },
    });
    if (!link) {
      link = await tx.studentLink.create({
        data: {
          tenantId: chk.tenantId,
          userId: user.id,
          displayName: chk.buyerName,
          email: chk.buyerEmail,
          phone: chk.buyerPhone,
          whatsapp: chk.buyerPhone,
          status: user.status === 'ACTIVE' ? 'ACTIVE' : 'INVITED',
          invitedAt: now,
          ...(user.status === 'ACTIVE' ? { joinedAt: now } : {}),
          tags: ['página de vendas'],
        },
      });
    } else if (link.status === 'ARCHIVED') {
      link = await tx.studentLink.update({
        where: { id: link.id },
        data: {
          status: user.status === 'ACTIVE' ? 'ACTIVE' : 'INVITED',
          archivedAt: null,
          archivedReason: null,
        },
      });
    }
    const ss = await tx.studentSubscription.create({
      data: {
        tenantId: chk.tenantId,
        studentLinkId: link.id,
        consultingPlanId: plan.id,
        status: 'ACTIVE',
        method: chk.method,
        paymentMode: plan.paymentMode,
        installments: chk.installments,
        priceCents: plan.priceCents,
        platformFeeBps: bps,
        startedAt: now,
        endsAt: addCycle(now, plan.cycle),
        nextDueDate: plan.paymentMode === 'RECURRING' ? addCycle(now, plan.cycle) : null,
        source: 'SALES_PAGE',
        gatewayCustomerId: chk.gatewayCustomerId,
      },
    });
    await tx.checkout.update({
      where: { id: chk.id },
      data: {
        status: 'PAID',
        paidAt: charge.paidAt ?? now,
        studentLinkId: link.id,
        studentSubscriptionId: ss.id,
      },
    });
    const token =
      user.status === 'ACTIVE'
        ? null
        : await createStudentInviteToken(tx, {
            tenantId: chk.tenantId,
            userId: user.id,
            studentLinkId: link.id,
          });
    return { user, link, ss, token };
  });

  // Fatura paga + crédito na carteira (mesmo caminho dos webhooks do aluno).
  const inv = await createStudentInvoiceFromCharge(db, result.ss, charge);
  await applyStudentCharge(
    deps,
    {
      id: `chk:${chk.id}`,
      type: 'PAYMENT_RECEIVED',
      kind: 'charge',
      action: 'RECEIVED',
      occurredAt: now,
      resourceId: charge.id,
      raw: null,
    },
    inv,
    { ...charge, status: charge.status === 'CONFIRMED' ? 'CONFIRMED' : 'RECEIVED' },
  );

  if (plan.paymentMode === 'RECURRING' && deps.provider && chk.gatewayCustomerId) {
    const apiKey = await tenantApiKey(db, chk.tenantId, deps.encryptionKey);
    const sub = await deps.provider.createSubscription(
      {
        customerId: chk.gatewayCustomerId,
        method: chk.method,
        amountCents: plan.priceCents,
        cycle: plan.cycle,
        nextDueDate: toDateOnly(addCycle(now, plan.cycle)),
        description: plan.name,
        externalReference: `ssub:${result.ss.id}`,
        split: platformSplit(deps.platformWalletId, bps),
      },
      apiKey ? { apiKey } : {},
    );
    await db.studentSubscription.update({
      where: { id: result.ss.id },
      data: { gatewaySubscriptionId: sub.id },
    });
  }

  if (result.token) {
    await deps.publisher.publish('student.invited', {
      tenantId: chk.tenantId,
      id: `chk-invite:${chk.id}`,
      payload: {
        userId: result.user.id,
        token: result.token,
        tenantName: chk.tenant.name,
        studentLinkId: result.link.id,
      },
    });
  }
  await deps.publisher.publish('checkout.paid', {
    tenantId: chk.tenantId,
    id: `chk-paid:${chk.id}`,
    payload: {
      studentLinkId: result.link.id,
      studentName: chk.buyerName,
      planName: plan.name,
      amount: brl(chk.amountCents),
    },
  });
}

async function feeBps(db: BillingDeps['db'], tenantId: string): Promise<number> {
  const sub = await db.tenantSubscription.findUnique({
    where: { tenantId },
    include: {
      plan: { include: { features: { where: { featureKey: 'finance.split_fee_bps' } } } },
    },
  });
  const override = await db.tenantFeatureOverride.findFirst({
    where: {
      tenantId,
      featureKey: 'finance.split_fee_bps',
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return override?.value ?? sub?.plan.features[0]?.value ?? 0;
}
export { feeBps as platformFeeBpsOf };

// ─── Conta e transferências ──────────────────────────────────────────────────

async function onAccount(deps: BillingDeps, e: WebhookEventNormalized) {
  const { db } = deps;
  if (!e.accountId || !e.account) return 'IGNORED';
  const acc = await db.paymentAccount.findFirst({ where: { externalAccountId: e.accountId } });
  if (!acc) return 'IGNORED';
  if (acc.status === e.account.status) return 'IGNORED';
  // Aprovada/recusada é final para eventos atrasados de "em análise".
  if (
    (acc.status === 'APPROVED' || acc.status === 'REJECTED') &&
    e.account.status === 'UNDER_REVIEW'
  )
    return 'IGNORED';
  await db.paymentAccount.update({
    where: { id: acc.id },
    data: { status: e.account.status, statusReason: e.account.reason, reviewedAt: e.occurredAt },
  });
  await deps.publisher.publish('payment_account.status_changed', {
    tenantId: acc.tenantId,
    id: `account:${e.id}`,
    payload: { status: e.account.status, statusLabel: ACCOUNT_LABEL[e.account.status] },
  });
  return 'PROCESSED';
}

const ACCOUNT_LABEL = {
  PENDING: 'pendente',
  UNDER_REVIEW: 'em análise',
  APPROVED: 'aprovada',
  REJECTED: 'recusada',
} as const;

async function onTransfer(deps: BillingDeps, e: WebhookEventNormalized) {
  const { db } = deps;
  if (!e.transfer) return 'IGNORED';
  const w = await db.withdrawal.findUnique({ where: { gatewayTransferId: e.transfer.id } });
  if (!w || w.status === 'DONE' || w.status === 'FAILED') return 'IGNORED';
  if (e.transfer.status === 'DONE') {
    await db.withdrawal.update({
      where: { id: w.id },
      data: { status: 'DONE', completedAt: e.occurredAt, feeCents: e.transfer.feeCents },
    });
    await deps.publisher.publish('withdrawal.done', {
      tenantId: w.tenantId,
      id: `wd-done:${w.id}`,
      payload: { amount: brl(w.amountCents) },
    });
    return 'PROCESSED';
  }
  if (e.transfer.status === 'FAILED' || e.transfer.status === 'CANCELED') {
    await db.$transaction([
      db.withdrawal.update({
        where: { id: w.id },
        data: { status: 'FAILED', failureReason: e.transfer.failureReason },
      }),
      // Devolve o valor à carteira.
      db.walletEntry.upsert({
        where: { dedupeKey: `withdrawal-reversal:${w.id}` },
        create: {
          tenantId: w.tenantId,
          type: 'CREDIT',
          amountCents: w.amountCents,
          withdrawalId: w.id,
          description: 'Saque não concluído (estorno)',
          occurredAt: e.occurredAt,
          availableAt: e.occurredAt,
          dedupeKey: `withdrawal-reversal:${w.id}`,
        },
        update: {},
      }),
    ]);
    await deps.publisher.publish('withdrawal.failed', {
      tenantId: w.tenantId,
      id: `wd-failed:${w.id}`,
      payload: { amount: brl(w.amountCents), reason: e.transfer.failureReason ?? '' },
    });
    return 'PROCESSED';
  }
  return 'IGNORED';
}

/** Aplica o resultado de uma cobrança do aluno (ex.: pagamento com cartão na hora). */
export async function applyStudentInvoiceCharge(
  deps: BillingDeps,
  invoiceId: string,
  charge: Charge,
) {
  const inv = await deps.db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { subscription: true },
  });
  const action =
    charge.status === 'RECEIVED' || charge.status === 'CONFIRMED' ? 'RECEIVED' : 'UPDATED';
  return applyStudentCharge(
    deps,
    {
      id: `direct:${charge.id}:${charge.status}`,
      type: 'DIRECT',
      kind: 'charge',
      action,
      occurredAt: new Date(),
      charge,
      resourceId: charge.id,
      raw: null,
    },
    inv,
    charge,
  );
}
