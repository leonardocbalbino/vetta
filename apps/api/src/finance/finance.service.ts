import { Inject, Injectable } from '@nestjs/common';
import type { ConsultingPlanInput, CreditCardInput, PaymentAccountInput } from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import {
  addCycle,
  applyStudentInvoiceCharge,
  brl,
  createStudentInvoiceFromCharge,
  encryptSecret,
  fmtDate,
  localDate,
  PaymentProviderError,
  platformFeeBpsOf,
  platformSplit,
  tenantApiKey,
  toDateOnly,
  type BillingDeps,
  type EventPublisher,
  type PaymentProvider,
} from '@vetta/server';
import { z } from 'zod';
import {
  AppException,
  badRequest,
  conflict,
  notFound,
  paymentFailed,
  paymentNotConfigured,
} from '../common/errors';
import type { RequestMeta, TenantAccess } from '../common/request';
import { assertStudentInScope, requireStudent } from '../common/scope';
import { type ApiEnv, ENV } from '../config/env';
import { BILLING, EVENTS, PAYMENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import type { ManualEntryInputSchema, SellPlanSchema } from '@vetta/contracts';
import { HttpStatus } from '@nestjs/common';

const DAY = 86_400_000;

const accountRequired = () =>
  new AppException(
    'PAYMENT_ACCOUNT_REQUIRED',
    'Ative sua carteira (dados e conta bancária) para cobrar alunos.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

/** Intervalo [início, fim) do mês "AAAA-MM" em UTC (datas de vencimento são dias civis). */
export function monthRange(month: string | undefined, tz: string) {
  const m = month ?? localDate(new Date(), tz).slice(0, 7);
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return { month: m, from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 1)) };
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENTS) private readonly provider: PaymentProvider | null,
    @Inject(BILLING) private readonly billing: BillingDeps,
    @Inject(EVENTS) private readonly events: EventPublisher,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  private gateway() {
    if (!this.provider) throw paymentNotConfigured();
    return this.provider;
  }

  private async apiKey(tenantId: string) {
    const key = await tenantApiKey(this.prisma.system, tenantId, this.env.APP_ENCRYPTION_KEY);
    if (!key) throw accountRequired();
    return key;
  }

  private wrap<T>(p: Promise<T>): Promise<T> {
    return p.catch((err) => {
      if (err instanceof PaymentProviderError)
        throw paymentFailed(err.message || 'O gateway recusou a operação.', {
          gateway: err.details,
        });
      throw err;
    });
  }

  // ─── Carteira e KYC ────────────────────────────────────────────────────────

  async account(tenantId: string) {
    const acc = await this.prisma.tenant(tenantId).paymentAccount.findFirst({
      include: { kycDocuments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } },
    });
    if (!acc) return { status: 'NOT_STARTED' as const, account: null };
    return {
      status: acc.status,
      account: {
        id: acc.id,
        status: acc.status,
        statusReason: acc.statusReason,
        personType: acc.personType,
        cpfCnpj: acc.cpfCnpj ? `***${acc.cpfCnpj.slice(-4)}` : null,
        bankAccount: acc.bankAccount
          ? {
              ...(acc.bankAccount as Record<string, string>),
              account: `***${String((acc.bankAccount as Record<string, string>).account).slice(-3)}`,
            }
          : null,
        pixKey: acc.pixKey,
        pixKeyType: acc.pixKeyType,
        onboardingUrl: acc.onboardingUrl,
        submittedAt: acc.submittedAt,
        reviewedAt: acc.reviewedAt,
        documents: acc.kycDocuments.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          error: d.error,
          createdAt: d.createdAt,
        })),
      },
    };
  }

  async createAccount(t: TenantAccess, dto: PaymentAccountInput) {
    const gateway = this.gateway();
    const db = this.prisma.tenant(t.tenantId);
    const existing = await db.paymentAccount.findFirst();
    if (existing?.externalAccountId) throw conflict('Sua carteira já foi criada.');
    if (!this.env.ASAAS_WEBHOOK_TOKEN) throw paymentNotConfigured();
    const sub = await this.wrap(
      gateway.createSubaccount({
        name: dto.name,
        email: dto.email,
        cpfCnpj: dto.cpfCnpj,
        birthDate: dto.birthDate,
        companyType: dto.personType === 'CNPJ' ? dto.companyType : undefined,
        mobilePhone: dto.mobilePhone,
        incomeValueCents: dto.incomeValueCents,
        address: dto.address,
        webhookUrl: `${this.env.APP_API_URL}/v1/webhooks/asaas`,
        webhookToken: this.env.ASAAS_WEBHOOK_TOKEN,
        webhookEmail: dto.email,
      }),
    );
    const data = {
      provider: 'ASAAS' as const,
      externalAccountId: sub.id,
      walletId: sub.walletId,
      apiKeyEncrypted: encryptSecret(sub.apiKey, this.env.APP_ENCRYPTION_KEY),
      status: 'UNDER_REVIEW' as const,
      personType: dto.personType,
      cpfCnpj: dto.cpfCnpj,
      companyType: dto.companyType ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      incomeValueCents: dto.incomeValueCents,
      mobilePhone: dto.mobilePhone,
      bankAccount: dto.bankAccount,
      pixKey: dto.pixKey ?? null,
      pixKeyType: dto.pixKeyType ?? null,
      submittedAt: new Date(),
    };
    if (existing) await db.paymentAccount.update({ where: { id: existing.id }, data });
    else await db.paymentAccount.create({ data: data as never });
    await db.tenant.update({
      where: { id: t.tenantId },
      data: {
        documentType: dto.personType,
        documentNumber: dto.cpfCnpj,
        addressStreet: dto.address.street,
        addressNumber: dto.address.number,
        addressComplement: dto.address.complement ?? null,
        addressDistrict: dto.address.district,
        addressZip: dto.address.postalCode,
      },
    });
    return this.account(t.tenantId);
  }

  async addKycDocument(t: TenantAccess, userId: string, dto: { mediaId: string; type: string }) {
    const db = this.prisma.tenant(t.tenantId);
    const acc = await db.paymentAccount.findFirst();
    if (!acc?.externalAccountId) throw accountRequired();
    const media = await this.prisma.system.media.findFirst({
      where: {
        id: dto.mediaId,
        tenantId: t.tenantId,
        purpose: 'kyc_document',
        ownerUserId: userId,
        deletedAt: null,
      },
    });
    if (!media) throw badRequest('Envie o documento antes (upload kyc_document).');
    await db.kycDocument.create({
      data: { paymentAccountId: acc.id, mediaId: media.id, type: dto.type } as never,
    });
    return this.account(t.tenantId);
  }

  async requirements(tenantId: string) {
    const key = await this.apiKey(tenantId);
    return this.wrap(this.gateway().kycRequirements({ apiKey: key }));
  }

  // ─── Planos de consultoria ─────────────────────────────────────────────────

  plans(tenantId: string, onlyActive = false) {
    return this.prisma.tenant(tenantId).consultingPlan.findMany({
      where: { deletedAt: null, ...(onlyActive ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
      include: {
        _count: { select: { subscriptions: { where: { status: { in: ['ACTIVE', 'OVERDUE'] } } } } },
      },
    });
  }

  createPlan(tenantId: string, dto: ConsultingPlanInput) {
    return this.prisma.tenant(tenantId).consultingPlan.create({ data: dto as never });
  }

  async updatePlan(tenantId: string, id: string, dto: ConsultingPlanInput) {
    const db = this.prisma.tenant(tenantId);
    const p = await db.consultingPlan.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound('Plano não encontrado.');
    // Assinaturas existentes mantêm o valor e a taxa congelados na venda.
    return db.consultingPlan.update({ where: { id }, data: dto });
  }

  async deletePlan(tenantId: string, id: string) {
    const db = this.prisma.tenant(tenantId);
    const p = await db.consultingPlan.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound('Plano não encontrado.');
    await db.consultingPlan.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isPublic: false },
    });
    return { ok: true as const };
  }

  // ─── Venda ao aluno ────────────────────────────────────────────────────────

  async sell(t: TenantAccess, dto: z.infer<typeof SellPlanSchema>, meta: RequestMeta) {
    const gateway = this.gateway();
    const apiKey = await this.apiKey(t.tenantId);
    const db = this.prisma.tenant(t.tenantId);
    const link = await assertStudentInScope(this.prisma, t, dto.studentLinkId);
    const plan = await db.consultingPlan.findFirst({
      where: { id: dto.consultingPlanId, deletedAt: null, isActive: true },
    });
    if (!plan) throw notFound('Plano não encontrado.');
    if (!plan.methods.includes(dto.method))
      throw badRequest('Forma de pagamento não aceita neste plano.');
    if (dto.installments > plan.maxInstallments)
      throw badRequest(`Até ${plan.maxInstallments}x neste plano.`);
    const email =
      link.email ??
      (link.userId
        ? (await this.prisma.system.user.findUnique({ where: { id: link.userId } }))?.email
        : null);
    if (!email) throw badRequest('Cadastre o e-mail do aluno antes de cobrar.');
    if (!dto.cpfCnpj)
      throw badRequest('Informe o CPF do aluno.', 'VALIDATION_ERROR', { field: 'cpfCnpj' });
    const active = await db.studentSubscription.findFirst({
      where: {
        studentLinkId: link.id,
        consultingPlanId: plan.id,
        status: { in: ['PENDING', 'ACTIVE', 'OVERDUE'] },
      },
    });
    if (active) throw conflict('Este aluno já tem este plano ativo.');

    const bps = await platformFeeBpsOf(this.prisma.system, t.tenantId);
    const now = new Date();
    const firstDue =
      dto.firstDueDate ??
      localDate(
        new Date(now.getTime() + (dto.method === 'BOLETO' ? 3 * DAY : 0)),
        'America/Sao_Paulo',
      );
    const ctx = { apiKey, ...(meta.ip ? { remoteIp: meta.ip } : {}) };
    const customer = await this.wrap(
      gateway.createCustomer(
        {
          name: link.displayName,
          email,
          cpfCnpj: dto.cpfCnpj,
          phone: link.phone ?? undefined,
          externalReference: `student:${link.id}`,
        },
        ctx,
      ),
    );
    const ss = await db.studentSubscription.create({
      data: {
        studentLinkId: link.id,
        consultingPlanId: plan.id,
        status: 'PENDING',
        method: dto.method,
        paymentMode: plan.paymentMode,
        installments: plan.paymentMode === 'INSTALLMENTS' ? dto.installments : 1,
        priceCents: plan.priceCents,
        platformFeeBps: bps,
        startedAt: now,
        endsAt: addCycle(new Date(`${firstDue}T12:00:00Z`), plan.cycle),
        nextDueDate: new Date(`${firstDue}T12:00:00Z`),
        blockOnOverdue: dto.blockOnOverdue,
        gatewayCustomerId: customer.id,
      } as never,
    });
    const split = platformSplit(this.env.ASAAS_PLATFORM_WALLET_ID, bps);
    const ref = `ssub:${ss.id}`;
    let charges;
    if (plan.paymentMode === 'RECURRING') {
      const s = await this.wrap(
        gateway.createSubscription(
          {
            customerId: customer.id,
            method: dto.method,
            amountCents: plan.priceCents,
            cycle: plan.cycle,
            nextDueDate: firstDue,
            description: plan.name,
            externalReference: ref,
            split,
          },
          ctx,
        ),
      );
      await db.studentSubscription.update({
        where: { id: ss.id },
        data: { gatewaySubscriptionId: s.id },
      });
      charges = await this.wrap(gateway.listChargesOf({ subscriptionId: s.id }, ctx));
    } else {
      const c = await this.wrap(
        gateway.createCharge(
          {
            customerId: customer.id,
            method: dto.method,
            amountCents: plan.priceCents,
            dueDate: firstDue,
            description: plan.name,
            externalReference: ref,
            installments: plan.paymentMode === 'INSTALLMENTS' ? dto.installments : undefined,
            split,
          },
          ctx,
        ),
      );
      charges = c.installmentId
        ? await this.wrap(gateway.listChargesOf({ installmentId: c.installmentId }, ctx))
        : [c];
    }
    const invoices = [];
    for (const ch of charges)
      invoices.push(await createStudentInvoiceFromCharge(this.prisma.system, ss, ch));
    const first = invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    if (first) {
      await this.events.publish('invoice.created', {
        tenantId: t.tenantId,
        id: `inv-created:${first.id}`,
        payload: {
          studentLinkId: link.id,
          invoiceId: first.id,
          amount: brl(first.amountCents),
          dueDate: fmtDate(first.dueDate),
          link: first.invoiceUrl ?? '',
        },
      });
    }
    return { subscriptionId: ss.id, invoices: invoices.map((i) => this.invoiceView(i)) };
  }

  async subscriptions(
    tenantId: string,
    q: { studentLinkId?: string | undefined; status?: string | undefined },
  ) {
    return this.prisma.tenant(tenantId).studentSubscription.findMany({
      where: {
        deletedAt: null,
        ...(q.studentLinkId ? { studentLinkId: q.studentLinkId } : {}),
        ...(q.status ? { status: q.status as never } : {}),
      },
      include: {
        consultingPlan: { select: { name: true, cycle: true } },
        studentLink: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async cancelSubscription(tenantId: string, id: string) {
    const db = this.prisma.tenant(tenantId);
    const ss = await db.studentSubscription.findFirst({ where: { id, deletedAt: null } });
    if (!ss) throw notFound('Assinatura não encontrada.');
    if (ss.status === 'CANCELED' || ss.status === 'ENDED') return ss;
    if (ss.gatewaySubscriptionId && this.provider)
      await this.wrap(
        this.provider.cancelSubscription(ss.gatewaySubscriptionId, {
          apiKey: await this.apiKey(tenantId),
        }),
      );
    // Mantém o acesso até o fim do período pago (aviso de 7 dias antes do fim).
    return db.studentSubscription.update({
      where: { id },
      data: { canceledAt: new Date(), ...(ss.status === 'PENDING' ? { status: 'CANCELED' } : {}) },
    });
  }

  // ─── Faturas ───────────────────────────────────────────────────────────────

  invoiceView(i: {
    id: string;
    description: string;
    amountCents: number;
    netCents: number;
    platformFeeCents: number;
    gatewayFeeCents: number;
    status: string;
    method: string | null;
    dueDate: Date;
    paidAt: Date | null;
    invoiceUrl: string | null;
    boletoUrl: string | null;
    pixCopyPaste: string | null;
    pixQrCode: string | null;
    installmentNumber: number | null;
    installmentCount: number | null;
    failureReason: string | null;
    studentLinkId: string;
  }) {
    return {
      id: i.id,
      studentLinkId: i.studentLinkId,
      description: i.description,
      amountCents: i.amountCents,
      netCents: i.netCents,
      platformFeeCents: i.platformFeeCents,
      gatewayFeeCents: i.gatewayFeeCents,
      status: i.status,
      method: i.method,
      dueDate: toDateOnly(i.dueDate),
      paidAt: i.paidAt,
      invoiceUrl: i.invoiceUrl,
      boletoUrl: i.boletoUrl,
      pix: i.pixCopyPaste ? { copyPaste: i.pixCopyPaste, qrCode: i.pixQrCode } : null,
      installment: i.installmentCount
        ? { number: i.installmentNumber, count: i.installmentCount }
        : null,
      failureReason: i.failureReason,
    };
  }

  async invoices(
    tenantId: string,
    q: {
      status?: string | undefined;
      studentLinkId?: string | undefined;
      month?: string | undefined;
    },
  ) {
    const range = q.month ? monthRange(q.month, 'America/Sao_Paulo') : null;
    const items = await this.prisma.tenant(tenantId).invoice.findMany({
      where: {
        deletedAt: null,
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.studentLinkId ? { studentLinkId: q.studentLinkId } : {}),
        ...(range ? { dueDate: { gte: range.from, lt: range.to } } : {}),
      },
      include: { studentLink: { select: { displayName: true } } },
      orderBy: { dueDate: 'desc' },
      take: 300,
    });
    return items.map((i) => ({ ...this.invoiceView(i), studentName: i.studentLink.displayName }));
  }

  private async loadPix(
    tenantId: string,
    inv: {
      id: string;
      status: string;
      method: string | null;
      pixCopyPaste: string | null;
      gatewayChargeId: string | null;
    },
  ) {
    if (inv.pixCopyPaste || !this.provider || !inv.gatewayChargeId) return;
    if (inv.status !== 'PENDING' && inv.status !== 'OVERDUE') return;
    if (inv.method && inv.method !== 'PIX') return;
    const apiKey = await tenantApiKey(this.prisma.system, tenantId, this.env.APP_ENCRYPTION_KEY);
    if (!apiKey) return;
    const pix = await this.provider.getPix(inv.gatewayChargeId, { apiKey }).catch(() => null);
    if (pix)
      await this.prisma.system.invoice.update({
        where: { id: inv.id },
        data: { pixCopyPaste: pix.copyPaste, pixQrCode: pix.qrCode },
      });
  }

  async invoice(tenantId: string, id: string, studentLinkId?: string) {
    const db = this.prisma.tenant(tenantId);
    const where = { id, deletedAt: null, ...(studentLinkId ? { studentLinkId } : {}) };
    const inv = await db.invoice.findFirst({ where });
    if (!inv) throw notFound('Cobrança não encontrada.');
    await this.loadPix(tenantId, inv);
    return this.invoiceView((await db.invoice.findFirst({ where }))!);
  }

  // ─── Aluno ─────────────────────────────────────────────────────────────────

  async mine(t: TenantAccess) {
    const linkId = requireStudent(t);
    const db = this.prisma.tenant(t.tenantId);
    const [subs, invoices, link] = await Promise.all([
      db.studentSubscription.findMany({
        where: { studentLinkId: linkId, deletedAt: null, status: { not: 'CANCELED' } },
        include: { consultingPlan: { select: { name: true, cycle: true, benefits: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.invoice.findMany({
        where: { studentLinkId: linkId, deletedAt: null },
        orderBy: { dueDate: 'desc' },
        take: 50,
      }),
      db.studentLink.findFirstOrThrow({ where: { id: linkId } }),
    ]);
    return {
      blocked: link.status === 'OVERDUE',
      subscriptions: subs.map((s) => ({
        id: s.id,
        status: s.status,
        plan: s.consultingPlan,
        priceCents: s.priceCents,
        paymentMode: s.paymentMode,
        endsAt: s.endsAt,
        canceledAt: s.canceledAt,
      })),
      invoices: invoices.map((i) => this.invoiceView(i)),
    };
  }

  async payWithCard(
    t: TenantAccess,
    id: string,
    dto: {
      card: CreditCardInput;
      cardHolder: {
        name: string;
        email: string;
        cpfCnpj: string;
        postalCode: string;
        addressNumber: string;
        phone: string;
      };
    },
    meta: RequestMeta,
  ) {
    const linkId = requireStudent(t);
    const gateway = this.gateway();
    const inv = await this.prisma
      .tenant(t.tenantId)
      .invoice.findFirst({ where: { id, studentLinkId: linkId, deletedAt: null } });
    if (!inv?.gatewayChargeId) throw notFound('Cobrança não encontrada.');
    if (inv.status !== 'PENDING' && inv.status !== 'OVERDUE')
      throw conflict('Esta cobrança não está em aberto.');
    const apiKey = await this.apiKey(t.tenantId);
    const charge = await this.wrap(
      gateway.payWithCard(
        inv.gatewayChargeId,
        { customerId: '', card: dto.card, holder: dto.cardHolder },
        { apiKey, ...(meta.ip ? { remoteIp: meta.ip } : {}) },
      ),
    );
    await applyStudentInvoiceCharge(this.billing, inv.id, charge);
    return this.invoice(t.tenantId, inv.id, linkId);
  }

  // ─── Painel, extrato, saque, avulsos ───────────────────────────────────────

  private async ledgerAvailable(tenantId: string, now = new Date()) {
    const r = await this.prisma.tenant(tenantId).walletEntry.aggregate({
      where: { deletedAt: null, OR: [{ availableAt: null }, { availableAt: { lte: now } }] },
      _sum: { amountCents: true },
    });
    return r._sum.amountCents ?? 0;
  }

  async summary(tenantId: string, month?: string) {
    const db = this.prisma.tenant(tenantId);
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const r = monthRange(month, tenant.timezone);
    const now = new Date();
    const today = new Date(`${localDate(now, tenant.timezone)}T00:00:00Z`);
    const [paid, pending, overdue, toRelease, expenses, incomes, account] = await Promise.all([
      db.invoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: r.from, lt: r.to }, deletedAt: null },
        _sum: { amountCents: true, netCents: true, platformFeeCents: true, gatewayFeeCents: true },
        _count: true,
      }),
      db.invoice.aggregate({
        where: { status: 'PENDING', dueDate: { gte: today }, deletedAt: null },
        _sum: { amountCents: true },
        _count: true,
      }),
      db.invoice.aggregate({
        where: { status: 'OVERDUE', deletedAt: null },
        _sum: { amountCents: true },
        _count: true,
      }),
      db.walletEntry.aggregate({
        where: { deletedAt: null, availableAt: { gt: now } },
        _sum: { amountCents: true },
      }),
      db.expense.aggregate({
        where: { kind: 'EXPENSE', paidOn: { gte: r.from, lt: r.to }, deletedAt: null },
        _sum: { amountCents: true },
      }),
      db.expense.aggregate({
        where: { kind: 'INCOME', paidOn: { gte: r.from, lt: r.to }, deletedAt: null },
        _sum: { amountCents: true },
      }),
      db.paymentAccount.findFirst(),
    ]);
    let availableCents = await this.ledgerAvailable(tenantId, now);
    let balanceSource: 'gateway' | 'ledger' = 'ledger';
    if (this.provider && account?.apiKeyEncrypted) {
      const key = await tenantApiKey(this.prisma.system, tenantId, this.env.APP_ENCRYPTION_KEY);
      const b = key ? await this.provider.balance({ apiKey: key }).catch(() => null) : null;
      if (b) {
        availableCents = b.availableCents;
        balanceSource = 'gateway';
      }
    }
    const revenue = paid._sum.netCents ?? 0;
    return {
      month: r.month,
      revenue: {
        grossCents: paid._sum.amountCents ?? 0,
        netCents: revenue,
        platformFeeCents: paid._sum.platformFeeCents ?? 0,
        gatewayFeeCents: paid._sum.gatewayFeeCents ?? 0,
        count: paid._count,
      },
      receivable: { cents: pending._sum.amountCents ?? 0, count: pending._count },
      overdue: { cents: overdue._sum.amountCents ?? 0, count: overdue._count },
      balance: {
        availableCents,
        toReleaseCents: toRelease._sum.amountCents ?? 0,
        source: balanceSource,
      },
      manual: {
        expensesCents: expenses._sum.amountCents ?? 0,
        incomesCents: incomes._sum.amountCents ?? 0,
      },
      resultCents: revenue + (incomes._sum.amountCents ?? 0) - (expenses._sum.amountCents ?? 0),
      account: { status: account?.status ?? 'NOT_STARTED' },
    };
  }

  async statement(tenantId: string, month?: string) {
    const db = this.prisma.tenant(tenantId);
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const r = monthRange(month, tenant.timezone);
    const [entries, manual] = await Promise.all([
      db.walletEntry.findMany({
        where: { deletedAt: null, occurredAt: { gte: r.from, lt: r.to } },
        orderBy: { occurredAt: 'desc' },
      }),
      db.expense.findMany({
        where: { deletedAt: null, paidOn: { gte: r.from, lt: r.to } },
        orderBy: { paidOn: 'desc' },
      }),
    ]);
    const items = [
      ...entries.map((e) => ({
        id: e.id,
        source: 'wallet' as const,
        type: e.type,
        description: e.description,
        amountCents: e.amountCents,
        date: e.occurredAt,
        availableAt: e.availableAt,
      })),
      ...manual.map((m) => ({
        id: m.id,
        source: 'manual' as const,
        type: m.kind,
        description: `${m.description} (${m.category})`,
        amountCents: m.kind === 'EXPENSE' ? -m.amountCents : m.amountCents,
        date: m.paidOn,
        availableAt: null,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
    return { month: r.month, items };
  }

  async report(tenantId: string, month?: string): Promise<{ filename: string; csv: string }> {
    const db = this.prisma.tenant(tenantId);
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const r = monthRange(month, tenant.timezone);
    const [invoices, manual] = await Promise.all([
      db.invoice.findMany({
        where: {
          deletedAt: null,
          OR: [{ paidAt: { gte: r.from, lt: r.to } }, { dueDate: { gte: r.from, lt: r.to } }],
        },
        include: { studentLink: { select: { displayName: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      db.expense.findMany({
        where: { deletedAt: null, paidOn: { gte: r.from, lt: r.to } },
        orderBy: { paidOn: 'asc' },
      }),
    ]);
    const money = (c: number) => (c / 100).toFixed(2).replace('.', ',');
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const lines = [
      [
        'Tipo',
        'Data',
        'Aluno/Categoria',
        'Descrição',
        'Forma',
        'Status',
        'Bruto',
        'Taxa gateway',
        'Taxa Vetta',
        'Líquido',
      ].join(';'),
      ...invoices.map((i) =>
        [
          'Cobrança',
          toDateOnly(i.paidAt ?? i.dueDate),
          esc(i.studentLink.displayName),
          esc(i.description),
          i.method ?? '',
          i.status,
          money(i.amountCents),
          money(i.gatewayFeeCents),
          money(i.platformFeeCents),
          money(i.netCents),
        ].join(';'),
      ),
      ...manual.map((m) =>
        [
          m.kind === 'EXPENSE' ? 'Despesa' : 'Receita',
          toDateOnly(m.paidOn),
          esc(m.category),
          esc(m.description),
          '',
          '',
          money(m.amountCents),
          '',
          '',
          money(m.kind === 'EXPENSE' ? -m.amountCents : m.amountCents),
        ].join(';'),
      ),
    ];
    // BOM para o Excel abrir com acentos.
    return { filename: `vetta-financeiro-${r.month}.csv`, csv: `﻿${lines.join('\r\n')}\r\n` };
  }

  async withdraw(tenantId: string, amountCents: number) {
    const gateway = this.gateway();
    const apiKey = await this.apiKey(tenantId);
    const db = this.prisma.tenant(tenantId);
    const acc = await db.paymentAccount.findFirstOrThrow();
    if (acc.status !== 'APPROVED') throw badRequest('Sua carteira ainda não foi aprovada.');
    const available = Math.min(
      await this.ledgerAvailable(tenantId),
      (await gateway.balance({ apiKey }).catch(() => ({ availableCents: Infinity })))
        .availableCents,
    );
    if (amountCents > available)
      throw badRequest(`Saldo disponível: ${brl(available)}.`, 'VALIDATION_ERROR', {
        availableCents: available,
      });
    const target =
      acc.pixKey && acc.pixKeyType
        ? { pixKey: acc.pixKey, pixKeyType: acc.pixKeyType }
        : { bankAccount: acc.bankAccount as never };
    const tr = await this.wrap(gateway.transfer(amountCents, target, { apiKey }));
    const w = await db.withdrawal.create({
      data: {
        amountCents,
        feeCents: tr.feeCents,
        status: tr.status === 'DONE' ? 'DONE' : tr.status === 'FAILED' ? 'FAILED' : 'PROCESSING',
        pixKey: acc.pixKey,
        gatewayTransferId: tr.id,
        failureReason: tr.failureReason,
        ...(tr.status === 'DONE' ? { completedAt: new Date() } : {}),
      } as never,
    });
    if (tr.status !== 'FAILED') {
      await db.walletEntry.create({
        data: {
          type: 'WITHDRAWAL',
          amountCents: -amountCents,
          withdrawalId: w.id,
          description: 'Saque',
          occurredAt: new Date(),
          availableAt: new Date(),
          dedupeKey: `withdrawal:${w.id}`,
        } as never,
      });
    }
    return w;
  }

  withdrawals(tenantId: string) {
    return this.prisma.tenant(tenantId).withdrawal.findMany({
      where: { deletedAt: null },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
  }

  entries(tenantId: string, month?: string) {
    const r = monthRange(month, 'America/Sao_Paulo');
    return this.prisma.tenant(tenantId).expense.findMany({
      where: { deletedAt: null, paidOn: { gte: r.from, lt: r.to } },
      orderBy: { paidOn: 'desc' },
    });
  }

  createEntry(tenantId: string, dto: z.infer<typeof ManualEntryInputSchema>) {
    return this.prisma
      .tenant(tenantId)
      .expense.create({ data: { ...dto, paidOn: new Date(dto.paidOn) } as never });
  }

  async deleteEntry(tenantId: string, id: string) {
    const db = this.prisma.tenant(tenantId);
    const e = await db.expense.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Lançamento não encontrado.');
    await db.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  async settings(
    tenantId: string,
    dto: { blockOverdueStudents: boolean; blockOverdueAfterDays: number },
  ) {
    await this.prisma.tenant(tenantId).tenant.update({ where: { id: tenantId }, data: dto });
    return dto;
  }

  async getSettings(tenantId: string) {
    return this.prisma.tenant(tenantId).tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: { blockOverdueStudents: true, blockOverdueAfterDays: true },
    });
  }
}

export type ManualEntryWhere = Prisma.ExpenseWhereInput;
