import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CouponPreviewSchema,
  CYCLE_LABEL,
  PlatformCheckoutSchema,
  type BillingCycle,
  type PlatformCheckoutInput,
} from '@vetta/contracts';
import {
  addCycle,
  applyPlatformInvoicePaid,
  COUPON_MESSAGES,
  couponDiscount,
  couponProblem,
  decryptCard,
  localDate,
  encryptCard,
  monthlyEquivalent,
  PaymentProviderError,
  prorate,
  recurringAmount,
  toDateOnly,
  type BillingDeps,
  type PaymentProvider,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can } from '../access/decorators';
import {
  badRequest,
  conflict,
  notFound,
  paymentFailed,
  paymentNotConfigured,
} from '../common/errors';
import { CurrentTenant, Meta, type RequestMeta, type TenantAccess } from '../common/request';
import { type ApiEnv, ENV } from '../config/env';
import { BILLING, PAYMENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class CheckoutDto extends createZodDto(PlatformCheckoutSchema) {}
class CouponPreviewDto extends createZodDto(CouponPreviewSchema) {}
class QuoteDto extends createZodDto(
  CouponPreviewSchema.extend({ code: CouponPreviewSchema.shape.code.optional().or(z.literal('')) }),
) {}

const DAY = 86_400_000;

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENTS) private readonly provider: PaymentProvider | null,
    @Inject(BILLING) private readonly billing: BillingDeps,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  private gateway(): PaymentProvider {
    if (!this.provider) throw paymentNotConfigured();
    return this.provider;
  }

  async current(tenantId: string) {
    const db = this.prisma.system;
    const sub = await db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true, pendingPlan: true, coupon: true },
    });
    const invoices = await db.platformInvoice.findMany({
      where: { tenantId, deletedAt: null },
      include: { fiscalInvoice: true, plan: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    const open = invoices.find((i) => i.status === 'PENDING' || i.status === 'OVERDUE') ?? null;
    return {
      status: sub.status,
      plan: { code: sub.plan.code, name: sub.plan.name },
      cycle: sub.cycle,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      pendingChange: sub.pendingPlan
        ? {
            plan: { code: sub.pendingPlan.code, name: sub.pendingPlan.name },
            cycle: sub.pendingCycle ?? sub.cycle,
            effectiveAt: sub.currentPeriodEnd,
          }
        : null,
      pastDueSince: sub.pastDueSince,
      graceEndsAt: sub.graceEndsAt,
      paymentMethod: sub.paymentMethod,
      card: sub.cardLast4 ? { brand: sub.cardBrand, last4: sub.cardLast4 } : null,
      coupon: sub.coupon
        ? {
            code: sub.coupon.code,
            cyclesUsed: sub.couponCyclesUsed,
            durationCycles: sub.coupon.durationCycles,
          }
        : null,
      creditCents: sub.creditCents,
      openInvoice: open ? this.invoiceView(open) : null,
      invoices: invoices.map((i) => this.invoiceView(i)),
      /** O mobile abre esta URL quando a loja permite link externo (ADR-010). */
      checkoutUrl: `${this.env.APP_WEB_URL}/assinatura`,
      paymentsEnabled: !!this.provider,
    };
  }

  private invoiceView(i: {
    id: string;
    status: string;
    amountCents: number;
    discountCents: number;
    creditCents: number;
    dueDate: Date;
    paidAt: Date | null;
    method: string | null;
    invoiceUrl: string | null;
    boletoUrl: string | null;
    pixCopyPaste: string | null;
    pixQrCode: string | null;
    description: string | null;
    failureReason: string | null;
    refundedCents: number;
    fiscalInvoice?: { status: string; number: string | null; pdfUrl: string | null } | null;
  }) {
    return {
      id: i.id,
      status: i.status,
      description: i.description,
      amountCents: i.amountCents,
      discountCents: i.discountCents,
      creditCents: i.creditCents,
      totalCents: Math.max(i.amountCents - i.discountCents - i.creditCents, 0),
      dueDate: toDateOnly(i.dueDate),
      paidAt: i.paidAt,
      method: i.method,
      invoiceUrl: i.invoiceUrl,
      boletoUrl: i.boletoUrl,
      pix: i.pixCopyPaste ? { copyPaste: i.pixCopyPaste, qrCode: i.pixQrCode } : null,
      failureReason: i.failureReason,
      refundedCents: i.refundedCents,
      fiscal: i.fiscalInvoice
        ? {
            status: i.fiscalInvoice.status,
            number: i.fiscalInvoice.number,
            pdfUrl: i.fiscalInvoice.pdfUrl,
          }
        : null,
    };
  }

  private async priceOf(planCode: string, cycle: BillingCycle) {
    const plan = await this.prisma.system.plan.findUnique({
      where: { code: planCode as never },
      include: { prices: { where: { cycle, isActive: true } } },
    });
    if (!plan || !plan.isActive || !plan.isPublic || !plan.prices[0])
      throw badRequest('Plano ou ciclo indisponível.');
    return { plan, amountCents: plan.prices[0].amountCents };
  }

  private async coupon(code: string | undefined, planCode: string, now: Date) {
    if (!code) return null;
    const c = await this.prisma.system.coupon.findUnique({ where: { code } });
    if (!c || c.deletedAt)
      throw badRequest('Cupom não encontrado.', 'VALIDATION_ERROR', { field: 'couponCode' });
    const problem = couponProblem(c, planCode as never, now);
    if (problem)
      throw badRequest(COUPON_MESSAGES[problem], 'VALIDATION_ERROR', {
        field: 'couponCode',
        problem,
      });
    return c;
  }

  /** Simulação do valor: preço, cupom, crédito do pró-rata e quando vale. */
  async quote(tenantId: string, planCode: string, cycle: BillingCycle, couponCode?: string) {
    const now = new Date();
    const db = this.prisma.system;
    const sub = await db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: { include: { prices: true } } },
    });
    const { plan, amountCents } = await this.priceOf(planCode, cycle);
    const coupon = await this.coupon(couponCode, planCode, now);
    const discount = coupon ? couponDiscount(coupon, amountCents) : 0;
    const paidPlan =
      sub.status === 'ACTIVE' &&
      sub.plan.code !== 'FREE' &&
      !!sub.currentPeriodEnd &&
      sub.currentPeriodEnd > now;
    if (!paidPlan) {
      return {
        kind: 'NEW' as const,
        plan,
        amountCents,
        discountCents: discount,
        creditCents: 0,
        chargeNowCents: amountCents - discount,
        effectiveAt: now,
        coupon,
      };
    }
    if (sub.planId === plan.id && sub.cycle === cycle)
      throw conflict('Você já está neste plano e ciclo.');
    const currentPrice = sub.plan.prices.find((p) => p.cycle === sub.cycle)?.amountCents ?? 0;
    const lastPaid = await db.platformInvoice.findFirst({
      where: { tenantId, status: 'PAID', periodEnd: { gte: now } },
      orderBy: { paidAt: 'desc' },
    });
    const p = prorate({
      paidCents: lastPaid ? lastPaid.amountCents - lastPaid.discountCents : currentPrice,
      periodStart: sub.currentPeriodStart ?? now,
      periodEnd: sub.currentPeriodEnd!,
      now,
      newAmountCents: amountCents - discount,
      currentMonthlyCents: monthlyEquivalent(currentPrice, sub.cycle),
      newMonthlyCents: monthlyEquivalent(amountCents, cycle),
    });
    // Mesmo valor mensal com ciclo diferente: troca no fim do período, como downgrade.
    const kind = p.kind === 'SAME' ? ('DOWNGRADE' as const) : p.kind;
    return {
      kind,
      plan,
      amountCents,
      discountCents: discount,
      creditCents: p.creditCents,
      chargeNowCents: kind === 'UPGRADE' ? p.chargeNowCents : 0,
      leftoverCreditCents: p.leftoverCreditCents,
      effectiveAt: kind === 'UPGRADE' ? now : p.effectiveAt,
      coupon,
    };
  }

  async previewCoupon(
    tenantId: string,
    dto: { code: string; planCode: string; cycle: BillingCycle },
  ) {
    const q = await this.quote(tenantId, dto.planCode, dto.cycle, dto.code);
    return {
      code: q.coupon!.code,
      description: q.coupon!.description,
      discountCents: q.discountCents,
      durationCycles: q.coupon!.durationCycles,
      chargeNowCents: q.chargeNowCents,
    };
  }

  async checkout(tenantId: string, dto: PlatformCheckoutInput, meta: RequestMeta) {
    const gateway = this.gateway();
    const now = new Date();
    const db = this.prisma.system;
    const q = await this.quote(tenantId, dto.planCode, dto.cycle, dto.couponCode);
    const sub = await db.tenantSubscription.findUniqueOrThrow({ where: { tenantId } });

    // Downgrade (ou troca de ciclo): agenda para o fim do período e ajusta a recorrência.
    if (q.kind === 'DOWNGRADE') {
      const recurring = q.amountCents - q.discountCents;
      if (sub.gatewaySubscriptionId)
        await gateway.updateSubscription(sub.gatewaySubscriptionId, {
          amountCents: recurring,
          cycle: dto.cycle,
          nextDueDate: toDateOnly(sub.currentPeriodEnd!),
          updatePendingCharges: true,
        });
      await db.tenantSubscription.update({
        where: { id: sub.id },
        data: {
          pendingPlanId: q.plan.id,
          pendingCycle: dto.cycle,
          cancelAtPeriodEnd: false,
          couponId: q.coupon?.id ?? sub.couponId,
        },
      });
      return { kind: 'DOWNGRADE' as const, effectiveAt: q.effectiveAt, invoice: null };
    }

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    let customerId = sub.gatewayCustomerId;
    try {
      if (!customerId) {
        customerId = (
          await gateway.createCustomer({
            name: dto.billing.name,
            email: dto.billing.email,
            cpfCnpj: dto.billing.cpfCnpj,
            phone: dto.billing.phone,
            postalCode: dto.billing.postalCode,
            addressNumber: dto.billing.addressNumber,
            externalReference: `tenant:${tenantId}`,
          })
        ).id;
      }
      // Dados fiscais para a NFS-e.
      await db.tenant.update({
        where: { id: tenantId },
        data: {
          legalName: tenant.legalName ?? dto.billing.name,
          documentType: dto.billing.cpfCnpj.length === 14 ? 'CNPJ' : 'CPF',
          documentNumber: dto.billing.cpfCnpj,
          billingEmail: dto.billing.email,
          ...(dto.billing.postalCode ? { addressZip: dto.billing.postalCode } : {}),
          ...(dto.billing.addressNumber ? { addressNumber: dto.billing.addressNumber } : {}),
        },
      });
      let cardToken: string | undefined;
      const cardData: Record<string, unknown> = {};
      if (dto.method === 'CREDIT_CARD') {
        const c = await gateway.tokenizeCard(
          { customerId, card: dto.card!, holder: dto.cardHolder! },
          meta.ip ? { remoteIp: meta.ip } : {},
        );
        cardToken = c.token;
        Object.assign(cardData, {
          cardTokenEncrypted: encryptCard(c.token, this.env.APP_ENCRYPTION_KEY),
          cardBrand: c.brand,
          cardLast4: c.last4,
        });
      }
      await db.tenantSubscription.update({
        where: { id: sub.id },
        data: { gatewayCustomerId: customerId, paymentMethod: dto.method, ...cardData },
      });

      const creditUsed = Math.min(q.creditCents, q.amountCents - q.discountCents);
      // Vencimento é dia civil no fuso do personal (não a data UTC).
      const dueDay = localDate(
        new Date(now.getTime() + (dto.method === 'BOLETO' ? 3 * DAY : 0)),
        tenant.timezone,
      );
      const due = new Date(`${dueDay}T12:00:00Z`);
      const inv = await db.platformInvoice.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          planId: q.plan.id,
          cycle: dto.cycle,
          couponId: q.coupon?.id ?? null,
          amountCents: q.amountCents,
          discountCents: q.discountCents,
          creditCents: creditUsed,
          status: 'PENDING',
          method: dto.method,
          dueDate: due,
          periodStart: now,
          periodEnd: addCycle(now, dto.cycle),
          description: `Assinatura Vetta ${q.plan.name} (${CYCLE_LABEL[dto.cycle].toLowerCase()})`,
        },
      });
      if (q.coupon)
        await db.coupon.update({
          where: { id: q.coupon.id },
          data: { redemptionsCount: { increment: 1 } },
        });
      if (q.kind === 'UPGRADE' && 'leftoverCreditCents' in q && q.leftoverCreditCents)
        await db.tenantSubscription.update({
          where: { id: sub.id },
          data: { creditCents: q.leftoverCreditCents },
        });

      if (q.chargeNowCents <= 0) {
        await applyPlatformInvoicePaid(this.billing, inv.id, {
          paidAt: now,
          method: dto.method,
          recurring: false,
        });
        return { kind: q.kind, effectiveAt: now, invoice: await this.invoice(tenantId, inv.id) };
      }

      const charge = await gateway.createCharge(
        {
          customerId,
          method: dto.method,
          amountCents: q.chargeNowCents,
          dueDate: dueDay,
          description: inv.description!,
          externalReference: `pinv:${inv.id}`,
          cardToken,
        },
        meta.ip ? { remoteIp: meta.ip } : {},
      );
      const pix = dto.method === 'PIX' ? await gateway.getPix(charge.id).catch(() => null) : null;
      await db.platformInvoice.update({
        where: { id: inv.id },
        data: {
          gatewayInvoiceId: charge.id,
          invoiceUrl: charge.invoiceUrl,
          boletoUrl: charge.boletoUrl,
          pixQrCode: pix?.qrCode ?? null,
          pixCopyPaste: pix?.copyPaste ?? null,
        },
      });
      if (charge.status === 'CONFIRMED' || charge.status === 'RECEIVED') {
        await applyPlatformInvoicePaid(this.billing, inv.id, {
          paidAt: now,
          method: dto.method,
          recurring: false,
        });
      }
      return { kind: q.kind, effectiveAt: now, invoice: await this.invoice(tenantId, inv.id) };
    } catch (err) {
      if (err instanceof PaymentProviderError)
        throw paymentFailed(err.message || 'O pagamento não foi aprovado.', {
          gateway: err.details,
        });
      throw err;
    }
  }

  async invoice(tenantId: string, id: string) {
    const i = await this.prisma.system.platformInvoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { fiscalInvoice: true },
    });
    if (!i) throw notFound('Fatura não encontrada.');
    return this.invoiceView(i);
  }

  /** Cancela ao fim do período: nenhuma nova cobrança; os dados ficam. */
  async cancel(tenantId: string) {
    const db = this.prisma.system;
    const sub = await db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true },
    });
    if (sub.plan.code === 'FREE' || sub.status === 'TRIALING')
      throw badRequest('Não há assinatura paga para cancelar.');
    if (sub.gatewaySubscriptionId && this.provider)
      await this.provider.cancelSubscription(sub.gatewaySubscriptionId);
    await db.tenantSubscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        gatewaySubscriptionId: null,
        pendingPlanId: null,
        pendingCycle: null,
      },
    });
    return this.current(tenantId);
  }

  /** Desfaz o cancelamento antes do fim do período (recria a recorrência). */
  async resume(tenantId: string) {
    const gateway = this.gateway();
    const db = this.prisma.system;
    const sub = await db.tenantSubscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true },
    });
    if (!sub.cancelAtPeriodEnd || !sub.currentPeriodEnd || sub.currentPeriodEnd <= new Date())
      throw badRequest('Não há cancelamento para desfazer.');
    const amount = await recurringAmount(
      db,
      sub.planId,
      sub.cycle,
      sub.couponId,
      sub.couponCyclesUsed,
    );
    const created = await gateway.createSubscription({
      customerId: sub.gatewayCustomerId!,
      method: sub.paymentMethod ?? 'PIX',
      amountCents: amount,
      cycle: sub.cycle,
      nextDueDate: toDateOnly(sub.currentPeriodEnd),
      description: `Vetta ${sub.plan.name}`,
      externalReference: `psub:${sub.id}`,
      cardToken: decryptCard(sub.cardTokenEncrypted, this.env.APP_ENCRYPTION_KEY),
    });
    await db.tenantSubscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false, canceledAt: null, gatewaySubscriptionId: created.id },
    });
    return this.current(tenantId);
  }
}

