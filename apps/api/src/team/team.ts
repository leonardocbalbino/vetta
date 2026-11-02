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
  Query,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import {
  AcceptTeamInviteSchema,
  ActivityQuerySchema,
  AssignStudentsSchema,
  deepLinks,
  InviteAssistantSchema,
  UpdateMemberSchema,
  type Action,
  type Resource,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import type { EventPublisher } from '@vetta/server';
import { verify } from 'argon2';
import { createZodDto } from 'nestjs-zod';
import { tap, type Observable } from 'rxjs';
import { AssertLimit, Can, META, Public } from '../access/decorators';
import { OneTimeTokensService } from '../auth/auth-tokens.service';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { badRequest, conflict, notFound, unauthorized } from '../common/errors';
import {
  CurrentTenant,
  CurrentUser,
  Meta,
  type AppRequest,
  type RequestMeta,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { page } from '../common/scope';
import { type ApiEnv, ENV } from '../config/env';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class InviteDto extends createZodDto(InviteAssistantSchema) {}
class UpdateMemberDto extends createZodDto(UpdateMemberSchema) {}
class AssignDto extends createZodDto(AssignStudentsSchema) {}
class ActivityQueryDto extends createZodDto(ActivityQuerySchema) {}
class AcceptDto extends createZodDto(AcceptTeamInviteSchema) {}

const INVITE_TTL = 7 * 86_400_000;

/** Ação registrada no log de alterações da equipe (recurso.ação). */
export const CHANGE_ACTION = (resource: string, action: string) => `change.${resource}.${action}`;

@Injectable()
export class TeamService {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    @Inject(EVENTS) private readonly events: EventPublisher,
    private readonly prisma: PrismaService,
    private readonly oneTime: OneTimeTokensService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(t: TenantAccess) {
    const db = this.prisma.tenant(t.tenantId);
    const members = await db.tenantMember.findMany({
      where: { deletedAt: null, status: { not: 'REMOVED' } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { name: true, email: true, avatarMediaId: true, lastLoginAt: true } },
        _count: {
          select: { assignedStudents: { where: { deletedAt: null, status: { not: 'ARCHIVED' } } } },
        },
      },
    });
    const used = (await this.entitlements.usage(t.tenantId, 'team.assistants')) ?? 0;
    const limit = Number((await this.entitlements.value(t.tenantId, 'team.assistants')) ?? 0);
    return {
      limit,
      used,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        name: m.user.name,
        email: m.user.email,
        permissions: m.role === 'OWNER' ? [] : m.permissions,
        assignedStudents: m._count.assignedStudents,
        invitedAt: m.invitedAt,
        lastLoginAt: m.user.lastLoginAt,
      })),
    };
  }

  /** Convida um assistente por e-mail (conta global reaproveitada se já existir). */
  async invite(t: TenantAccess, actor: UserPrincipal, dto: InviteDto) {
    const sys = this.prisma.system;
    const db = this.prisma.tenant(t.tenantId);
    const existing = await sys.user.findUnique({ where: { email: dto.email } });
    if (existing?.deletedAt) throw conflict('Este e-mail não pode ser convidado.');
    if (existing) {
      const link = await db.studentLink.findFirst({
        where: { userId: existing.id, deletedAt: null },
      });
      if (link) throw conflict('Este e-mail é de um aluno seu. Use outro e-mail para a equipe.');
      const member = await db.tenantMember.findFirst({ where: { userId: existing.id } });
      if (member && member.status !== 'REMOVED') throw conflict('Esta pessoa já está na equipe.');
    }
    const user =
      existing ??
      (await sys.user.create({ data: { email: dto.email, name: dto.name, status: 'PENDING' } }));
    const prior = await db.tenantMember.findFirst({ where: { userId: user.id } });
    const member = prior
      ? await db.tenantMember.update({
          where: { id: prior.id },
          data: {
            status: 'INVITED',
            permissions: dto.permissions,
            invitedAt: new Date(),
            deletedAt: null,
          },
        })
      : await db.tenantMember.create({
          data: {
            tenantId: t.tenantId,
            userId: user.id,
            role: 'ASSISTANT',
            status: 'INVITED',
            permissions: dto.permissions,
            invitedAt: new Date(),
          },
        });
    const { token, expiresAt } = await this.oneTime.create('TEAM_INVITE', INVITE_TTL, {
      tenantId: t.tenantId,
      userId: user.id,
      metadata: { memberId: member.id, invitedBy: actor.userId },
    });
    const tenant = await db.tenant.findFirstOrThrow({ where: { id: t.tenantId } });
    await this.events.publish('team.invited', {
      tenantId: t.tenantId,
      actorId: actor.userId,
      payload: { userId: user.id, token, tenantName: tenant.name, memberId: member.id },
    });
    return {
      memberId: member.id,
      inviteUrl: new URL(deepLinks.teamInvite(token), this.env.APP_WEB_URL).toString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async preview(token: string) {
    const tok = await this.oneTime.peek(token, 'TEAM_INVITE');
    const memberId = (tok.metadata as { memberId?: string }).memberId ?? '';
    const member = await this.prisma.system.tenantMember.findUnique({
      where: { id: memberId },
      include: { tenant: { select: { name: true } }, user: true },
    });
    if (!member || member.status !== 'INVITED')
      throw badRequest('Convite inválido ou já utilizado.', 'TOKEN_INVALID');
    return {
      tenantName: member.tenant.name,
      name: member.user.name,
      email: member.user.email,
      permissions: member.permissions,
      requiresPassword: !member.user.passwordHash,
    };
  }

  async accept(dto: AcceptDto, meta: RequestMeta) {
    const sys = this.prisma.system;
    const tok = await this.oneTime.peek(dto.token, 'TEAM_INVITE');
    const memberId = (tok.metadata as { memberId?: string }).memberId ?? '';
    const member = await sys.tenantMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member || member.status !== 'INVITED')
      throw badRequest('Convite inválido ou já utilizado.', 'TOKEN_INVALID');
    const user = member.user;
    if (user.passwordHash) {
      if (!dto.password || !(await verify(user.passwordHash, dto.password)))
        throw unauthorized('Senha incorreta para esta conta.', 'INVALID_CREDENTIALS');
    } else if (!dto.password) {
      throw badRequest('Crie uma senha para acessar.');
    }
    // O plano pode ter mudado desde o convite.
    await this.entitlements.assertLimit(member.tenantId, 'team.assistants', 0);
    await this.oneTime.consume(dto.token, 'TEAM_INVITE');
    const passwordHash = user.passwordHash ?? (await this.auth.hashPassword(dto.password!));
    await sys.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          ...(dto.name && !user.passwordHash ? { name: dto.name } : {}),
        },
      });
      await tx.tenantMember.update({ where: { id: member.id }, data: { status: 'ACTIVE' } });
      if (!user.passwordHash) {
        await tx.consent.createMany({
          data: this.auth.consentRows(user.id, null, meta, ['TERMS', 'PRIVACY']),
        });
      }
    });
    await this.events.publish('team.joined', {
      tenantId: member.tenantId,
      actorId: user.id,
      payload: { memberId: member.id, memberName: dto.name ?? user.name },
    });
    return this.sessions.createUserSession(user.id, {}, meta, {
      method: 'PASSWORD',
      notifyNewLogin: false,
    });
  }

  private async assistant(t: TenantAccess, id: string) {
    const m = await this.prisma.tenant(t.tenantId).tenantMember.findFirst({
      where: { id, role: 'ASSISTANT', deletedAt: null, status: { not: 'REMOVED' } },
    });
    if (!m) throw notFound('Assistente não encontrado.');
    return m;
  }

  async update(t: TenantAccess, id: string, dto: UpdateMemberDto) {
    await this.assistant(t, id);
    return this.prisma.tenant(t.tenantId).tenantMember.update({
      where: { id },
      data: { permissions: [...new Set(dto.permissions)] },
      select: { id: true, permissions: true, status: true },
    });
  }

  /** Remove da equipe: os alunos voltam para o personal e as sessões do assistente caem. */
  async remove(t: TenantAccess, id: string) {
    const m = await this.assistant(t, id);
    const db = this.prisma.tenant(t.tenantId);
    await db.studentLink.updateMany({
      where: { assistantMemberId: id },
      data: { assistantMemberId: null },
    });
    await db.tenantMember.update({ where: { id }, data: { status: 'REMOVED' } });
    return { id: m.id, status: 'REMOVED' as const };
  }

  async assign(t: TenantAccess, dto: AssignDto) {
    if (dto.memberId) {
      const m = await this.assistant(t, dto.memberId);
      if (m.status !== 'ACTIVE' && m.status !== 'INVITED') throw badRequest('Assistente inativo.');
    }
    const db = this.prisma.tenant(t.tenantId);
    const r = await db.studentLink.updateMany({
      where: { id: { in: dto.studentLinkIds }, deletedAt: null },
      data: { assistantMemberId: dto.memberId },
    });
    if (r.count !== new Set(dto.studentLinkIds).size) throw notFound('Aluno não encontrado.');
    return { updated: r.count };
  }

  /** Quem alterou o quê (log de alterações da equipe). */
  async activity(t: TenantAccess, q: ActivityQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: t.tenantId,
      action: { startsWith: 'change.' },
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
      ...(q.memberId ? { metadata: { path: ['memberId'], equals: q.memberId } } : {}),
      ...(q.studentLinkId
        ? { metadata: { path: ['studentLinkId'], equals: q.studentLinkId } }
        : {}),
    };
    const rows = await this.prisma.system.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: q.limit + 1,
    });
    const userIds = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v))];
    const users = await this.prisma.system.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    const { items, nextCursor } = page(rows, q.limit);
    return {
      items: items.map((r) => {
        const md = r.metadata as Record<string, unknown>;
        return {
          id: r.id,
          at: r.createdAt,
          actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
          role: md.role ?? null,
          resource: r.resource,
          action: r.action.split('.').pop(),
          resourceId: r.resourceId,
          studentLinkId: md.studentLinkId ?? null,
          method: md.method ?? null,
        };
      }),
      nextCursor,
    };
  }
}

