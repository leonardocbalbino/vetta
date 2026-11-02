import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingCycle, FEATURES_BY_KEY, PlanCode, UNLIMITED } from '@vetta/contracts';
import { featureValueFromDb, featureValueToDb, type Prisma } from '@vetta/db';
import { EntitlementsCache, satisfies } from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, Public } from '../access/decorators';
import { AuditService } from '../audit/audit.service';
import { SessionsService } from '../auth/sessions.service';
import { badRequest, notFound } from '../common/errors';
import { CurrentAdmin, Meta, type AdminPrincipal, type RequestMeta } from '../common/request';
import { PrismaService } from '../infra/prisma.service';

class BlockDto extends createZodDto(z.object({ reason: z.string().trim().min(5).max(500) })) {}
class PlanDto extends createZodDto(
  z.object({
    name: z.string().trim().min(2).max(60),
    description: z.string().max(500).nullable().optional(),
    isPublic: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(100),
    prices: z.array(
      z.object({
        cycle: z.enum(BillingCycle),
        amountCents: z.number().int().min(0),
        isActive: z.boolean().default(true),
      }),
    ),
  }),
) {}
class ImpactQueryDto extends createZodDto(z.object({ feature: z.string(), value: z.string() })) {}
class AuditQueryDto extends createZodDto(
  z.object({
    q: z.string().max(100).optional(),
    action: z.string().max(80).optional(),
    tenantId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
) {}
class TenantsQueryDto extends createZodDto(
  z.object({
    q: z.string().max(100).optional(),
    plan: z.enum(PlanCode).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELED', 'TRIALING']).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
) {}

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: EntitlementsCache,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
  ) {}

  /** Dashboard: personais por plano, trials, conversão, alunos, treinos/dia e storage. */
  @Get('dashboard')
  @Can('read', 'platform.tenants')
  async dashboard() {
    const db = this.prisma.platform;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [subs, students, sessions, storage, tenants] = await Promise.all([
      db.tenantSubscription.findMany({
        select: { status: true, trialEndsAt: true, plan: { select: { code: true } } },
      }),
      db.studentLink.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      db.workoutSession.findMany({
        where: { finishedAt: { gte: since }, deletedAt: null },
        select: { finishedAt: true },
      }),
      db.tenantStorageUsage.aggregate({ _sum: { bytesUsed: true } }),
      db.tenant.count({ where: { deletedAt: null } }),
    ]);
    const byPlan: Record<string, number> = { FREE: 0, PRO: 0, PRO_PLUS: 0 };
    let trials = 0;
    let paid = 0;
    for (const s of subs) {
      if (s.status === 'TRIALING' && (!s.trialEndsAt || s.trialEndsAt > new Date())) trials++;
      else if (s.status !== 'CANCELED') {
        byPlan[s.plan.code] = (byPlan[s.plan.code] ?? 0) + 1;
        if (s.plan.code !== 'FREE') paid++;
      }
    }
    const perDay = new Map<string, number>();
    for (const s of sessions) {
      const k = s.finishedAt!.toISOString().slice(0, 10);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const endedTrials = subs.filter((s) => s.trialEndsAt && s.trialEndsAt <= new Date()).length;
    return {
      tenants,
      byPlan,
      activeTrials: trials,
      // Conversão: pagantes sobre (pagantes + trials encerrados sem pagar). Sem billing real ainda (Fase 2).
      trialConversion:
        endedTrials + paid ? Math.round((paid / Math.max(1, endedTrials)) * 1000) / 10 : 0,
      activeStudents: students,
      workoutsPerDay: [...perDay.entries()].sort().map(([date, count]) => ({ date, count })),
      storageBytes: Number(storage._sum.bytesUsed ?? 0),
    };
  }

  @Get('tenants/search')
  @Can('read', 'platform.tenants')
  async tenants(@Query() q: TenantsQueryDto) {
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { slug: { contains: q.q } },
              { owner: { email: { contains: q.q.toLowerCase() } } },
            ],
          }
        : {}),
      ...(q.plan ? { subscription: { plan: { code: q.plan } } } : {}),
      ...(q.status === 'TRIALING'
        ? { subscription: { status: 'TRIALING' } }
        : q.status
          ? { status: q.status }
          : {}),
    };
    const items = await this.prisma.platform.tenant.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        createdAt: true,
        blockedAt: true,
        owner: { select: { id: true, name: true, email: true, lastLoginAt: true } },
        subscription: {
          select: { status: true, trialEndsAt: true, plan: { select: { code: true } } },
        },
        _count: { select: { studentLinks: { where: { status: 'ACTIVE' } } } },
      },
    });
    const more = items.length > q.limit;
    return { items: items.slice(0, q.limit), nextCursor: more ? items[q.limit - 1]!.id : null };
  }

  @Get('tenants/:id')
  @Can('read', 'platform.tenants')
  async tenant(@Param('id', ParseUUIDPipe) id: string) {
    const db = this.prisma.platform;
    const t = await db.tenant.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true, lastLoginAt: true, createdAt: true },
        },
        subscription: { include: { plan: true } },
        storageUsage: true,
        featureOverrides: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        members: {
          where: { deletedAt: null },
          include: { user: { select: { name: true, email: true, lastLoginAt: true } } },
        },
      },
    });
    if (!t) throw notFound('Personal não encontrado.');
    const [students, programs, sessions30d, lastSessions] = await Promise.all([
      db.studentLink.groupBy({
        by: ['status'],
        where: { tenantId: id, deletedAt: null },
        _count: true,
      }),
      db.workoutProgram.count({ where: { tenantId: id, deletedAt: null } }),
      db.workoutSession.count({
        where: { tenantId: id, finishedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      }),
      db.session.findMany({
        where: { userId: t.ownerUserId },
        orderBy: { lastUsedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          deviceName: true,
          platform: true,
          ip: true,
          lastUsedAt: true,
          impersonatorAdminId: true,
        },
      }),
    ]);
    return {
      ...t,
      storageUsage: t.storageUsage
        ? {
            bytesUsed: Number(t.storageUsage.bytesUsed),
            bytesReserved: Number(t.storageUsage.bytesReserved),
          }
        : null,
      students: Object.fromEntries(students.map((s) => [s.status, s._count])),
      programs,
      sessions30d,
      recentAccesses: lastSessions,
    };
  }

  /** Bloqueia o tenant (equipe e alunos perdem acesso) e encerra as sessões do dono. */
  @Post('tenants/:id/block')
  @HttpCode(200)
  @Can('manage', 'platform.tenants')
  async block(
    @CurrentAdmin() a: AdminPrincipal,
    @Meta() meta: RequestMeta,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockDto,
  ) {
    const t = await this.prisma.platform.tenant.update({
      where: { id },
      data: { status: 'SUSPENDED', blockedAt: new Date(), blockedReason: dto.reason },
    });
    await this.sessions.revokeAllForUser(t.ownerUserId, 'tenant_blocked');
    await this.audit.log(a, meta, {
      action: 'tenant.block',
      resource: 'tenants',
      resourceId: id,
      tenantId: id,
      metadata: { reason: dto.reason },
    });
    return { ok: true as const };
  }

  @Post('tenants/:id/unblock')
  @HttpCode(200)
  @Can('manage', 'platform.tenants')
  async unblock(
    @CurrentAdmin() a: AdminPrincipal,
    @Meta() meta: RequestMeta,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.prisma.platform.tenant.update({
      where: { id },
      data: { status: 'ACTIVE', blockedAt: null, blockedReason: null },
    });
    await this.audit.log(a, meta, {
      action: 'tenant.unblock',
      resource: 'tenants',
      resourceId: id,
      tenantId: id,
    });
    return { ok: true as const };
  }

  /** Edita nome, visibilidade e preços do plano (o código é fixo: FREE, PRO, PRO_PLUS). */
  @Put('plans/:code')
  @Can('update', 'platform.plans')
  async updatePlan(
    @CurrentAdmin() a: AdminPrincipal,
    @Meta() meta: RequestMeta,
    @Param('code') code: string,
    @Body() dto: PlanDto,
  ) {
    if (!(PlanCode as readonly string[]).includes(code)) throw notFound('Plano não encontrado.');
    const plan = await this.prisma.platform.plan.update({
      where: { code: code as PlanCode },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        isPublic: dto.isPublic,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
    for (const p of dto.prices) {
      await this.prisma.platform.planPrice.upsert({
        where: { planId_cycle: { planId: plan.id, cycle: p.cycle } },
        create: {
          planId: plan.id,
          cycle: p.cycle,
          amountCents: p.amountCents,
          isActive: p.isActive,
        },
        update: { amountCents: p.amountCents, isActive: p.isActive },
      });
    }
    await this.cache.invalidateAll();
    await this.audit.log(a, meta, {
      action: 'plan.update',
      resource: 'plans',
      resourceId: plan.id,
      metadata: { ...dto },
    });
    return plan;
  }

  /** Prévia do impacto de mudar uma feature num plano: quantos tenants perdem/ganham e quem passa do limite. */
  @Get('plans/:code/impact')
  @Can('read', 'platform.plans')
  async impact(@Param('code') code: string, @Query() q: ImpactQueryDto) {
    const def = FEATURES_BY_KEY[q.feature];
    if (!def) throw badRequest('Feature desconhecida.');
    const newValue = def.type === 'BOOLEAN' ? q.value === 'true' : Number(q.value);
    const plan = await this.prisma.platform.plan.findUnique({
      where: { code: code as PlanCode },
      include: { features: { where: { featureKey: q.feature } } },
    });
    if (!plan) throw notFound('Plano não encontrado.');
    const current = plan.features[0]
      ? featureValueFromDb(def.type, plan.features[0].value)
      : def.defaultValue;
    const tenants = await this.prisma.platform.tenantSubscription.findMany({
      where: { planId: plan.id, status: { not: 'CANCELED' } },
      select: { tenantId: true, tenant: { select: { name: true } } },
    });
    const overridden = new Set(
      (
        await this.prisma.platform.tenantFeatureOverride.findMany({
          where: { featureKey: q.feature, deletedAt: null },
          select: { tenantId: true },
        })
      ).map((o) => o.tenantId),
    );
    const affected = tenants.filter((t) => !overridden.has(t.tenantId));
    let overLimit: { tenantId: string; name: string; used: number }[] = [];
    if (q.feature === 'students.max' && typeof newValue === 'number' && newValue !== UNLIMITED) {
      const counts = await this.prisma.platform.studentLink.groupBy({
        by: ['tenantId'],
        where: {
          tenantId: { in: affected.map((t) => t.tenantId) },
          deletedAt: null,
          status: { in: ['INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE'] },
        },
        _count: true,
      });
      overLimit = counts
        .filter((c) => c._count > newValue)
        .map((c) => ({
          tenantId: c.tenantId,
          name: affected.find((t) => t.tenantId === c.tenantId)!.tenant.name,
          used: c._count,
        }));
    }
    const losing = satisfies(current) && !satisfies(newValue);
    return {
      feature: q.feature,
      current,
      next: newValue,
      tenantsOnPlan: tenants.length,
      affectedTenants: affected.length,
      withOverride: tenants.length - affected.length,
      loses: losing ? affected.length : 0,
      overLimit,
      stored: featureValueToDb(newValue),
    };
  }

  /** Audit log pesquisável. */
  @Get('audit')
  @Can('read', 'platform.audit')
  async auditSearch(@Query() q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { resource: { contains: q.q } },
              { resourceId: q.q },
              { action: { contains: q.q } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.system.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const more = items.length > q.limit;
    return { items: items.slice(0, q.limit), nextCursor: more ? items[q.limit - 1]!.id : null };
  }
}

/** Documentos legais versionados (site e app). */
@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':kind')
  async current(@Param('kind') kind: string) {
    const k = kind.toUpperCase();
    if (k !== 'TERMS' && k !== 'PRIVACY') throw notFound('Documento não encontrado.');
    const doc = await this.prisma.system.legalDocument.findFirst({
      where: { kind: k, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
    });
    if (!doc) throw notFound('Documento não encontrado.');
    return doc;
  }
}
