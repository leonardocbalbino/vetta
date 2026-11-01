import { Inject, Injectable } from '@nestjs/common';
import type { AuthTokens, InviteStudentInput } from '@vetta/contracts';
import type { EventPublisher } from '@vetta/server';
import { verify } from 'argon2';
import { OneTimeTokensService } from '../auth/auth-tokens.service';
import { AuthService } from '../auth/auth.service';
import { SessionsService, type DeviceInfo } from '../auth/sessions.service';
import { badRequest, conflict, notFound, unauthorized } from '../common/errors';
import type { RequestMeta, TenantAccess, UserPrincipal } from '../common/request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

const INVITE_TTL = 7 * 86_400_000;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oneTime: OneTimeTokensService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly entitlements: EntitlementsService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  /** Convite por e-mail ou link (token de uso único, 7 dias). */
  async invite(t: TenantAccess, actor: UserPrincipal, dto: InviteStudentInput) {
    const db = this.prisma.tenant(t.tenantId);
    if (dto.delivery === 'EMAIL' && !dto.email)
      throw badRequest('Informe o e-mail do aluno para enviar o convite.');
    if (dto.assistantMemberId) {
      const m = await db.tenantMember.findFirst({
        where: { id: dto.assistantMemberId, role: 'ASSISTANT', status: 'ACTIVE' },
      });
      if (!m) throw badRequest('Assistente inválido.');
    }
    const tenant = await db.tenant.findFirstOrThrow({ where: { id: t.tenantId } });

    // O usuário é global: se o e-mail já existe (aluno de outro personal), reaproveita.
    let userId: string | null = null;
    if (dto.email) {
      const sys = this.prisma.system;
      const existing = await sys.user.findUnique({ where: { email: dto.email } });
      if (existing?.deletedAt) throw conflict('Este e-mail não pode ser convidado.');
      userId =
        existing?.id ??
        (
          await sys.user.create({
            data: { email: dto.email, name: dto.name, phone: dto.phone ?? null, status: 'PENDING' },
          })
        ).id;
      const dup = await db.studentLink.findFirst({ where: { userId } });
      if (dup)
        throw conflict(
          dup.status === 'ARCHIVED'
            ? 'Este aluno está arquivado. Reative-o.'
            : 'Este aluno já está na sua lista.',
        );
      const isStaff = await db.tenantMember.findFirst({ where: { userId } });
      if (isStaff) throw conflict('Este e-mail pertence à sua equipe.');
    }

    const link = await db.studentLink.create({
      data: {
        tenantId: t.tenantId,
        userId,
        displayName: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        status: 'INVITED',
        invitedAt: new Date(),
        assistantMemberId:
          dto.assistantMemberId ?? (t.role === 'PERSONAL_ASSISTENTE' ? t.memberId : null),
      },
    });
    const { token, expiresAt } = await this.oneTime.create('STUDENT_INVITE', INVITE_TTL, {
      tenantId: t.tenantId,
      ...(userId ? { userId } : {}),
      metadata: { studentLinkId: link.id, delivery: dto.delivery, invitedBy: actor.userId },
    });
    if (dto.delivery === 'EMAIL' && userId) {
      await this.events.publish('student.invited', {
        tenantId: t.tenantId,
        actorId: actor.userId,
        payload: { userId, token, tenantName: tenant.name, studentLinkId: link.id },
      });
    }
    const inviteUrl = this.auth.inviteUrl(token);
    const digits = (dto.phone ?? '').replace(/\D/g, '');
    const text = `Olá, ${dto.name}! ${tenant.name} convidou você para treinar pela Vetta: ${inviteUrl}`;
    const whatsappUrl = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
    return { studentLinkId: link.id, inviteUrl, whatsappUrl, expiresAt: expiresAt.toISOString() };
  }

  async preview(token: string) {
    const t = await this.oneTime.peek(token, 'STUDENT_INVITE');
    const linkId = (t.metadata as { studentLinkId?: string }).studentLinkId;
    const link = await this.prisma.system.studentLink.findUnique({
      where: { id: linkId ?? '' },
      include: { tenant: true, user: true },
    });
    if (!link || link.status !== 'INVITED')
      throw badRequest('Convite inválido ou já utilizado.', 'TOKEN_INVALID');
    return {
      tenantName: link.tenant.name,
      studentName: link.displayName,
      email: link.email,
      requiresPassword: !link.user?.passwordHash,
    };
  }

  /** O aluno aceita o convite e define a própria senha no primeiro acesso. */
  async accept(
    dto: {
      token: string;
      password?: string | undefined;
      name?: string | undefined;
      email?: string | undefined;
      acceptHealthDataConsent: boolean;
    } & DeviceInfo,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const sys = this.prisma.system;
    const peek = await this.oneTime.peek(dto.token, 'STUDENT_INVITE');
    const md = peek.metadata as { studentLinkId?: string; delivery?: string };
    const link = await sys.studentLink.findUnique({
      where: { id: md.studentLinkId ?? '' },
      include: { user: true },
    });
    if (!link || link.status !== 'INVITED')
      throw badRequest('Convite inválido ou já utilizado.', 'TOKEN_INVALID');

    let user = link.user;
    if (!user) {
      if (!dto.email) throw badRequest('Informe seu e-mail para criar o acesso.');
      user = await sys.user.findUnique({ where: { email: dto.email } });
    }
    if (user?.passwordHash) {
      // Já tem conta (ex.: aluno de outro personal): confirma a senha atual.
      if (!dto.password || !(await verify(user.passwordHash, dto.password))) {
        throw unauthorized('Senha incorreta para esta conta.', 'INVALID_CREDENTIALS');
      }
    } else if (!dto.password) {
      throw badRequest('Crie uma senha para acessar.');
    }

    // Reaplica o limite: o plano pode ter mudado desde o convite.
    await this.entitlements.assertLimit(link.tenantId, 'students.max', 0);
    await this.oneTime.consume(dto.token, 'STUDENT_INVITE');
    const now = new Date();
    const emailProven = md.delivery === 'EMAIL';
    const passwordHash = user?.passwordHash ?? (await this.auth.hashPassword(dto.password!));
    const userId = await sys.$transaction(async (tx) => {
      const u = user
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              passwordHash,
              status: 'ACTIVE',
              ...(dto.name && !user.passwordHash ? { name: dto.name } : {}),
              ...(emailProven && !user.emailVerifiedAt ? { emailVerifiedAt: now } : {}),
            },
          })
        : await tx.user.create({
            data: {
              email: dto.email!,
              name: dto.name ?? link.displayName,
              passwordHash,
              status: 'ACTIVE',
            },
          });
      const dup = await tx.studentLink.findFirst({
        where: { tenantId: link.tenantId, userId: u.id, id: { not: link.id } },
      });
      if (dup) throw conflict('Você já está vinculado a este personal.');
      await tx.studentLink.update({
        where: { id: link.id },
        data: {
          userId: u.id,
          status: 'ACTIVE',
          joinedAt: now,
          lastActivityAt: now,
          email: u.email,
        },
      });
      await tx.consent.createMany({
        data: this.auth.consentRows(u.id, null, meta, ['TERMS', 'PRIVACY']),
      });
      if (dto.acceptHealthDataConsent) {
        await tx.consent.createMany({
          data: this.auth.consentRows(u.id, link.tenantId, meta, ['HEALTH_DATA']),
        });
      }
      return u.id;
    });

    await this.events.publish('student.joined', {
      tenantId: link.tenantId,
      actorId: userId,
      payload: { studentLinkId: link.id, studentName: dto.name ?? link.displayName },
    });
    return this.sessions.createUserSession(userId, dto, meta, {
      method: 'PASSWORD',
      notifyNewLogin: false,
    });
  }

  async archive(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const link = await db.studentLink.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(t.scope === 'assigned' ? { assistantMemberId: t.memberId } : {}),
      },
    });
    if (!link) throw notFound('Aluno não encontrado.');
    return db.studentLink.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), archivedReason: 'manual' },
      select: { id: true, status: true },
    });
  }

  async restore(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const link = await db.studentLink.findFirst({
      where: { id, deletedAt: null, status: 'ARCHIVED' },
    });
    if (!link) throw notFound('Aluno arquivado não encontrado.');
    return db.studentLink.update({
      where: { id },
      data: { status: link.userId ? 'ACTIVE' : 'INVITED', archivedAt: null, archivedReason: null },
      select: { id: true, status: true },
    });
  }
}
