import type { StorageProvider } from '../storage/storage';
import {
  addCycle,
  daysBetween,
  PLAN_END_NOTICE_DAYS,
  PLATFORM_REMINDER_OFFSETS,
  reminderOffset,
  shouldBlockStudent,
  STUDENT_REMINDER_OFFSETS,
  toDateOnly,
} from '../billing/billing';
import { brl, downgradeToFree, fmtDate, tenantApiKey, type BillingDeps } from '../billing/platform';
import { processWebhookEvent } from '../billing/webhooks';
import type { InvoiceIssuer } from '../payments/invoice-issuer';
import { invoiceStatusOf, type Charge } from '../payments/provider';
import { localDate } from './engagement';

const TZ = 'America/Sao_Paulo';
const DAY = 86_400_000;
const offsetText = (o: number) =>
  o < 0
    ? `vence em ${-o} ${o === -1 ? 'dia' : 'dias'}`
    : o === 0
      ? 'vence hoje'
      : `venceu há ${o} ${o === 1 ? 'dia' : 'dias'}`;

/** Avisos da fatura da plataforma: D-7, D-1 e no dia (uma vez cada). */
export async function platformInvoiceReminders(deps: BillingDeps, now = new Date()) {
  const today = localDate(now, TZ);
  const from = new Date(now.getTime() - 2 * DAY);
  const to = new Date(now.getTime() + 8 * DAY);
  const invoices = await deps.db.platformInvoice.findMany({
    where: { status: 'PENDING', deletedAt: null, dueDate: { gte: from, lte: to } },
    take: 1000,
  });
  let sent = 0;
  for (const inv of invoices) {
    const offset = reminderOffset(toDateOnly(inv.dueDate), today, PLATFORM_REMINDER_OFFSETS);
    if (offset === null || inv.remindersSent.includes(offset)) continue;
    await deps.db.platformInvoice.update({
      where: { id: inv.id },
      data: { remindersSent: { push: offset } },
    });
    await deps.publisher.publish('subscription.payment_reminder', {
      tenantId: inv.tenantId,
      id: `pinv-reminder:${inv.id}:${offset}`,
      payload: {
        invoiceId: inv.id,
        amount: brl(inv.amountCents - inv.discountCents - inv.creditCents),
        dueDate: fmtDate(inv.dueDate),
        when: offsetText(offset),
        link: inv.invoiceUrl ?? '',
      },
    });
    sent++;
  }
  return sent;
}

/** Fim da carência (7 dias após o vencimento): downgrade para o FREE sem apagar dados. */
export async function platformGraceExpired(deps: BillingDeps, now = new Date()) {
  const due = await deps.db.tenantSubscription.findMany({
    where: { status: 'PAST_DUE', graceEndsAt: { lte: now } },
    take: 200,
  });
  for (const sub of due) {
    const r = await deps.db.$transaction((tx) =>
      downgradeToFree(tx, sub.tenantId, 'downgrade_inadimplencia', now),
    );
    if (sub.gatewaySubscriptionId && deps.provider)
      await deps.provider.cancelSubscription(sub.gatewaySubscriptionId).catch(() => undefined);
    await deps.invalidateTenant(sub.tenantId);
    await deps.publisher.publish('subscription.downgraded', {
      tenantId: sub.tenantId,
      id: `downgraded:${sub.id}:${toDateOnly(now)}`,
      payload: { reason: 'Pagamento não identificado após 7 dias de carência.' },
    });
    if (r.archived)
      await deps.publisher.publish('students.archived', {
        tenantId: sub.tenantId,
        id: `students-archived:${sub.id}:${toDateOnly(now)}`,
        payload: { count: r.archived, max: r.max },
      });
  }
  return due.length;
}

