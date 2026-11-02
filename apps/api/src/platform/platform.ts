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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AcademyContentInputSchema,
  AcademyProgressSchema,
  AdminTicketUpdateSchema,
  CreateTicketSchema,
  PlatformBroadcastSchema,
  SUPPORT_SLA_HOURS,
  supportPriorityFor,
  TicketReplySchema,
  type PlanCode,
  type PlatformBroadcastInput,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import {
  segmentWhere,
  sendDuePlatformBroadcasts,
  type EventPublisher,
  type StorageProvider,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, Roles, TenantScoped } from '../access/decorators';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { signedMediaUrl } from '../common/media';
import {
  CurrentAdmin,
  CurrentTenant,
  CurrentUser,
  type AdminPrincipal,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { page } from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class AcademyInputDto extends createZodDto(AcademyContentInputSchema) {}
class AcademyProgressDto extends createZodDto(AcademyProgressSchema) {}
class AcademyQueryDto extends createZodDto(
  z.object({ type: z.enum(['COURSE', 'EBOOK', 'POST']).optional() }),
) {}
class BroadcastDto extends createZodDto(PlatformBroadcastSchema) {}
class TicketDto extends createZodDto(CreateTicketSchema) {}
class ReplyDto extends createZodDto(TicketReplySchema) {}
class AdminTicketDto extends createZodDto(AdminTicketUpdateSchema) {}
class TicketQueryDto extends createZodDto(
  z.object({
    status: z.enum(['OPEN', 'WAITING_USER', 'RESOLVED', 'CLOSED']).optional(),
    breached: z.coerce.boolean().optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }),
) {}

const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, PRO: 1, PRO_PLUS: 2 };
const HOUR = 3_600_000;

// ─── Academy ────────────────────────────────────────────────────────────────

