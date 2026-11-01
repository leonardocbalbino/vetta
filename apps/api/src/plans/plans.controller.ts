import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FEATURES_BY_KEY, PlanCode } from '@vetta/contracts';
import { featureValueFromDb, featureValueToDb } from '@vetta/db';
import { EntitlementsCache } from '@vetta/server';
import { Can, Public } from '../access/decorators';
import { AuditService } from '../audit/audit.service';
import { CursorQueryDto, FeatureOverrideDto, UpdatePlanFeaturesDto } from '../common/dto';
import { badRequest, notFound } from '../common/errors';
import { CurrentAdmin, Meta, type AdminPrincipal, type RequestMeta } from '../common/request';
import { PrismaService } from '../infra/prisma.service';

async function listPlans(prisma: PrismaService, onlyPublic: boolean) {
  const plans = await prisma.system.plan.findMany({
    where: { isActive: true, ...(onlyPublic ? { isPublic: true } : {}) },
    orderBy: { sortOrder: 'asc' },
    include: { prices: { where: { isActive: true } }, features: { include: { feature: true } } },
  });
  return plans.map((p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    prices: p.prices.map((x) => ({
      cycle: x.cycle,
      amountCents: x.amountCents,
      currency: x.currency,
    })),
    features: Object.fromEntries(
      p.features.map((f) => [f.featureKey, featureValueFromDb(f.feature.type, f.value)]),
    ),
  }));
}

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly prisma: PrismaService) {}

  /** Planos públicos com preços e features (landing, tela de upgrade). */
  @Public()
  @Get()
  list() {
    return listPlans(this.prisma, true);
  }
}

@ApiTags('admin')
@Controller('admin')
export class AdminPlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: EntitlementsCache,
    private readonly audit: AuditService,
  ) {}

  @Get('plans')
  @Can('read', 'platform.plans')
  plans() {
    return listPlans(this.prisma, false);
  }

  /** Altera valores de features de um plano. Invalida o cache de todos os tenants. */
  @Patch('plans/:code/features')
  @Can('update', 'platform.plans')
  async updatePlanFeatures(
    @CurrentAdmin() a: AdminPrincipal,
    @Meta() meta: RequestMeta,
    @Param('code') code: string,
    @Body() dto: UpdatePlanFeaturesDto,
  ) {
    if (!(PlanCode as readonly string[]).includes(code)) throw notFound('Plano não encontrado.');
    const plan = await this.prisma.platform.plan.findUniqueOrThrow({
      where: { code: code as PlanCode },
    });
    for (const [key, value] of Object.entries(dto.values)) {
      const def = FEATURES_BY_KEY[key];
      if (!def) throw badRequest(`Feature desconhecida: ${key}`);
      if ((def.type === 'BOOLEAN') !== (typeof value === 'boolean'))
        throw badRequest(`Tipo inválido para ${key}`);
      await this.prisma.platform.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey: key } },
        create: { planId: plan.id, featureKey: key, value: featureValueToDb(value) },
        update: { value: featureValueToDb(value) },
      });
    }
    await this.cache.invalidateAll();
    await this.audit.log(a, meta, {
      action: 'plan.features.update',
      resource: 'plans',
      resourceId: plan.id,
      metadata: dto.values,
    });
    return (await listPlans(this.prisma, false)).find((p) => p.code === code);
  }

  @Get('tenants')
  @Can('read', 'platform.tenants')
  async tenants(@Query() q: CursorQueryDto) {
    const items = await this.prisma.platform.tenant.findMany({
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        createdAt: true,
        owner: { select: { id: true, name: true, email: true } },
        subscription: {
          select: { status: true, trialEndsAt: true, plan: { select: { code: true } } },
        },
        _count: { select: { studentLinks: true } },
      },
    });
    const more = items.length > q.limit;
    return { items: items.slice(0, q.limit), nextCursor: more ? items[q.limit - 1]!.id : null };
  }

  /** Override por tenant (com expiração e motivo): vale acima do plano. */
  @Put('tenants/:tenantId/overrides')
  @Can('manage', 'platform.features')
  async upsertOverride(
    @CurrentAdmin() a: AdminPrincipal,
    @Meta() meta: RequestMeta,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: FeatureOverrideDto,
  ) {
    const def = FEATURES_BY_KEY[dto.featureKey];
    if (!def) throw badRequest('Feature desconhecida.');
    if ((def.type === 'BOOLEAN') !== (typeof dto.value === 'boolean'))
      throw badRequest('Tipo de valor inválido.');
    await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const data = {
      value: featureValueToDb(dto.value),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      reason: dto.reason,
      createdByAdminId: a.adminId,
      deletedAt: null,
    };
    const o = await this.prisma.platform.tenantFeatureOverride.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey: dto.featureKey } },
      create: { tenantId, featureKey: dto.featureKey, ...data },
      update: data,
    });
    await this.cache.invalidateTenant(tenantId);
    await this.audit.log(a, meta, {
      action: 'feature_override.upsert',
      resource: 'tenant_feature_overrides',
      resourceId: o.id,
      tenantId,
      metadata: {
        featureKey: dto.featureKey,
        value: dto.value,
        expiresAt: dto.expiresAt ?? null,
        reason: dto.reason,
      },
    });
    return {
      id: o.id,
      featureKey: o.featureKey,
      value: dto.value,
      expiresAt: o.expiresAt?.toISOString() ?? null,
    };
  }

  @Delete('tenants/:tenantId/overrides/:featureKey')
  @Can('manage', 'platform.features')
  async deleteOverride(
    @CurrentAdmin() a: AdminPrincipal,
    @Meta() meta: RequestMeta,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('featureKey') featureKey: string,
  ) {
    await this.prisma.platform.tenantFeatureOverride.updateMany({
      where: { tenantId, featureKey, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await this.cache.invalidateTenant(tenantId);
    await this.audit.log(a, meta, {
      action: 'feature_override.delete',
      resource: 'tenant_feature_overrides',
      tenantId,
      metadata: { featureKey },
    });
    return { ok: true as const };
  }

  @Get('audit-logs')
  @Can('read', 'platform.audit')
  async auditLogs(@Query() q: CursorQueryDto) {
    const items = await this.prisma.system.auditLog.findMany({
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
    });
    const more = items.length > q.limit;
    return { items: items.slice(0, q.limit), nextCursor: more ? items[q.limit - 1]!.id : null };
  }
}