@ApiTags('equipe')
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @Can('manage', 'team')
  list(@CurrentTenant() t: TenantAccess) {
    return this.team.list(t);
  }

  @Post('invites')
  @Can('manage', 'team')
  @AssertLimit('team.assistants')
  invite(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: InviteDto,
  ) {
    return this.team.invite(t, u, dto);
  }

  @Public()
  @Get('invites/:token')
  preview(@Param('token') token: string) {
    return this.team.preview(token);
  }

  @Public()
  @Post('invites/accept')
  @HttpCode(200)
  accept(@Body() dto: AcceptDto, @Meta() meta: RequestMeta) {
    return this.team.accept(dto, meta);
  }

  @Patch('members/:id')
  @Can('manage', 'team')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.team.update(t, id, dto);
  }

  @Delete('members/:id')
  @Can('manage', 'team')
  remove(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.team.remove(t, id);
  }

  @Post('assignments')
  @HttpCode(200)
  @Can('manage', 'team')
  assign(@CurrentTenant() t: TenantAccess, @Body() dto: AssignDto) {
    return this.team.assign(t, dto);
  }

  @Get('activity')
  @Can('manage', 'team')
  activity(@CurrentTenant() t: TenantAccess, @Query() q: ActivityQueryDto) {
    return this.team.activity(t, q);
  }
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOGGED_RESOURCES = new Set<Resource>([
  'students',
  'groups',
  'anamnesis',
  'assessments',
  'workouts',
  'progress',
  'schedule',
  'documents',
  'library',
  'team',
  'brand',
  'settings',
]);