@Injectable()
export class AcademyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  private async plan(tenantId: string): Promise<PlanCode> {
    return (await this.entitlements.resolve(tenantId)).plan.code;
  }

  private canAccess(plan: PlanCode, required: PlanCode | null) {
    return !required || PLAN_RANK[plan] >= PLAN_RANK[required];
  }

  private async url(mediaId: string | null) {
    if (!mediaId) return null;
    const m = await this.prisma.system.media.findFirst({
      where: { id: mediaId, status: 'READY', deletedAt: null },
    });
    return m ? signedMediaUrl(this.storage, m, 'original') : null;
  }

  /** Catálogo: conteúdos acima do plano aparecem com cadeado (sem corpo nem arquivos). */
  async list(t: TenantAccess, userId: string, type?: string) {
    const plan = await this.plan(t.tenantId);
    const rows = await this.prisma.system.academyContent.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(type ? { type: type as never } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      include: { lessons: { where: { deletedAt: null }, select: { id: true } } },
    });
    const progress = await this.prisma.system.academyProgress.findMany({
      where: {
        userId,
        completedAt: { not: null },
        lessonId: { in: rows.flatMap((r) => r.lessons.map((l) => l.id)) },
      },
      select: { lessonId: true },
    });
    const completed = new Set(progress.map((p) => p.lessonId));
    return Promise.all(
      rows.map(async (r) => {
        const locked = !this.canAccess(plan, r.requiredPlan);
        const done = r.lessons.filter((l) => completed.has(l.id)).length;
        return {
          id: r.id,
          slug: r.slug,
          type: r.type,
          title: r.title,
          summary: r.summary,
          tags: r.tags,
          requiredPlan: r.requiredPlan,
          locked,
          coverUrl: await this.url(r.coverMediaId),
          lessons: r.lessons.length,
          completedLessons: done,
          progress: r.lessons.length ? Math.round((done / r.lessons.length) * 100) : null,
          publishedAt: r.publishedAt,
        };
      }),
    );
  }

  async get(t: TenantAccess, userId: string, slug: string) {
    const c = await this.prisma.system.academyContent.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
      include: {
        lessons: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!c) throw notFound('Conteúdo não encontrado.');
    const plan = await this.plan(t.tenantId);
    if (!this.canAccess(plan, c.requiredPlan)) {
      throw forbidden(
        `Conteúdo exclusivo do plano ${c.requiredPlan === 'PRO_PLUS' ? 'Pro Plus' : 'Pro'}.`,
      );
    }
    const progress = await this.prisma.system.academyProgress.findMany({
      where: { userId, lessonId: { in: c.lessons.map((l) => l.id) } },
    });
    const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
    return {
      id: c.id,
      slug: c.slug,
      type: c.type,
      title: c.title,
      summary: c.summary,
      body: c.body,
      tags: c.tags,
      coverUrl: await this.url(c.coverMediaId),
      fileUrl: await this.url(c.fileMediaId),
      lessons: await Promise.all(
        c.lessons.map(async (l) => ({
          id: l.id,
          title: l.title,
          body: l.body,
          durationSeconds: l.durationSeconds,
          videoUrl: await this.url(l.videoMediaId),
          completed: !!byLesson.get(l.id)?.completedAt,
          positionSec: byLesson.get(l.id)?.positionSec ?? 0,
        })),
      ),
    };
  }

  async progress(t: TenantAccess, userId: string, lessonId: string, dto: AcademyProgressDto) {
    const lesson = await this.prisma.system.academyLesson.findFirst({
      where: { id: lessonId, deletedAt: null, content: { status: 'PUBLISHED', deletedAt: null } },
      include: { content: { select: { requiredPlan: true } } },
    });
    if (!lesson) throw notFound('Aula não encontrada.');
    if (!this.canAccess(await this.plan(t.tenantId), lesson.content.requiredPlan))
      throw forbidden();
    return this.prisma.system.academyProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        positionSec: dto.positionSec,
        completedAt: dto.completed ? new Date() : null,
      },
      update: { positionSec: dto.positionSec, completedAt: dto.completed ? new Date() : null },
      select: { lessonId: true, completedAt: true, positionSec: true },
    });
  }

  // Admin

  adminList() {
    return this.prisma.system.academyContent.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { lessons: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  async save(admin: AdminPrincipal, dto: AcademyInputDto, id?: string) {
    const db = this.prisma.system;
    const dup = await db.academyContent.findFirst({
      where: { slug: dto.slug, ...(id ? { id: { not: id } } : {}) },
    });
    if (dup) throw conflict('Já existe um conteúdo com este endereço (slug).');
    const data = {
      type: dto.type,
      slug: dto.slug,
      title: dto.title,
      summary: dto.summary ?? null,
      body: dto.body ?? null,
      coverMediaId: dto.coverMediaId ?? null,
      fileMediaId: dto.fileMediaId ?? null,
      requiredPlan: dto.requiredPlan ?? null,
      tags: dto.tags,
      status: dto.status,
    };
    return db.$transaction(async (tx) => {
      const current = id
        ? await tx.academyContent.findFirst({ where: { id, deletedAt: null } })
        : null;
      if (id && !current) throw notFound('Conteúdo não encontrado.');
      const c = current
        ? await tx.academyContent.update({
            where: { id: current.id },
            data: {
              ...data,
              publishedAt:
                dto.status === 'PUBLISHED'
                  ? (current.publishedAt ?? new Date())
                  : current.publishedAt,
            },
          })
        : await tx.academyContent.create({
            data: {
              ...data,
              createdByAdminId: admin.adminId,
              publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
            },
          });
      const keep = dto.lessons.map((l) => l.id).filter((v): v is string => !!v);
      await tx.academyLesson.updateMany({
        where: { contentId: c.id, deletedAt: null, id: { notIn: keep } },
        data: { deletedAt: new Date() },
      });
      for (const [i, l] of dto.lessons.entries()) {
        const fields = {
          title: l.title,
          body: l.body ?? null,
          videoMediaId: l.videoMediaId ?? null,
          durationSeconds: l.durationSeconds ?? null,
          sortOrder: i,
        };
        if (l.id)
          await tx.academyLesson.updateMany({ where: { id: l.id, contentId: c.id }, data: fields });
        else await tx.academyLesson.create({ data: { ...fields, contentId: c.id } });
      }
      return tx.academyContent.findUniqueOrThrow({
        where: { id: c.id },
        include: { lessons: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async remove(id: string) {
    const r = await this.prisma.system.academyContent.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
    if (!r.count) throw notFound('Conteúdo não encontrado.');
    return { ok: true };
  }
}

@ApiTags('academy')
@Controller('academy')
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get()
  @Can('read', 'academy')
  list(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Query() q: AcademyQueryDto,
  ) {
    return this.academy.list(t, u.userId, q.type);
  }

  @Get(':slug')
  @Can('read', 'academy')
  get(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('slug') slug: string,
  ) {
    return this.academy.get(t, u.userId, slug);
  }

  @Put('lessons/:lessonId/progress')
  @Can('read', 'academy')
  progress(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: AcademyProgressDto,
  ) {
    return this.academy.progress(t, u.userId, lessonId, dto);
  }
}

@ApiTags('admin')
@Controller('admin/academy')
export class AdminAcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get()
  @Can('read', 'platform.content')
  list() {
    return this.academy.adminList();
  }

  @Post()
  @Can('manage', 'platform.content')
  create(@CurrentAdmin() a: AdminPrincipal, @Body() dto: AcademyInputDto) {
    return this.academy.save(a, dto);
  }

  @Put(':id')
  @Can('manage', 'platform.content')
  update(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcademyInputDto,
  ) {
    return this.academy.save(a, dto, id);
  }

  @Delete(':id')
  @Can('manage', 'platform.content')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.academy.remove(id);
  }
}

// ─── Comunicados da plataforma ──────────────────────────────────────────────

@Injectable()
export class PlatformBroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  async list() {
    const rows = await this.prisma.system.platformBroadcast.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const stats = await this.prisma.system.platformBroadcastRecipient.groupBy({
      by: ['broadcastId'],
      where: { broadcastId: { in: rows.map((r) => r.id) } },
      _count: { deliveredAt: true, openedAt: true, _all: true },
    });
    const by = new Map(stats.map((s) => [s.broadcastId, s._count]));
    return rows.map((r) => {
      const s = by.get(r.id);
      const delivered = s?.deliveredAt ?? 0;
      const opened = s?.openedAt ?? 0;
      return {
        ...r,
        delivered,
        opened,
        openRate: delivered ? Math.round((opened / delivered) * 1000) / 10 : null,
      };
    });
  }

  /** Quantos personais o segmento alcança (prévia antes de enviar). */
  async preview(segment: PlatformBroadcastInput['segment']) {
    return { recipients: await this.prisma.system.tenant.count({ where: segmentWhere(segment) }) };
  }

  async create(admin: AdminPrincipal, dto: BroadcastDto) {
    return this.prisma.system.platformBroadcast.create({
      data: {
        title: dto.title,
        body: dto.body,
        url: dto.url ?? null,
        channels: dto.channels,
        segment: dto.segment,
        status: 'DRAFT',
        createdByAdminId: admin.adminId,
      },
    });
  }

  /** Agenda (ou envia já): o worker processa; com "now" processa na hora. */
  async send(id: string, scheduledAt?: string | null) {
    const b = await this.prisma.system.platformBroadcast.findFirst({
      where: { id, deletedAt: null },
    });
    if (!b) throw notFound('Comunicado não encontrado.');
    if (b.status !== 'DRAFT' && b.status !== 'SCHEDULED')
      throw badRequest('Este comunicado já foi enviado.');
    const at = scheduledAt ? new Date(scheduledAt) : new Date();
    await this.prisma.system.platformBroadcast.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt: at },
    });
    if (at.getTime() <= Date.now())
      await sendDuePlatformBroadcasts(this.prisma.system, this.events);
    return this.prisma.system.platformBroadcast.findUniqueOrThrow({ where: { id } });
  }

  async cancel(id: string) {
    const r = await this.prisma.system.platformBroadcast.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: { status: 'CANCELED' },
    });
    if (!r.count) throw badRequest('Só comunicados não enviados podem ser cancelados.');
    return { ok: true };
  }

  /** Abertura: o personal leu a notificação in-app ou abriu o link. */
  async markOpened(userId: string, broadcastId: string) {
    await this.prisma.system.platformBroadcastRecipient.updateMany({
      where: { broadcastId, userId, openedAt: null },
      data: { openedAt: new Date() },
    });
    return { ok: true };
  }
}