@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Get()
  @Can('read', 'subscription')
  current(@CurrentTenant() t: TenantAccess) {
    return this.service.current(t.tenantId);
  }

  @Post('quote')
  @HttpCode(200)
  @Can('read', 'subscription')
  async quote(@CurrentTenant() t: TenantAccess, @Body() dto: QuoteDto) {
    const q = await this.service.quote(t.tenantId, dto.planCode, dto.cycle, dto.code || undefined);
    return {
      kind: q.kind,
      amountCents: q.amountCents,
      discountCents: q.discountCents,
      creditCents: q.creditCents,
      chargeNowCents: q.chargeNowCents,
      effectiveAt: q.effectiveAt,
    };
  }

  @Post('coupon')
  @HttpCode(200)
  @Can('read', 'subscription')
  coupon(@CurrentTenant() t: TenantAccess, @Body() dto: CouponPreviewDto) {
    return this.service.previewCoupon(t.tenantId, dto);
  }

  @Post('checkout')
  @HttpCode(200)
  @Can('manage', 'subscription')
  checkout(@CurrentTenant() t: TenantAccess, @Body() dto: CheckoutDto, @Meta() meta: RequestMeta) {
    return this.service.checkout(t.tenantId, dto, meta);
  }

  @Get('invoices/:id')
  @Can('read', 'subscription')
  invoice(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.invoice(t.tenantId, id);
  }

  @Post('cancel')
  @HttpCode(200)
  @Can('manage', 'subscription')
  cancel(@CurrentTenant() t: TenantAccess) {
    return this.service.cancel(t.tenantId);
  }

  @Post('resume')
  @HttpCode(200)
  @Can('manage', 'subscription')
  resume(@CurrentTenant() t: TenantAccess) {
    return this.service.resume(t.tenantId);
  }
}
