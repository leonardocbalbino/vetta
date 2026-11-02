import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PublicCheckoutSchema,
  ResultRequestSchema,
  SalesPageInputSchema,
  TestimonialInputSchema,
  type PublicCheckoutInput,
  type SalesPageInput,
} from '@vetta/contracts';
import {
  completeCheckout,
  localDate,
  PaymentProviderError,
  platformFeeBpsOf,
  platformSplit,
  tenantApiKey,
  type BillingDeps,
  type EventPublisher,
  type PaymentProvider,
  type StorageProvider,
} from '@vetta/server';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, Public, RequireFeature, Roles, TenantScoped } from '../access/decorators';
import {
  badRequest,
  conflict,
  notFound,
  paymentFailed,
  paymentNotConfigured,
} from '../common/errors';
import { signedMediaUrl } from '../common/media';
import { CurrentTenant, Meta, type RequestMeta, type TenantAccess } from '../common/request';
import { assertStudentInScope, requireStudent } from '../common/scope';
import { type ApiEnv, ENV } from '../config/env';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { BILLING, EVENTS, PAYMENTS, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class PageDto extends createZodDto(SalesPageInputSchema) {}
class TestimonialDto extends createZodDto(TestimonialInputSchema) {}
class TestimonialStatusDto extends createZodDto(
  z.object({ status: z.enum(['APPROVED', 'HIDDEN', 'PENDING']) }),
) {}
class ResultDto extends createZodDto(ResultRequestSchema) {}
class ConsentDto extends createZodDto(z.object({ granted: z.boolean() })) {}
class CheckoutDto extends createZodDto(PublicCheckoutSchema) {}

const DAY = 86_400_000;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(PAYMENTS) private readonly provider: PaymentProvider | null,
    @Inject(BILLING) private readonly billing: BillingDeps,
    @Inject(EVENTS) private readonly events: EventPublisher,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  // ─── Editor ────────────────────────────────────────────────────────────────

  async get(tenantId: string) {
    const db = this.prisma.tenant(tenantId);
    const [page, tenant] = await Promise.all([
      db.salesPage.findFirst(),
      db.tenant.findFirstOrThrow({
        where: { id: tenantId },
        select: { slug: true, name: true, cref: true, crefState: true },
      }),
    ]);
    const photo = page?.photoMediaId
      ? await this.prisma.system.media.findUnique({ where: { id: page.photoMediaId } })
      : null;
    return {
      slug: tenant.slug,
      url: `${this.env.APP_SITE_URL}/p/${tenant.slug}`,
      tenantName: tenant.name,
      cref: tenant.cref ? `${tenant.cref}${tenant.crefState ? `-${tenant.crefState}` : ''}` : null,
      headline: page?.headline ?? null,
      bio: page?.bio ?? null,
      photoMediaId: page?.photoMediaId ?? null,
      photoUrl: photo ? await signedMediaUrl(this.storage, photo) : null,
      specialties: page?.specialties ?? [],
      faq: (page?.faq as { question: string; answer: string }[] | undefined) ?? [],
      socialLinks: (page?.socialLinks as Record<string, string> | undefined) ?? {},
      seoTitle: page?.seoTitle ?? null,
      seoDescription: page?.seoDescription ?? null,
      isPublished: page?.isPublished ?? false,
      publishedAt: page?.publishedAt ?? null,
    };
  }

  async save(tenantId: string, dto: SalesPageInput) {
    const db = this.prisma.tenant(tenantId);
    if (dto.photoMediaId) {
      const m = await this.prisma.system.media.findFirst({
        where: {
          id: dto.photoMediaId,
          tenantId,
          purpose: { in: ['avatar', 'brand_logo', 'progress_photo'] },
          deletedAt: null,
        },
      });
      if (!m) throw badRequest('Foto inválida.');
    }
    const current = await db.salesPage.findFirst();
    const data = {
      headline: dto.headline ?? null,
      bio: dto.bio ?? null,
      photoMediaId: dto.photoMediaId ?? null,
      specialties: dto.specialties,
      faq: dto.faq,
      socialLinks: dto.socialLinks,
      seoTitle: dto.seoTitle ?? null,
      seoDescription: dto.seoDescription ?? null,
      isPublished: dto.isPublished,
      publishedAt: dto.isPublished ? (current?.publishedAt ?? new Date()) : null,
    };
    if (current) await db.salesPage.update({ where: { id: current.id }, data });
    else await db.salesPage.create({ data: data as never });
    return this.get(tenantId);
  }

  testimonials(tenantId: string) {
    return this.prisma.tenant(tenantId).testimonial.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async setTestimonialStatus(
    tenantId: string,
    id: string,
    status: 'APPROVED' | 'HIDDEN' | 'PENDING',
  ) {
    const db = this.prisma.tenant(tenantId);
    const t = await db.testimonial.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw notFound('Depoimento não encontrado.');
    return db.testimonial.update({
      where: { id },
      data: { status, approvedAt: status === 'APPROVED' ? new Date() : null },
    });
  }

  async submitTestimonial(t: TenantAccess, dto: { text: string; rating?: number | undefined }) {
    const linkId = requireStudent(t);
    const db = this.prisma.tenant(t.tenantId);
    const link = await db.studentLink.findFirstOrThrow({ where: { id: linkId } });
    const first = link.displayName.split(' ')[0] ?? link.displayName;
    const created = await db.testimonial.create({
      data: {
        studentLinkId: linkId,
        authorName: first,
        text: dto.text,
        rating: dto.rating ?? null,
      } as never,
    });
    await this.events.publish('testimonial.submitted', {
      tenantId: t.tenantId,
      payload: { studentLinkId: linkId, studentName: link.displayName },
    });
    return created;
  }

  async results(tenantId: string) {
    return this.prisma.tenant(tenantId).salesPageResult.findMany({
      where: { deletedAt: null },
      include: { studentLink: { select: { displayName: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Pede ao aluno autorização para usar o antes/depois na página (LGPD). */
  async requestResult(t: TenantAccess, dto: z.infer<typeof ResultRequestSchema>) {
    await assertStudentInScope(this.prisma, t, dto.studentLinkId);
    const db = this.prisma.tenant(t.tenantId);
    const photos = await db.progressPhoto.findMany({
      where: {
        id: { in: [dto.beforePhotoId, dto.afterPhotoId] },
        studentLinkId: dto.studentLinkId,
        deletedAt: null,
      },
    });
    if (photos.length !== 2) throw badRequest('Escolha duas fotos do aluno.');
    const r = await db.salesPageResult.create({
      data: { ...dto, caption: dto.caption ?? null } as never,
    });
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: t.tenantId },
      select: { name: true },
    });
    await this.events.publish('result.consent_requested', {
      tenantId: t.tenantId,
      payload: { studentLinkId: dto.studentLinkId, resultId: r.id, tenantName: tenant.name },
    });
    return r;
  }

  async deleteResult(tenantId: string, id: string) {
    const db = this.prisma.tenant(tenantId);
    const r = await db.salesPageResult.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw notFound('Resultado não encontrado.');
    await db.salesPageResult.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  async myResultRequests(t: TenantAccess) {
    const linkId = requireStudent(t);
    const items = await this.prisma.tenant(t.tenantId).salesPageResult.findMany({
      where: { studentLinkId: linkId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(items.map(async (r) => ({ ...r, ...(await this.resultUrls(r)) })));
  }

  async answerResult(t: TenantAccess, id: string, granted: boolean) {
    const linkId = requireStudent(t);
    const db = this.prisma.tenant(t.tenantId);
    const r = await db.salesPageResult.findFirst({
      where: { id, studentLinkId: linkId, deletedAt: null },
    });
    if (!r) throw notFound('Pedido não encontrado.');
    // O aluno pode revogar a qualquer momento.
    const status = granted ? 'GRANTED' : r.consentStatus === 'GRANTED' ? 'REVOKED' : 'DENIED';
    return db.salesPageResult.update({
      where: { id },
      data: { consentStatus: status, consentAt: new Date() },
    });
  }

  private async resultUrls(r: { beforePhotoId: string; afterPhotoId: string }) {
    const photos = await this.prisma.system.progressPhoto.findMany({
      where: { id: { in: [r.beforePhotoId, r.afterPhotoId] } },
    });
    const media = await this.prisma.system.media.findMany({
      where: { id: { in: photos.map((p) => p.mediaId) } },
    });
    const url = async (photoId: string) => {
      const p = photos.find((x) => x.id === photoId);
      const m = p && media.find((x) => x.id === p.mediaId);
      return m ? signedMediaUrl(this.storage, m) : null;
    };
    return { beforeUrl: await url(r.beforePhotoId), afterUrl: await url(r.afterPhotoId) };
  }

  // ─── Página pública ────────────────────────────────────────────────────────

  private async publishedTenant(slug: string) {
    const tenant = await this.prisma.system.tenant.findUnique({
      where: { slug },
      include: { salesPage: true, brand: true },
    });
    if (!tenant || tenant.deletedAt || tenant.status !== 'ACTIVE' || !tenant.salesPage?.isPublished)
      throw notFound('Página não encontrada.');
    // Plano sem a feature: a página sai do ar (dados preservados).
    if (!(await this.entitlements.hasFeature(tenant.id, 'brand.sales_page')))
      throw notFound('Página não encontrada.');
    return tenant;
  }

  async publicPage(slug: string) {
    const tenant = await this.publishedTenant(slug);
    const page = tenant.salesPage!;
    const db = this.prisma.system;
    const [plans, testimonials, results, billing] = await Promise.all([
      db.consultingPlan.findMany({
        where: { tenantId: tenant.id, isActive: true, isPublic: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
      }),
      db.testimonial.findMany({
        where: { tenantId: tenant.id, status: 'APPROVED', deletedAt: null },
        orderBy: { approvedAt: 'desc' },
        take: 12,
      }),
      db.salesPageResult.findMany({
        where: { tenantId: tenant.id, consentStatus: 'GRANTED', deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        take: 12,
      }),
      this.entitlements.hasFeature(tenant.id, 'finance.student_billing'),
    ]);
    const account = await db.paymentAccount.findUnique({ where: { tenantId: tenant.id } });
    const mediaPath = (id: string) => `${this.env.APP_API_URL}/v1/public/pages/${slug}/media/${id}`;
    return {
      slug,
      name: tenant.name,
      cref: tenant.cref ? `${tenant.cref}${tenant.crefState ? `-${tenant.crefState}` : ''}` : null,
      headline: page.headline,
      bio: page.bio,
      photoUrl: page.photoMediaId ? mediaPath(page.photoMediaId) : null,
      logoUrl: tenant.brand?.logoMediaId ? mediaPath(tenant.brand.logoMediaId) : null,
      specialties: page.specialties,
      faq: page.faq,
      socialLinks: page.socialLinks,
      seoTitle: page.seoTitle ?? `${tenant.name} | Consultoria de treino`,
      seoDescription: page.seoDescription ?? page.headline ?? page.bio?.slice(0, 155) ?? null,
      checkoutEnabled:
        billing && !!account?.apiKeyEncrypted && account.status !== 'REJECTED' && !!this.provider,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        cycle: p.cycle,
        paymentMode: p.paymentMode,
        maxInstallments: p.maxInstallments,
        methods: p.methods,
        benefits: p.benefits,
      })),
      testimonials: testimonials.map((t) => ({
        id: t.id,
        authorName: t.authorName,
        text: t.text,
        rating: t.rating,
      })),
      results: await Promise.all(
        results.map(async (r) => {
          const photos = await db.progressPhoto.findMany({
            where: { id: { in: [r.beforePhotoId, r.afterPhotoId] } },
          });
          const byId = (id: string) => photos.find((p) => p.id === id)?.mediaId;
          return {
            id: r.id,
            caption: r.caption,
            beforeUrl: byId(r.beforePhotoId) ? mediaPath(byId(r.beforePhotoId)!) : null,
            afterUrl: byId(r.afterPhotoId) ? mediaPath(byId(r.afterPhotoId)!) : null,
          };
        }),
      ),
    };
  }

  /** Mídia da página pública: só foto, logo e resultados autorizados; redireciona para URL assinada. */
  async publicMedia(slug: string, mediaId: string) {
    const tenant = await this.publishedTenant(slug);
    const db = this.prisma.system;
    let allowed =
      tenant.salesPage!.photoMediaId === mediaId || tenant.brand?.logoMediaId === mediaId;
    if (!allowed) {
      const photo = await db.progressPhoto.findFirst({
        where: { tenantId: tenant.id, mediaId, deletedAt: null },
      });
      if (photo) {
        allowed = !!(await db.salesPageResult.findFirst({
          where: {
            tenantId: tenant.id,
            consentStatus: 'GRANTED',
            deletedAt: null,
            OR: [{ beforePhotoId: photo.id }, { afterPhotoId: photo.id }],
          },
        }));
      }
    }
    const m = allowed
      ? await db.media.findFirst({
          where: { id: mediaId, tenantId: tenant.id, status: 'READY', deletedAt: null },
        })
      : null;
    if (!m) throw notFound('Imagem não encontrada.');
    return signedMediaUrl(this.storage, m);
  }

  async checkout(slug: string, dto: PublicCheckoutInput, meta: RequestMeta) {
    if (!this.provider) throw paymentNotConfigured();
    const gateway = this.provider;
    const tenant = await this.publishedTenant(slug);
    if (!(await this.entitlements.hasFeature(tenant.id, 'finance.student_billing')))
      throw badRequest('Este personal não está recebendo pagamentos online.');
    const db = this.prisma.system;
    const plan = await db.consultingPlan.findFirst({
      where: {
        id: dto.consultingPlanId,
        tenantId: tenant.id,
        isActive: true,
        isPublic: true,
        deletedAt: null,
      },
    });
    if (!plan) throw notFound('Plano não encontrado.');
    if (!plan.methods.includes(dto.method))
      throw badRequest('Forma de pagamento indisponível neste plano.');
    const installments =
      plan.paymentMode === 'INSTALLMENTS' && dto.method === 'CREDIT_CARD' ? dto.installments : 1;
    if (installments > plan.maxInstallments)
      throw badRequest(`Até ${plan.maxInstallments}x neste plano.`);
    const apiKey = await tenantApiKey(db, tenant.id, this.env.APP_ENCRYPTION_KEY);
    if (!apiKey) throw badRequest('Este personal não está recebendo pagamentos online.');
    // Sem vaga no plano do personal: não vende (o dinheiro não pode virar aluno arquivado).
    const existingUser = await db.user.findUnique({ where: { email: dto.email } });
    const existingLink = existingUser
      ? await db.studentLink.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: existingUser.id } },
        })
      : null;
    if (!existingLink || existingLink.status === 'ARCHIVED') {
      await this.entitlements.assertLimit(tenant.id, 'students.max').catch(() => {
        throw conflict('Este personal não está aceitando novos alunos no momento.');
      });
    }
    const active = existingLink
      ? await db.studentSubscription.findFirst({
          where: {
            studentLinkId: existingLink.id,
            consultingPlanId: plan.id,
            status: { in: ['ACTIVE', 'OVERDUE'] },
          },
        })
      : null;
    if (active) throw conflict('Você já tem este plano ativo. Fale com seu personal.');

    const ctx = { apiKey, ...(meta.ip ? { remoteIp: meta.ip } : {}) };
    const now = new Date();
    const due = localDate(
      new Date(now.getTime() + (dto.method === 'BOLETO' ? 3 * DAY : 0)),
      tenant.timezone,
    );
    const bps = await platformFeeBpsOf(db, tenant.id);
    try {
      const customer = await gateway.createCustomer(
        {
          name: dto.name,
          email: dto.email,
          cpfCnpj: dto.cpfCnpj,
          phone: dto.phone,
          externalReference: `buyer:${dto.email}`,
        },
        ctx,
      );
      const chk = await db.checkout.create({
        data: {
          tenantId: tenant.id,
          consultingPlanId: plan.id,
          buyerName: dto.name,
          buyerEmail: dto.email,
          buyerPhone: dto.phone,
          buyerDocument: dto.cpfCnpj,
          method: dto.method,
          installments,
          amountCents: plan.priceCents,
          gatewayCustomerId: customer.id,
          termsVersion: this.env.TERMS_VERSION,
          ip: meta.ip,
          expiresAt: new Date(now.getTime() + (dto.method === 'BOLETO' ? 5 : 1) * DAY),
        },
      });
      const token =
        dto.method === 'CREDIT_CARD'
          ? (
              await gateway.tokenizeCard(
                { customerId: customer.id, card: dto.card!, holder: dto.cardHolder! },
                ctx,
              )
            ).token
          : undefined;
      const charge = await gateway.createCharge(
        {
          customerId: customer.id,
          method: dto.method,
          amountCents: plan.priceCents,
          dueDate: due,
          description: `${plan.name} – ${tenant.name}`,
          externalReference: `chk:${chk.id}`,
          installments: installments > 1 ? installments : undefined,
          cardToken: token,
          split: platformSplit(this.env.ASAAS_PLATFORM_WALLET_ID, bps),
        },
        ctx,
      );
      const pix =
        dto.method === 'PIX' ? await gateway.getPix(charge.id, ctx).catch(() => null) : null;
      await db.checkout.update({
        where: { id: chk.id },
        data: {
          gatewayPaymentId: charge.id,
          gatewayInstallmentId: charge.installmentId,
          invoiceUrl: charge.invoiceUrl,
          boletoUrl: charge.boletoUrl,
          pixQrCode: pix?.qrCode ?? null,
          pixCopyPaste: pix?.copyPaste ?? null,
        },
      });
      if (charge.status === 'CONFIRMED' || charge.status === 'RECEIVED')
        await completeCheckout(this.billing, chk.id, charge);
      return this.checkoutStatus(chk.id);
    } catch (err) {
      if (err instanceof PaymentProviderError)
        throw paymentFailed(err.message || 'Pagamento não aprovado.', { gateway: err.details });
      throw err;
    }
  }

  async checkoutStatus(id: string) {
    const c = await this.prisma.system.checkout.findUnique({
      where: { id },
      include: {
        consultingPlan: { select: { name: true } },
        tenant: { select: { name: true, slug: true } },
      },
    });
    if (!c) throw notFound('Compra não encontrada.');
    return {
      id: c.id,
      status: c.status,
      method: c.method,
      amountCents: c.amountCents,
      installments: c.installments,
      planName: c.consultingPlan.name,
      tenantName: c.tenant.name,
      pix: c.pixCopyPaste ? { copyPaste: c.pixCopyPaste, qrCode: c.pixQrCode } : null,
      boletoUrl: c.boletoUrl,
      invoiceUrl: c.invoiceUrl,
      failureReason: c.failureReason,
      /** Depois do pagamento o convite chega por e-mail; quem já tem conta só entra. */
      next:
        c.status === 'PAID'
          ? `${this.env.APP_WEB_URL}/entrar?email=${encodeURIComponent(c.buyerEmail)}`
          : null,
    };
  }
}

@ApiTags('sales-page')
@Controller('sales-page')
export class SalesPageController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @Can('read', 'brand')
  @RequireFeature('brand.sales_page')
  get(@CurrentTenant() t: TenantAccess) {
    return this.sales.get(t.tenantId);
  }

  @Put()
  @Can('manage', 'brand')
  @RequireFeature('brand.sales_page')
  save(@CurrentTenant() t: TenantAccess, @Body() dto: PageDto) {
    return this.sales.save(t.tenantId, dto);
  }

  @Get('testimonials')
  @Can('read', 'brand')
  @RequireFeature('brand.sales_page')
  testimonials(@CurrentTenant() t: TenantAccess) {
    return this.sales.testimonials(t.tenantId);
  }

  @Patch('testimonials/:id')
  @Can('manage', 'brand')
  @RequireFeature('brand.sales_page')
  setTestimonial(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestimonialStatusDto,
  ) {
    return this.sales.setTestimonialStatus(t.tenantId, id, dto.status);
  }

  @Get('results')
  @Can('read', 'brand')
  @RequireFeature('brand.sales_page')
  results(@CurrentTenant() t: TenantAccess) {
    return this.sales.results(t.tenantId);
  }

  @Post('results')
  @Can('manage', 'brand')
  @RequireFeature('brand.sales_page')
  requestResult(@CurrentTenant() t: TenantAccess, @Body() dto: ResultDto) {
    return this.sales.requestResult(t, dto);
  }

  @Delete('results/:id')
  @Can('manage', 'brand')
  @RequireFeature('brand.sales_page')
  deleteResult(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.deleteResult(t.tenantId, id);
  }
}

/** Aluno: depoimento e autorização de uso do antes/depois. */
@ApiTags('sales-page')
@Controller('me')
@Roles('ALUNO')
export class MySalesController {
  constructor(private readonly sales: SalesService) {}

  @Post('testimonials')
  @TenantScoped()
  testimonial(@CurrentTenant() t: TenantAccess, @Body() dto: TestimonialDto) {
    return this.sales.submitTestimonial(t, dto);
  }

  @Get('result-requests')
  @TenantScoped()
  requests(@CurrentTenant() t: TenantAccess) {
    return this.sales.myResultRequests(t);
  }

  @Post('result-requests/:id')
  @HttpCode(200)
  @TenantScoped()
  answer(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConsentDto,
  ) {
    return this.sales.answerResult(t, id, dto.granted);
  }
}

@ApiTags('public')
@Controller('public')
export class PublicSalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('pages/:slug')
  @Public()
  page(@Param('slug') slug: string) {
    return this.sales.publicPage(slug);
  }

  @Get('pages/:slug/media/:mediaId')
  @Public()
  async media(
    @Param('slug') slug: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() res: Response,
  ) {
    const url = await this.sales.publicMedia(slug, mediaId);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.redirect(302, url);
  }

  @Post('pages/:slug/checkout')
  @Public()
  checkout(@Param('slug') slug: string, @Body() dto: CheckoutDto, @Meta() meta: RequestMeta) {
    return this.sales.checkout(slug, dto, meta);
  }

  @Get('checkouts/:id')
  @Public()
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.checkoutStatus(id);
  }
}