class SendBroadcastDto extends createZodDto(
  z.object({ scheduledAt: z.iso.datetime({ offset: true }).nullable().optional() }),
) {}
class SegmentDto extends createZodDto(PlatformBroadcastSchema.shape.segment) {}

@ApiTags('admin')
@Controller('admin/broadcasts')
export class AdminBroadcastsController {
  constructor(private readonly svc: PlatformBroadcastsService) {}

  @Get()
  @Can('read', 'platform.content')
  list() {
    return this.svc.list();
  }

  @Post('preview')
  @HttpCode(200)
  @Can('read', 'platform.content')
  preview(@Body() dto: SegmentDto) {
    return this.svc.preview(dto);
  }

  @Post()
  @Can('manage', 'platform.content')
  create(@CurrentAdmin() a: AdminPrincipal, @Body() dto: BroadcastDto) {
    return this.svc.create(a, dto);
  }

  @Post(':id/send')
  @HttpCode(200)
  @Can('manage', 'platform.content')
  send(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendBroadcastDto) {
    return this.svc.send(id, dto.scheduledAt);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Can('manage', 'platform.content')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(id);
  }
}

@ApiTags('comunicados')
@Controller('platform-broadcasts')
export class PlatformBroadcastOpenController {
  constructor(private readonly svc: PlatformBroadcastsService) {}

