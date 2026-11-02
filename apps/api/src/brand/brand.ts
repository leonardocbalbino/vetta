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
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomDomainSchema, UpdateBrandSchema, type PublicBrand } from '@vetta/contracts';
import {
  checkCustomDomain,
  CustomDomainNotConfiguredError,
  type CustomDomainProvider,
  type EventPublisher,
  type StorageProvider,
} from '@vetta/server';
import { brandThemeCss, checkBrandColors } from '@vetta/tokens';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AllowBlocked, Can, Public, RequireFeature, TenantScoped } from '../access/decorators';
import {
  badRequest,
  conflict,
  integrationFailed,
  integrationNotConfigured,
  notFound,
} from '../common/errors';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { type ApiEnv, ENV } from '../config/env';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { CUSTOM_DOMAINS, EVENTS, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class UpdateBrandDto extends createZodDto(UpdateBrandSchema) {}
class ColorsDto extends createZodDto(
  UpdateBrandSchema.pick({ primaryColor: true, accentColor: true }),
) {}
class DomainDto extends createZodDto(CustomDomainSchema) {}
class PublicBrandQueryDto extends createZodDto(
  z
    .object({
      host: z.string().trim().toLowerCase().max(253).optional(),
      slug: z.string().trim().toLowerCase().max(80).optional(),
    })
    .refine((v) => v.host || v.slug, 'Informe host ou slug.'),
) {}

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(CUSTOM_DOMAINS) private readonly domains: CustomDomainProvider,
    @Inject(EVENTS) private readonly events: EventPublisher,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  private async brandRow(tenantId: string) {
    const db = this.prisma.tenant(tenantId);
    return (
      (await db.tenantBrand.findFirst()) ?? (await db.tenantBrand.create({ data: {} as never }))
    );
  }

  async settings(t: TenantAccess) {
    const [b, tenant, features] = await Promise.all([
      this.brandRow(t.tenantId),
      this.prisma.system.tenant.findUniqueOrThrow({
        where: { id: t.tenantId },
        select: { name: true, slug: true },
      }),
      this.entitlements.resolve(t.tenantId),
    ]);
    return {
      displayName: b.displayName,
      defaultName: tenant.name,
      slug: tenant.slug,
      logoMediaId: b.logoMediaId,
      primaryColor: b.primaryColor,
      accentColor: b.accentColor,
      emailFromName: b.emailFromName,
      contrast: checkBrandColors(b),
      whiteLabel: features.features['brand.white_label'] === true,
      customDomainEnabled: features.features['brand.custom_domain'] === true,
      domain: b.customDomain
        ? {
            domain: b.customDomain,
            status: b.customDomainStatus,
            error: b.customDomainError,
            checkedAt: b.customDomainCheckedAt,
            verifiedAt: b.customDomainVerifiedAt,
            dns: { type: 'CNAME', name: b.customDomain, value: this.domains.target },
          }
        : null,
      dnsTarget: this.domains.target,
    };
  }

  /** Salva a marca; cor sem contraste AA é recusada com a sugestão mais próxima. */
  async update(t: TenantAccess, dto: UpdateBrandDto) {
    const check = checkBrandColors(dto);
    if (!check.ok) {
      throw badRequest('Escolha cores com contraste suficiente (WCAG AA).', 'VALIDATION_ERROR', {
        contrast: check,
      });
    }
    if (dto.logoMediaId) {
      const m = await this.prisma.system.media.findFirst({
        where: {
          id: dto.logoMediaId,
          tenantId: t.tenantId,
          purpose: 'brand_logo',
          deletedAt: null,
        },
      });
      if (!m) throw badRequest('Envie a logo antes (upload brand_logo).');
    }
    const b = await this.brandRow(t.tenantId);
    await this.prisma.tenant(t.tenantId).tenantBrand.update({
      where: { id: b.id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.primaryColor !== undefined
          ? { primaryColor: dto.primaryColor?.toUpperCase() ?? null }
          : {}),
        ...(dto.accentColor !== undefined
          ? { accentColor: dto.accentColor?.toUpperCase() ?? null }
          : {}),
        ...(dto.emailFromName !== undefined ? { emailFromName: dto.emailFromName } : {}),
        ...(dto.logoMediaId !== undefined ? { logoMediaId: dto.logoMediaId } : {}),
      },
    });
    return this.settings(t);
  }

  /** Tema público do tenant: só com white label ativo; senão, tema Vetta (sem CSS). */
  async publicBrand(tenantId: string, apiUrl: string): Promise<PublicBrand> {
    const tenant = await this.prisma.system.tenant.findUnique({
      where: { id: tenantId },
      include: { brand: true },
    });
    if (!tenant || tenant.deletedAt) throw notFound('Marca não encontrada.');
    const whiteLabel = await this.entitlements.hasFeature(tenantId, 'brand.white_label');
    const b = tenant.brand;
    if (!whiteLabel || !b) {
      return {
        tenantId,
        slug: tenant.slug,
        displayName: tenant.name,
        logoUrl: null,
        primaryColor: null,
        accentColor: null,
        css: '',
        whiteLabel: false,
      };
    }
    const colors = checkBrandColors(b);
    const primaryColor = colors.primary?.ok ? b.primaryColor : null;
    const accentColor = colors.accent?.ok ? b.accentColor : null;
    return {
      tenantId,
      slug: tenant.slug,
      displayName: b.displayName ?? tenant.name,
      logoUrl: b.logoMediaId ? `${apiUrl}/v1/public/brand/${tenantId}/logo` : null,
      primaryColor,
      accentColor,
      css: brandThemeCss({ primaryColor, accentColor }),
      whiteLabel: true,
    };
  }

  /** Resolve o tenant por domínio próprio ativo ou slug. */
  async resolvePublic(q: { host?: string | undefined; slug?: string | undefined }) {
    const db = this.prisma.system;
    if (q.host) {
      const host = q.host.replace(/:\d+$/, '');
      const b = await db.tenantBrand.findUnique({ where: { customDomain: host } });
      if (
        !b ||
        b.customDomainStatus !== 'ACTIVE' ||
        !(await this.entitlements.hasFeature(b.tenantId, 'brand.custom_domain'))
      ) {
        throw notFound('Domínio não encontrado.');
      }
      return b.tenantId;
    }
    const t = await db.tenant.findUnique({ where: { slug: q.slug! } });
    if (!t || t.deletedAt || t.status !== 'ACTIVE') throw notFound('Marca não encontrada.');
    return t.id;
  }

  async logo(tenantId: string, res: Response) {
    if (!(await this.entitlements.hasFeature(tenantId, 'brand.white_label')))
      throw notFound('Logo não encontrada.');
    const b = await this.prisma.system.tenantBrand.findUnique({ where: { tenantId } });
    const m = b?.logoMediaId
      ? await this.prisma.system.media.findFirst({
          where: { id: b.logoMediaId, status: 'READY', deletedAt: null },
        })
      : null;
    if (!m) throw notFound('Logo não encontrada.');
    const url = await this.storage.presignGet(m.storageKey, 900);
    res.setHeader('cache-control', 'public, max-age=600');
    return res.redirect(302, url);
  }

  // ─── Domínio próprio ──────────────────────────────────────────────────────

  async setDomain(t: TenantAccess, domain: string) {
    const db = this.prisma.system;
    const taken = await db.tenantBrand.findFirst({
      where: { customDomain: domain, tenantId: { not: t.tenantId } },
    });
    if (taken) throw conflict('Este domínio já está em uso.');
    const b = await this.brandRow(t.tenantId);
    if (b.customDomain === domain && b.customDomainStatus === 'ACTIVE') return this.settings(t);
    if (b.customDomainProviderId)
      await this.domains.remove(b.customDomainProviderId).catch(() => undefined);
    let state;
    try {
      state = await this.domains.create(domain);
    } catch (e) {
      if (e instanceof CustomDomainNotConfiguredError)
        throw integrationNotConfigured('Domínio próprio ainda não está disponível neste ambiente.');
      throw integrationFailed('Não foi possível registrar o domínio. Tente de novo.');
    }
    await this.prisma.tenant(t.tenantId).tenantBrand.update({
      where: { id: b.id },
      data: {
        customDomain: domain,
        customDomainProviderId: state.id,
        customDomainStatus: state.status === 'active' ? 'ACTIVE' : 'VERIFYING',
        customDomainError: state.errors.join('; ') || null,
        customDomainVerifiedAt: state.status === 'active' ? new Date() : null,
        customDomainCheckedAt: new Date(),
      },
    });
    return this.settings(t);
  }

  async verifyDomain(t: TenantAccess) {
    const b = await this.brandRow(t.tenantId);
    if (!b.customDomain) throw badRequest('Cadastre um domínio primeiro.');
    if (b.customDomainStatus === 'FAILED') {
      // Nova tentativa: volta a verificar.
      await this.prisma.tenant(t.tenantId).tenantBrand.update({
        where: { id: b.id },
        data: { customDomainStatus: 'VERIFYING' },
      });
    }
    await checkCustomDomain(this.prisma.system, this.domains, this.events, t.tenantId);
    return this.settings(t);
  }

  async removeDomain(t: TenantAccess) {
    const b = await this.brandRow(t.tenantId);
    if (b.customDomainProviderId)
      await this.domains.remove(b.customDomainProviderId).catch(() => undefined);
    await this.prisma.tenant(t.tenantId).tenantBrand.update({
      where: { id: b.id },
      data: {
        customDomain: null,
        customDomainProviderId: null,
        customDomainStatus: null,
        customDomainError: null,
        customDomainVerifiedAt: null,
      },
    });
    return this.settings(t);
  }
}