class LogoDto extends createZodDto(z.object({ mediaId: z.uuid().nullable() })) {}

/** Logo do personal (PDFs de treino e avaliação e página de vendas). */
@ApiTags('sales-page')
@Controller('brand')
export class BrandController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('logo')
  @Can('read', 'brand')
  async get(@CurrentTenant() t: TenantAccess) {
    const b = await this.prisma.tenant(t.tenantId).tenantBrand.findFirst();
    return { mediaId: b?.logoMediaId ?? null };
  }

  @Put('logo')
  @Can('manage', 'brand')
  @RequireFeature('assessment.pdf_branding')
  async set(@CurrentTenant() t: TenantAccess, @Body() dto: LogoDto) {
    if (dto.mediaId) {
      const m = await this.prisma.system.media.findFirst({
        where: { id: dto.mediaId, tenantId: t.tenantId, purpose: 'brand_logo', deletedAt: null },
      });
      if (!m) throw badRequest('Envie a logo antes (upload brand_logo).');
    }
    const db = this.prisma.tenant(t.tenantId);
    const b = await db.tenantBrand.findFirst();
    if (b) await db.tenantBrand.update({ where: { id: b.id }, data: { logoMediaId: dto.mediaId } });
    else await db.tenantBrand.create({ data: { logoMediaId: dto.mediaId } as never });
    return { mediaId: dto.mediaId };
  }
}