/** Fim do período: cancelamento agendado vira FREE; downgrade agendado troca o plano. */
export async function platformPeriodEnd(deps: BillingDeps, now = new Date()) {
  const subs = await deps.db.tenantSubscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { lte: now },
      OR: [{ cancelAtPeriodEnd: true }, { pendingPlanId: { not: null } }],
    },
    take: 200,
  });
  for (const sub of subs) {
    if (sub.cancelAtPeriodEnd) {
      const r = await deps.db.$transaction((tx) =>
        downgradeToFree(tx, sub.tenantId, 'downgrade_cancelamento', now),
      );
      await deps.publisher.publish('subscription.downgraded', {
        tenantId: sub.tenantId,
        id: `downgraded:${sub.id}:${toDateOnly(now)}`,
        payload: { reason: 'Assinatura cancelada ao fim do período.' },
      });
      if (r.archived)
        await deps.publisher.publish('students.archived', {
          tenantId: sub.tenantId,
          id: `students-archived:${sub.id}:${toDateOnly(now)}`,
          payload: { count: r.archived, max: r.max },
        });
    } else {
      // O valor da recorrência no gateway já foi ajustado quando o downgrade foi agendado.
      const plan = await deps.db.plan.findUniqueOrThrow({ where: { id: sub.pendingPlanId! } });
      const cycle = sub.pendingCycle ?? sub.cycle;
      await deps.db.tenantSubscription.update({
        where: { id: sub.id },
        data: {
          planId: plan.id,
          cycle,
          pendingPlanId: null,
          pendingCycle: null,
          currentPeriodStart: sub.currentPeriodEnd,
          currentPeriodEnd: addCycle(sub.currentPeriodEnd!, cycle),
        },
      });
      await deps.publisher.publish('subscription.plan_changed', {
        tenantId: sub.tenantId,
        id: `plan-changed:${sub.id}:${toDateOnly(now)}`,
        payload: { planName: plan.name },
      });
    }
    await deps.invalidateTenant(sub.tenantId);
  }
  return subs.length;
}

/** Lembretes da fatura do aluno: 3 dias antes, no dia, 1 e 5 dias depois. */
export async function studentInvoiceReminders(deps: BillingDeps, now = new Date()) {
  const today = localDate(now, TZ);
  const invoices = await deps.db.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
      deletedAt: null,
      dueDate: { gte: new Date(now.getTime() - 7 * DAY), lte: new Date(now.getTime() + 4 * DAY) },
    },
    take: 2000,
  });
  let sent = 0;
  for (const inv of invoices) {
    const offset = reminderOffset(toDateOnly(inv.dueDate), today, STUDENT_REMINDER_OFFSETS);
    if (offset === null || inv.remindersSent.includes(offset)) continue;
    await deps.db.invoice.update({
      where: { id: inv.id },
      data: { remindersSent: { push: offset }, lastReminderAt: now },
    });
    await deps.publisher.publish('invoice.reminder', {
      tenantId: inv.tenantId,
      id: `inv-reminder:${inv.id}:${offset}`,
      payload: {
        studentLinkId: inv.studentLinkId,
        invoiceId: inv.id,
        amount: brl(inv.amountCents),
        dueDate: fmtDate(inv.dueDate),
        when: offsetText(offset),
        link: inv.invoiceUrl ?? '',
      },
    });
    sent++;
  }
  return sent;
}

/**
 * Bloqueio opcional do aluno inadimplente: só nos tenants que ligaram a opção,
 * depois da tolerância (do plano vendido ou do tenant).
 */