/**
 * Registro de alterações da equipe: toda escrita do personal ou do assistente em recursos
 * de alunos e treinos vira uma linha em audit_logs (quem, o quê, qual aluno, quando).
 */
@Injectable()
export class ChangeLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const t = req.tenantAccess;
    const p = req.principal;
    const perm = this.reflector.getAllAndOverride<{ action: Action; resource: Resource }>(
      META.can,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (
      !WRITE.has(req.method) ||
      !t ||
      p?.kind !== 'user' ||
      (t.role !== 'PERSONAL' && t.role !== 'PERSONAL_ASSISTENTE') ||
      !perm ||
      !LOGGED_RESOURCES.has(perm.resource)
    ) {
      return next.handle();
    }
    return next.handle().pipe(
      tap((res: unknown) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const out = (res ?? {}) as Record<string, unknown>;
        const params = req.params as Record<string, string | undefined>;
        const studentLinkId =
          params.studentLinkId ??
          (typeof body.studentLinkId === 'string' ? body.studentLinkId : undefined) ??
          (typeof out.studentLinkId === 'string' ? out.studentLinkId : undefined) ??
          (perm.resource === 'students' ? params.id : undefined) ??
          null;
        void this.prisma.system.auditLog
          .create({
            data: {
              tenantId: t.tenantId,
              actorUserId: p.userId,
              impersonatorAdminId: p.impersonatorAdminId,
              action: CHANGE_ACTION(perm.resource, perm.action),
              resource: perm.resource,
              resourceId: params.id ?? (typeof out.id === 'string' ? out.id : null),
              ip: req.ip ?? null,
              requestId: req.id ? String(req.id) : null,
              metadata: {
                memberId: t.memberId,
                role: t.role,
                method: req.method,
                path: req.route?.path ?? req.path,
                studentLinkId,
              },
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}