@ApiTags('marca')
@Controller('brand')
export class WhiteLabelController {
  constructor(
    private readonly brand: BrandService,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  @Get('settings')
  @Can('read', 'brand')
  settings(@CurrentTenant() t: TenantAccess) {
    return this.brand.settings(t);
  }

  @Put('settings')
  @Can('manage', 'brand')
  @RequireFeature('brand.white_label')
  update(@CurrentTenant() t: TenantAccess, @Body() dto: UpdateBrandDto) {
    return this.brand.update(t, dto);
  }

  /** Valida cores sem salvar (prévia em tempo real no editor). */
  @Post('check-colors')
  @HttpCode(200)
  @Can('read', 'brand')
  check(@Body() dto: ColorsDto) {
    return checkBrandColors(dto);
  }

  /** Tema do vínculo ativo (aluno, assistente ou personal). */
  @Get('active')
  @TenantScoped()
  @AllowBlocked()
  active(@CurrentTenant() t: TenantAccess) {
    return this.brand.publicBrand(t.tenantId, this.env.APP_API_URL);
  }

  @Put('domain')
  @Can('manage', 'brand')
  @RequireFeature('brand.custom_domain')
  setDomain(@CurrentTenant() t: TenantAccess, @Body() dto: DomainDto) {
    return this.brand.setDomain(t, dto.domain);
  }

  @Post('domain/verify')
  @HttpCode(200)
  @Can('manage', 'brand')
  @RequireFeature('brand.custom_domain')
  verify(@CurrentTenant() t: TenantAccess) {
    return this.brand.verifyDomain(t);
  }

  @Delete('domain')
  @Can('manage', 'brand')
  removeDomain(@CurrentTenant() t: TenantAccess) {
    return this.brand.removeDomain(t);
  }
}

@ApiTags('public')
@Controller('public/brand')
export class PublicBrandController {
  constructor(
    private readonly brand: BrandService,
    @Inject(ENV) private readonly env: ApiEnv,
  ) {}

  /** Tema por domínio próprio (middleware do Next) ou slug (página de vendas). */
  @Public()
  @Get()
  async get(@Query() q: PublicBrandQueryDto) {
    const tenantId = await this.brand.resolvePublic(q);
    return this.brand.publicBrand(tenantId, this.env.APP_API_URL);
  }

  @Public()
  @Get(':tenantId/logo')
  logo(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Res() res: Response) {
    return this.brand.logo(tenantId, res);
  }
}