export async function blockOverdueStudents(deps: BillingDeps, now = new Date()) {
  const today = localDate(now, TZ);
  const invoices = await deps.db.invoice.findMany({
    where: {
      status: 'OVERDUE',
      deletedAt: null,
      tenant: { blockOverdueStudents: true },
      studentLink: { status: 'ACTIVE' },
      OR: [{ subscription: null }, { subscription: { blockOnOverdue: true } }],
    },
    include: {
      tenant: { select: { blockOverdueAfterDays: true } },
      subscription: { include: { consultingPlan: { select: { toleranceDays: true } } } },
      studentLink: { select: { displayName: true } },
    },
    take: 1000,
  });
  const blocked = new Set<string>();
  for (const inv of invoices) {
    if (blocked.has(inv.studentLinkId)) continue;
    const tolerance =
      inv.subscription?.consultingPlan.toleranceDays ?? inv.tenant.blockOverdueAfterDays;
    if (!shouldBlockStudent(toDateOnly(inv.dueDate), today, tolerance)) continue;
    blocked.add(inv.studentLinkId);
    await deps.db.studentLink.update({
      where: { id: inv.studentLinkId },
      data: { status: 'OVERDUE' },
    });
    if (inv.studentSubscriptionId)
      await deps.db.studentSubscription.update({
        where: { id: inv.studentSubscriptionId },
        data: { blockedAt: now, status: 'OVERDUE' },
      });
    await deps.publisher.publish('student.blocked', {
      tenantId: inv.tenantId,
      id: `blocked:${inv.studentLinkId}:${today}`,
      payload: {
        studentLinkId: inv.studentLinkId,
        studentName: inv.studentLink.displayName,
        invoiceId: inv.id,
        amount: brl(inv.amountCents),
      },
    });
  }
  return blocked.size;
}

/** Aviso 7 dias antes de um plano vendido terminar (personal e aluno) e encerramento. */
export async function studentPlanEndings(deps: BillingDeps, now = new Date()) {
  const soon = new Date(now.getTime() + PLAN_END_NOTICE_DAYS * DAY);
  const ending = await deps.db.studentSubscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'OVERDUE'] },
      endNoticeSentAt: null,
      endsAt: { gt: now, lte: soon },
      OR: [{ paymentMode: { not: 'RECURRING' } }, { canceledAt: { not: null } }],
    },
    include: { consultingPlan: true, studentLink: { select: { displayName: true } } },
    take: 1000,
  });
  for (const ss of ending) {
    await deps.db.studentSubscription.update({
      where: { id: ss.id },
      data: { endNoticeSentAt: now },
    });
    await deps.publisher.publish('student_plan.ending', {
      tenantId: ss.tenantId,
      id: `plan-ending:${ss.id}`,
      payload: {
        studentLinkId: ss.studentLinkId,
        studentName: ss.studentLink.displayName,
        planName: ss.consultingPlan.name,
        endDate: fmtDate(ss.endsAt!),
        days: Math.max(1, daysBetween(localDate(now, TZ), localDate(ss.endsAt!, TZ))),
      },
    });
  }
  const ended = await deps.db.studentSubscription.updateMany({
    where: {
      status: { in: ['ACTIVE', 'OVERDUE'] },
      endsAt: { lte: now },
      OR: [{ paymentMode: { not: 'RECURRING' } }, { canceledAt: { not: null } }],
    },
    data: { status: 'ENDED' },
  });
  return { notified: ending.length, ended: ended.count };
}

/** NFS-e das faturas pagas da plataforma (com retry e consulta do processamento). */
export async function issueFiscalInvoices(deps: BillingDeps & { issuer: InvoiceIssuer }) {
  const items = await deps.db.fiscalInvoice.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING', 'PENDING_CONFIG'] }, attempts: { lt: 10 } },
    include: { tenant: true },
    take: 100,
  });
  let issued = 0;
  for (const f of items) {
    if (!deps.issuer.configured) {
      if (f.status !== 'PENDING_CONFIG')
        await deps.db.fiscalInvoice.update({
          where: { id: f.id },
          data: { status: 'PENDING_CONFIG' },
        });
      continue;
    }
    try {
      const r =
        f.status === 'PROCESSING' && f.externalId
          ? await deps.issuer.get(f.externalId)
          : await deps.issuer.issue({
              externalId: f.platformInvoiceId,
              amountCents: f.amountCents,
              description: 'Assinatura do software Vetta (licenciamento de uso de programa).',
              borrower: {
                name: f.tenant.legalName ?? f.tenant.name,
                federalTaxNumber: f.tenant.documentNumber ?? '',
                email: f.tenant.billingEmail ?? '',
                address: f.tenant.addressZip
                  ? {
                      postalCode: f.tenant.addressZip,
                      street: f.tenant.addressStreet,
                      number: f.tenant.addressNumber,
                      district: f.tenant.addressDistrict,
                      city: f.tenant.addressCity,
                      state: f.tenant.addressState,
                    }
                  : null,
              },
            });
      await deps.db.fiscalInvoice.update({
        where: { id: f.id },
        data: {
          externalId: r.externalId,
          status: r.status,
          number: r.number,
          pdfUrl: r.pdfUrl,
          xmlUrl: r.xmlUrl,
          error: r.error,
          attempts: { increment: 1 },
          ...(r.status === 'ISSUED' ? { issuedAt: new Date() } : {}),
        },
      });
      if (r.status === 'ISSUED') {
        issued++;
        await deps.publisher.publish('fiscal_invoice.issued', {
          tenantId: f.tenantId,
          id: `nfse:${f.id}`,
          payload: { number: r.number ?? '', link: r.pdfUrl ?? '' },
        });
      }
    } catch (err) {
      await deps.db.fiscalInvoice.update({
        where: { id: f.id },
        data: {
          status: 'FAILED',
          error: (err as Error).message.slice(0, 500),
          attempts: { increment: 1 },
        },
      });
    }
  }
  return issued;
}

