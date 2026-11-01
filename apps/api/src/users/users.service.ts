import { Inject, Injectable } from '@nestjs/common';
import type { Locale, MeResponse, Membership } from '@vetta/contracts';
import { SIGNED_URL_TTL_SECONDS } from '@vetta/contracts';
import type { StorageProvider } from '@vetta/server';
import { SessionsService } from '../auth/sessions.service';
import { badRequest, conflict } from '../common/errors';
import type { UserPrincipal } from '../common/request';
import { STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async memberships(userId: string): Promise<Membership[]> {
    const db = this.prisma.system;
    const [members, links] = await Promise.all([
      db.tenantMember.findMany({
        where: { userId, status: 'ACTIVE', deletedAt: null, tenant: { deletedAt: null } },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.studentLink.findMany({
        where: { userId, deletedAt: null, status: { not: 'INVITED' }, tenant: { deletedAt: null } },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return [
      ...members.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
        role: m.role === 'OWNER' ? ('PERSONAL' as const) : ('PERSONAL_ASSISTENTE' as const),
        studentLinkId: null,
        status: null,
      })),
      ...links.map((l) => ({
        tenantId: l.tenantId,
        tenantName: l.tenant.name,
        tenantSlug: l.tenant.slug,
        role: 'ALUNO' as const,
        studentLinkId: l.id,
        status: l.status,
      })),
    ];
  }

  async me(p: UserPrincipal): Promise<MeResponse> {
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: p.userId } });
    let avatarUrl: string | null = null;
    if (user.avatarMediaId) {
      const media = await this.prisma.system.media.findUnique({
        where: { id: user.avatarMediaId },
      });
      const thumb = (media?.variants as Record<string, { key: string }> | null)?.thumbnail?.key;
      if (media?.status === 'READY')
        avatarUrl = await this.storage.presignGet(
          thumb ?? media.storageKey,
          SIGNED_URL_TTL_SECONDS,
        );
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: !!user.emailVerifiedAt,
      avatarUrl,
      locale: user.locale as Locale,
      timezone: user.timezone,
      twoFactorEnabled: !!user.twoFactorEnabledAt,
      memberships: await this.memberships(user.id),
      impersonatedBy: p.impersonatorAdminId,
    };
  }

  async update(
    p: UserPrincipal,
    dto: {
      name?: string | undefined;
      phone?: string | null | undefined;
      locale?: Locale | undefined;
      timezone?: string | undefined;
      avatarMediaId?: string | null | undefined;
    },
  ) {
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: dto.timezone });
      } catch {
        throw badRequest('Fuso horário inválido.');
      }
    }
    if (dto.avatarMediaId) {
      const m = await this.prisma.system.media.findUnique({ where: { id: dto.avatarMediaId } });
      if (!m || m.ownerUserId !== p.userId || m.purpose !== 'avatar')
        throw badRequest('Imagem de perfil inválida.');
    }
    await this.prisma.system.user.update({
      where: { id: p.userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.avatarMediaId !== undefined ? { avatarMediaId: dto.avatarMediaId } : {}),
      },
    });
    return this.me(p);
  }

  /** LGPD: portabilidade — exporta os dados do titular. */
  async export(p: UserPrincipal) {
    const db = this.prisma.system;
    const user = await db.user.findUniqueOrThrow({
      where: { id: p.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        locale: true,
        timezone: true,
        createdAt: true,
        consents: true,
        notificationPreferences: true,
      },
    });
    const links = await db.studentLink.findMany({
      where: { userId: p.userId },
      include: {
        tenant: { select: { name: true, slug: true } },
        anamnesisResponses: true,
        physicalAssessments: true,
        postureAssessments: { include: { photos: true } },
        bodyMeasurements: true,
        progressPhotos: true,
        workoutSessions: { include: { setLogs: true } },
        personalRecords: true,
        documents: true,
      },
    });
    const media = await db.media.findMany({
      where: { ownerUserId: p.userId, deletedAt: null },
      select: {
        id: true,
        purpose: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
    return JSON.parse(
      JSON.stringify(
        { exportedAt: new Date().toISOString(), user, studentLinks: links, media },
        (_k, v) => (typeof v === 'bigint' ? Number(v) : v),
      ),
    ) as unknown;
  }

  /**
   * LGPD: exclusão a pedido do titular. Anonimiza a conta, arquiva os vínculos
   * de aluno e encerra as sessões. Donos de tenant precisam cancelar a conta antes.
   */
  async deleteAccount(p: UserPrincipal) {
    const db = this.prisma.system;
    const owns = await db.tenant.count({ where: { ownerUserId: p.userId, deletedAt: null } });
    if (owns > 0) throw conflict('Cancele sua conta de personal antes de excluir seus dados.');
    const now = new Date();
    await db.$transaction([
      db.user.update({
        where: { id: p.userId },
        data: {
          email: `excluido+${p.userId}@vettafit.invalid`,
          name: 'Usuário excluído',
          phone: null,
          passwordHash: null,
          avatarMediaId: null,
          twoFactorSecret: null,
          twoFactorEnabledAt: null,
          twoFactorRecoveryCodes: [],
          status: 'BLOCKED',
          deletedAt: now,
        },
      }),
      db.userIdentity.deleteMany({ where: { userId: p.userId } }),
      db.device.deleteMany({ where: { userId: p.userId } }),
      db.studentLink.updateMany({
        where: { userId: p.userId },
        data: {
          status: 'ARCHIVED',
          archivedAt: now,
          archivedReason: 'account_deleted',
          email: null,
          phone: null,
          displayName: 'Aluno excluído',
        },
      }),
      db.consent.updateMany({
        where: { userId: p.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      db.media.updateMany({
        where: { ownerUserId: p.userId, deletedAt: null },
        data: { deletedAt: now, status: 'DELETED' },
      }),
    ]);
    await this.sessions.revokeAllForUser(p.userId, 'account_deleted');
  }
}
