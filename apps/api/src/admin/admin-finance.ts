import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CouponInputSchema } from '@vetta/contracts';
import {
  CYCLE_MONTHS,
  reconcileDay,
  toDateOnly,
  type BillingDeps,
  type PaymentProvider,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can } from '../access/decorators';
import { badRequest, conflict, notFound, paymentNotConfigured } from '../common/errors';
import { BILLING, PAYMENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class CouponDto extends createZodDto(CouponInputSchema) {}
class SubsQueryDto extends createZodDto(
  z.object({
    status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']).optional(),
    plan: z.enum(['FREE', 'PRO', 'PRO_PLUS']).optional(),
    cursor: z.uuid().optional(),
  }),
) {}
class InvoicesQueryDto extends createZodDto(
  z.object({
    status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELED', 'REFUNDED']).optional(),
    failed: z.enum(['true', 'false']).optional(),
    tenantId: z.uuid().optional(),
    cursor: z.uuid().optional(),
  }),
) {}
class RefundDto extends createZodDto(
  z.object({
    amountCents: z.number().int().min(1).optional(),
    reason: z.string().trim().min(3).max(300),
  }),
) {}
class FiscalQueryDto extends createZodDto(
  z.object({
    status: z
      .enum(['PENDING', 'PENDING_CONFIG', 'PROCESSING', 'ISSUED', 'FAILED', 'CANCELED'])
      .optional(),
  }),
) {}
class ReconcileDto extends createZodDto(z.object({ date: z.iso.date().optional() })) {}

const DAY = 86_400_000;
const PAGE = 50;

/** Financeiro da plataforma: assinaturas, faturas, métricas, conciliação e NFS-e. */
@ApiTags('admin')
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENTS) private readonly provider: PaymentProvider | null,
    @Inject(BILLING) private readonly billing: BillingDeps,
  ) {}

  /**
   * MRR: soma do valor mensal equivalente das assinaturas pagas ativas (com cupom).
   * Churn (30 dias): assinaturas pagas que viraram FREE / pagas no início da janela.
   * LTV: ARPU mensal / churn mensal.
   */
  @Get('metrics')
  @Can('read', 'platform.finance')
  async metrics() {
    const db = this.prisma.platform;
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY);
    const subs = await db.tenantSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        plan: { code: { not: 'FREE' } },
        deletedAt: null,
      },
      include: { plan: { include: { prices: true } }, coupon: true },
    });
    const byPlan = new Map<
      string,
      { plan: string; subscribers: number; mrrCents: number; revenue30dCents: number }
    >();
    let mrr = 0;
    for (const s of subs) {
      const price = s.plan.prices.find((p) => p.cycle === s.cycle)?.amountCents ?? 0;
      let monthly = price / CYCLE_MONTHS[s.cycle];
      if (
        s.coupon &&
        (s.coupon.durationCycles === null || s.couponCyclesUsed < s.coupon.durationCycles)
      ) {
        monthly -=
          (s.coupon.discountType === 'PERCENT'
            ? (price * (s.coupon.percentOff ?? 0)) / 100
            : (s.coupon.amountOffCents ?? 0)) / CYCLE_MONTHS[s.cycle];
      }
      mrr += Math.max(0, monthly);
      const e = byPlan.get(s.plan.code) ?? {
        plan: s.plan.name,
        subscribers: 0,
        mrrCents: 0,
        revenue30dCents: 0,
      };
      e.subscribers++;
      e.mrrCents += Math.round(Math.max(0, monthly));
      byPlan.set(s.plan.code, e);
    }
    const paid30 = await db.platformInvoice.findMany({
      where: { status: 'PAID', paidAt: { gte: since } },
      select: {
        amountCents: true,
        discountCents: true,
        creditCents: true,
        plan: { select: { code: true, name: true } },
      },
    });
    let revenue30 = 0;
    for (const i of paid30) {
      const v = i.amountCents - i.discountCents - i.creditCents;
      revenue30 += v;
      if (i.plan) {
        const e = byPlan.get(i.plan.code) ?? {
          plan: i.plan.name,
          subscribers: 0,
          mrrCents: 0,
          revenue30dCents: 0,
        };
        e.revenue30dCents += v;
        byPlan.set(i.plan.code, e);
      }
    }
    // Churn: faturas pagas há 30–60 dias de tenants que hoje estão no FREE.
    const prevPaid = await db.platformInvoice.findMany({
      where: { status: 'PAID', paidAt: { gte: new Date(now.getTime() - 60 * DAY), lt: since } },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    const nowFree = prevPaid.length
      ? await db.tenantSubscription.count({
          where: { tenantId: { in: prevPaid.map((p) => p.tenantId) }, plan: { code: 'FREE' } },
        })
      : 0;
    const churnRate = prevPaid.length ? nowFree / prevPaid.length : 0;
    const arpu = subs.length ? mrr / subs.length : 0;
    const [trialing, pastDue, failed30, refunded30, pendingFiscal] = await Promise.all([
      db.tenantSubscription.count({ where: { status: 'TRIALING' } }),
      db.tenantSubscription.count({ where: { status: 'PAST_DUE' } }),
      db.platformInvoice.count({ where: { failedAt: { gte: since } } }),
      db.platformInvoice.aggregate({
        where: { refundedAt: { gte: since } },
        _sum: { refundedCents: true },
        _count: true,
      }),
      db.fiscalInvoice.count({
        where: { status: { in: ['PENDING', 'PENDING_CONFIG', 'FAILED'] } },
      }),
    ]);
    return {
      mrrCents: Math.round(mrr),
      arrCents: Math.round(mrr * 12),
      payingSubscribers: subs.length,
      trialing,
      pastDue,
      revenue30dCents: revenue30,
      churnRate30d: Math.round(churnRate * 1000) / 10,
      churned30d: nowFree,
      arpuCents: Math.round(arpu),
      /** Sem churn observado o LTV é indefinido (null). */
      ltvCents: churnRate > 0 ? Math.round(arpu / churnRate) : null,
      failedPayments30d: failed30,
      refunds30d: { count: refunded30._count, cents: refunded30._sum.refundedCents ?? 0 },
      fiscalPending: pendingFiscal,
      byPlan: [...byPlan.entries()].map(([code, v]) => ({ code, ...v })),
    };
  }

  @Get('subscriptions')
  @Can('read', 'platform.finance')
  async subscriptions(@Query() q: SubsQueryDto) {
    const items = await this.prisma.platform.tenantSubscription.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.plan ? { plan: { code: q.plan } } : {}),
      },
      include: {
        plan: { select: { code: true, name: true } },
        tenant: { select: { id: true, name: true, slug: true } },
        pendingPlan: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
      take: PAGE + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return {
      items: items.slice(0, PAGE),
      nextCursor: items.length > PAGE ? items[PAGE - 1]!.id : null,
    };
  }

  @Get('invoices')
  @Can('read', 'platform.finance')
  async invoices(@Query() q: InvoicesQueryDto) {
    const items = await this.prisma.platform.platformInvoice.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.failed === 'true' ? { failedAt: { not: null } } : {}),
        ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      },
      include: {
        tenant: { select: { id: true, name: true } },
        plan: { select: { name: true } },
        fiscalInvoice: { select: { status: true, number: true } },
      },
      orderBy: { id: 'desc' },
      take: PAGE + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return {
      items: items.slice(0, PAGE),
      nextCursor: items.length > PAGE ? items[PAGE - 1]!.id : null,
    };
  }

  /** Estorno total ou parcial (o webhook confirma e atualiza a fatura). */
  @Post('invoices/:id/refund')
  @HttpCode(200)
  @Can('manage', 'platform.finance')
  async refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto) {
    if (!this.provider) throw paymentNotConfigured();
    const inv = await this.prisma.platform.platformInvoice.findUnique({ where: { id } });
    if (!inv) throw notFound('Fatura não encontrada.');
    if (inv.status !== 'PAID' || !inv.gatewayInvoiceId)
      throw conflict('Só faturas pagas podem ser estornadas.');
    const total = inv.amountCents - inv.discountCents - inv.creditCents;
    if (dto.amountCents && dto.amountCents > total) throw badRequest('Valor maior que o pago.');
    await this.provider.refundCharge(inv.gatewayInvoiceId, dto.amountCents);
    return this.prisma.platform.platformInvoice.update({
      where: { id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundedCents: dto.amountCents ?? total,
        failureReason: `Estorno: ${dto.reason}`,
      },
    });
  }

  @Get('reconciliation')
  @Can('read', 'platform.finance')
  reconciliation() {
    return this.prisma.platform.reconciliationRun.findMany({ orderBy: { date: 'desc' }, take: 60 });
  }

  @Post('reconciliation')
  @HttpCode(200)
  @Can('manage', 'platform.finance')
  async reconcile(@Body() dto: ReconcileDto) {
    if (!this.provider) throw paymentNotConfigured();
    const date = dto.date ?? toDateOnly(new Date(Date.now() - DAY));
    // Rodar de novo o mesmo dia: apaga a execução anterior.
    await this.prisma.platform.reconciliationRun.deleteMany({
      where: { date: new Date(`${date}T00:00:00Z`) },
    });
    return reconcileDay(this.billing, date);
  }

  @Get('fiscal-invoices')
  @Can('read', 'platform.finance')
  fiscal(@Query() q: FiscalQueryDto) {
    return this.prisma.platform.fiscalInvoice.findMany({
      where: q.status ? { status: q.status } : {},
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('fiscal-invoices/:id/retry')
  @HttpCode(200)
  @Can('manage', 'platform.finance')
  async retryFiscal(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.prisma.platform.fiscalInvoice.findUnique({ where: { id } });
    if (!f) throw notFound('Nota não encontrada.');
    return this.prisma.platform.fiscalInvoice.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, error: null },
    });
  }

  @Get('coupons')
  @Can('read', 'platform.finance')
  coupons() {
    return this.prisma.platform.coupon.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('coupons')
  @Can('manage', 'platform.finance')
  async createCoupon(@Body() dto: CouponDto) {
    const exists = await this.prisma.platform.coupon.findUnique({ where: { code: dto.code } });
    if (exists) throw conflict('Já existe um cupom com este código.');
    return this.prisma.platform.coupon.create({ data: this.couponData(dto) });
  }

  @Patch('coupons/:id')
  @Can('manage', 'platform.finance')
  async updateCoupon(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CouponDto) {
    const c = await this.prisma.platform.coupon.findUnique({ where: { id } });
    if (!c) throw notFound('Cupom não encontrado.');
    return this.prisma.platform.coupon.update({ where: { id }, data: this.couponData(dto) });
  }

  private couponData(dto: z.infer<typeof CouponInputSchema>) {
    return {
      code: dto.code,
      description: dto.description ?? null,
      discountType: dto.discountType,
      percentOff: dto.discountType === 'PERCENT' ? (dto.percentOff ?? null) : null,
      amountOffCents: dto.discountType === 'FIXED' ? (dto.amountOffCents ?? null) : null,
      durationCycles: dto.durationCycles ?? null,
      maxRedemptions: dto.maxRedemptions ?? null,
      planCodes: dto.planCodes,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      isActive: dto.isActive,
    };
  }
}