/** Envia ao gateway os documentos de KYC enviados pelo personal (bytes saem do storage). */
export async function sendKycDocuments(deps: BillingDeps & { storage: StorageProvider }) {
  if (!deps.provider) return 0;
  const docs = await deps.db.kycDocument.findMany({
    where: { status: 'PENDING', deletedAt: null },
    include: { paymentAccount: true },
    take: 50,
  });
  let sent = 0;
  for (const d of docs) {
    const apiKey = await tenantApiKey(deps.db, d.tenantId, deps.encryptionKey);
    if (!apiKey) continue;
    try {
      const media = await deps.db.media.findUniqueOrThrow({ where: { id: d.mediaId } });
      if (media.status !== 'READY') continue;
      const reqs = await deps.provider.kycRequirements({ apiKey });
      const req = reqs.find((r) => r.type === d.type) ?? reqs.find((r) => r.status !== 'APPROVED');
      if (!req) {
        await deps.db.kycDocument.update({ where: { id: d.id }, data: { status: 'APPROVED' } });
        continue;
      }
      const chunks: Buffer[] = [];
      for await (const c of await deps.storage.getStream(media.storageKey))
        chunks.push(Buffer.from(c as Uint8Array));
      const bytes = Buffer.concat(chunks);
      const r = await deps.provider.uploadKycDocument(
        req.id,
        {
          type: d.type,
          name: media.fileName,
          mimeType: media.detectedMimeType ?? media.mimeType,
          bytes,
        },
        { apiKey },
      );
      await deps.db.kycDocument.update({
        where: { id: d.id },
        data: { status: 'SENT', gatewayDocumentId: r.id, sentAt: new Date(), error: null },
      });
      if (req.onboardingUrl)
        await deps.db.paymentAccount.update({
          where: { id: d.paymentAccountId },
          data: { onboardingUrl: req.onboardingUrl },
        });
      sent++;
    } catch (err) {
      await deps.db.kycDocument.update({
        where: { id: d.id },
        data: { error: (err as Error).message.slice(0, 500) },
      });
    }
  }
  return sent;
}

/** Reprocessa webhooks que falharam (até 8 tentativas). */
export async function retryFailedWebhooks(deps: BillingDeps) {
  if (!deps.provider) return 0;
  const rows = await deps.db.webhookEvent.findMany({
    where: {
      status: { in: ['FAILED', 'RECEIVED'] },
      attempts: { lt: 8 },
      receivedAt: { lt: new Date(Date.now() - 30_000) },
    },
    orderBy: { receivedAt: 'asc' },
    take: 100,
  });
  let ok = 0;
  for (const row of rows) {
    try {
      await processWebhookEvent(deps, row.id, deps.provider.normalizeWebhook(row.payload));
      ok++;
    } catch {
      // registrado em webhook_events.error
    }
  }
  return ok;
}

/**
 * Conciliação diária: cobranças criadas ontem no gateway (conta da Vetta e subcontas)
 * x nossas faturas. Divergência que o gateway confirma é corrigida pelo mesmo caminho
 * dos webhooks; o resto fica registrado para o admin.
 */