  @Post(':id/opened')
  @HttpCode(200)
  opened(@CurrentUser() u: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markOpened(u.userId, id);
  }
}

// ─── Suporte ────────────────────────────────────────────────────────────────

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  async create(t: TenantAccess, user: UserPrincipal, dto: TicketDto) {
    const ent = await this.entitlements.resolve(t.tenantId);
    const plan = ent.plan.code;
    // Suporte prioritário (feature) usa o SLA do Pro Plus mesmo em override.
    const slaPlan: PlanCode = ent.features['support.priority'] === true ? 'PRO_PLUS' : plan;
    const sla = SUPPORT_SLA_HOURS[slaPlan];
    const now = Date.now();
    const db = this.prisma.system;
    const ticket = await db.supportTicket.create({
      data: {
        tenantId: t.tenantId,
        userId: user.userId,
        subject: dto.subject,
        category: dto.category,
        priority: supportPriorityFor(slaPlan, dto.category),
        planCode: plan,
        pageUrl: dto.pageUrl ?? null,
        firstResponseDueAt: new Date(now + sla.firstResponse * HOUR),
        resolutionDueAt: new Date(now + sla.resolution * HOUR),
        messages: { create: { tenantId: t.tenantId, authorUserId: user.userId, body: dto.body } },
      },
    });
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: t.tenantId } });
    await this.events.publish('support.ticket_created', {
      tenantId: t.tenantId,
      actorId: user.userId,
      payload: {
        ticketId: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        priority: ticket.priority,
        plan,
        tenantName: tenant.name,
        dueAt: ticket.firstResponseDueAt.toISOString(),
      },
    });
    return this.mine(t, ticket.id);
  }

  async list(t: TenantAccess) {
    return this.prisma.system.supportTicket.findMany({
      where: { tenantId: t.tenantId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        subject: true,
        category: true,
        status: true,
        priority: true,
        firstResponseDueAt: true,
        firstRespondedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async mine(t: TenantAccess, id: string) {
    const ticket = await this.prisma.system.supportTicket.findFirst({
      where: { id, tenantId: t.tenantId, deletedAt: null },
      include: {
        messages: {
          where: { internal: false, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            authorUserId: true,
            authorAdminId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!ticket) throw notFound('Chamado não encontrado.');
    return {
      ...ticket,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        body: m.body,
        fromSupport: !!m.authorAdminId,
        createdAt: m.createdAt,
      })),
    };
  }

  async reply(t: TenantAccess, user: UserPrincipal, id: string, dto: ReplyDto) {
    const ticket = await this.mine(t, id);
    if (ticket.status === 'CLOSED') throw badRequest('Chamado encerrado. Abra um novo.');
    await this.prisma.system.$transaction([
      this.prisma.system.supportMessage.create({
        data: { ticketId: id, tenantId: t.tenantId, authorUserId: user.userId, body: dto.body },
      }),
      this.prisma.system.supportTicket.update({
        where: { id },
        data: { status: 'OPEN', resolvedAt: null },
      }),
    ]);
    return this.mine(t, id);
  }

  // Admin

  async adminList(q: TicketQueryDto) {
    const where: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : { status: { in: ['OPEN', 'WAITING_USER'] } }),
      ...(q.breached ? { slaBreachedAt: { not: null } } : {}),
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
    };
    const rows = await this.prisma.system.supportTicket.findMany({
      where,
      // Fila: prioridade, depois o prazo da primeira resposta.
      orderBy: [{ priority: 'desc' }, { firstResponseDueAt: 'asc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const tenants = await this.prisma.system.tenant.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(tenants.map((t) => [t.id, t.name]));
    const now = Date.now();
    const { items, nextCursor } = page(rows, q.limit);
    return {
      items: items.map((r) => ({
        ...r,
        tenantName: names.get(r.tenantId) ?? null,
        slaDueAt: r.firstRespondedAt ? r.resolutionDueAt : r.firstResponseDueAt,
        slaLate:
          !!r.slaBreachedAt ||
          (r.firstRespondedAt ? r.resolutionDueAt : r.firstResponseDueAt).getTime() < now,
      })),
      nextCursor,
    };
  }

  async adminGet(id: string) {
    const t = await this.prisma.system.supportTicket.findFirst({
      where: { id, deletedAt: null },
      include: { messages: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });
    if (!t) throw notFound('Chamado não encontrado.');
    const [tenant, user] = await Promise.all([
      this.prisma.system.tenant.findUnique({
        where: { id: t.tenantId },
        select: { name: true, slug: true },
      }),
      this.prisma.system.user.findUnique({
        where: { id: t.userId },
        select: { name: true, email: true },
      }),
    ]);
    return { ...t, tenant, user };
  }

  async adminReply(admin: AdminPrincipal, id: string, dto: ReplyDto) {
    const t = await this.adminGet(id);
    const now = new Date();
    await this.prisma.system.$transaction([
      this.prisma.system.supportMessage.create({
        data: {
          ticketId: id,
          tenantId: t.tenantId,
          authorAdminId: admin.adminId,
          body: dto.body,
          internal: dto.internal,
        },
      }),
      ...(dto.internal
        ? []
        : [
            this.prisma.system.supportTicket.update({
              where: { id },
              data: {
                status: 'WAITING_USER',
                ...(t.firstRespondedAt ? {} : { firstRespondedAt: now }),
              },
            }),
          ]),
    ]);
    if (!dto.internal) {
      await this.events.publish('support.ticket_replied', {
        tenantId: t.tenantId,
        payload: { userId: t.userId, ticketId: id, number: t.number, subject: t.subject },
      });
    }
    return this.adminGet(id);
  }

  async adminUpdate(admin: AdminPrincipal, id: string, dto: AdminTicketDto) {
    const t = await this.adminGet(id);
    const updated = await this.prisma.system.supportTicket.update({
      where: { id },
      data: {
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.assignedAdminId !== undefined ? { assignedAdminId: dto.assignedAdminId } : {}),
        ...(dto.status
          ? {
              status: dto.status,
              resolvedAt:
                dto.status === 'RESOLVED' || dto.status === 'CLOSED'
                  ? (t.resolvedAt ?? new Date())
                  : null,
            }
          : {}),
      },
    });
    await this.audit.log(admin, null, {
      action: 'support.ticket_updated',
      resource: 'support_ticket',
      resourceId: id,
      tenantId: t.tenantId,
      metadata: { ...dto },
    });
    return updated;
  }
}

@ApiTags('suporte')
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  @Get()
  @TenantScoped()
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  list(@CurrentTenant() t: TenantAccess) {
    return this.svc.list(t);
  }

  @Post()
  @TenantScoped()
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  create(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: TicketDto,
  ) {
    return this.svc.create(t, u, dto);
  }

  @Get(':id')
  @TenantScoped()
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.mine(t, id);
  }

  @Post(':id/messages')
  @TenantScoped()
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  reply(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.svc.reply(t, u, id, { ...dto, internal: false });
  }
}

@ApiTags('admin')
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(private readonly svc: SupportService) {}

  @Get()
  @Can('read', 'platform.support')
  list(@Query() q: TicketQueryDto) {
    return this.svc.adminList(q);
  }

  @Get(':id')
  @Can('read', 'platform.support')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.adminGet(id);
  }

  @Post(':id/messages')
  @Can('manage', 'platform.support')
  reply(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.svc.adminReply(a, id, dto);
  }

  @Patch(':id')
  @Can('manage', 'platform.support')
  update(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminTicketDto,
  ) {
    return this.svc.adminUpdate(a, id, dto);
  }
}