export async function reconcileDay(
  deps: BillingDeps,
  day?: string,
): Promise<{ id: string; status: string; checked: number; fixed: number } | null> {
  if (!deps.provider) return null;
  const date = day ?? toDateOnly(new Date(Date.now() - DAY));
  const existing = await deps.db.reconciliationRun.findUnique({
    where: { date: new Date(`${date}T00:00:00Z`) },
  });
  if (existing?.status === 'DONE') return existing;
  const run =
    existing ??
    (await deps.db.reconciliationRun.create({ data: { date: new Date(`${date}T00:00:00Z`) } }));
  const mismatches: {
    kind: string;
    gatewayId: string;
    ours: string | null;
    theirs: string;
    action: string;
    tenantId?: string;
  }[] = [];
  let checked = 0;
  let fixed = 0;
  const accounts: { tenantId: string | null; apiKey?: string }[] = [{ tenantId: null }];
  for (const a of await deps.db.paymentAccount.findMany({
    where: { apiKeyEncrypted: { not: null }, deletedAt: null },
  })) {
    const key = await tenantApiKey(deps.db, a.tenantId, deps.encryptionKey);
    if (key) accounts.push({ tenantId: a.tenantId, apiKey: key });
  }
  try {
    for (const acc of accounts) {
      let offset = 0;
      for (;;) {
        const page = await deps.provider.listCharges(
          { createdFrom: date, createdTo: date, offset },
          acc.apiKey ? { apiKey: acc.apiKey } : {},
        );
        for (const charge of page.items) {
          checked++;
          const r = await reconcileCharge(deps, charge, acc.tenantId);
          if (r) {
            mismatches.push(r);
            if (r.action === 'fixed') fixed++;
          }
        }
        if (!page.hasMore) break;
        offset += page.items.length;
      }
    }
    return deps.db.reconciliationRun.update({
      where: { id: run.id },
      data: { status: 'DONE', checked, fixed, mismatches, finishedAt: new Date() },
    });
  } catch (err) {
    return deps.db.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        checked,
        fixed,
        mismatches,
        error: (err as Error).message,
        finishedAt: new Date(),
      },
    });
  }
}

async function reconcileCharge(deps: BillingDeps, charge: Charge, tenantId: string | null) {
  const theirs = invoiceStatusOf(charge.status);
  const ours =
    (await deps.db.platformInvoice.findUnique({ where: { gatewayInvoiceId: charge.id } }))
      ?.status ??
    (await deps.db.invoice.findUnique({ where: { gatewayChargeId: charge.id } }))?.status ??
    null;
  if (ours === theirs) return null;
  const known = ours !== null || !!charge.externalReference;
  if (!known)
    return {
      kind: 'missing_local',
      gatewayId: charge.id,
      ours,
      theirs,
      action: 'review',
      ...(tenantId ? { tenantId } : {}),
    };
  // Reaplica pelo caminho dos webhooks (idempotente; nunca regride status).
  const eventId = `reconcile:${charge.id}:${theirs}`;
  const row = await deps.db.webhookEvent.upsert({
    where: { provider_eventId: { provider: 'ASAAS', eventId } },
    create: {
      provider: 'ASAAS',
      eventId,
      type: 'RECONCILIATION',
      resourceId: charge.id,
      payload: { charge } as never,
    },
    update: {},
  });
  const result = await processWebhookEvent(deps, row.id, {
    id: eventId,
    type: 'RECONCILIATION',
    kind: 'charge',
    action: theirs === 'PAID' ? 'RECEIVED' : theirs,
    occurredAt: charge.paidAt ?? new Date(),
    charge,
    resourceId: charge.id,
    raw: null,
  });
  return {
    kind: ours === null ? 'missing_local' : 'status',
    gatewayId: charge.id,
    ours,
    theirs,
    action: result === 'PROCESSED' ? 'fixed' : 'review',
    ...(tenantId ? { tenantId } : {}),
  };
}
