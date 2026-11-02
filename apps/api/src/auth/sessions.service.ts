import { Inject, Injectable } from '@nestjs/common';
import type { AuthTokens, DevicePlatform, SessionDto } from '@vetta/contracts';
import type { AuthProvider } from '@vetta/db';
import { sha256, type EventPublisher } from '@vetta/server';
import { notFound, unauthorized } from '../common/errors';
import type { RequestMeta } from '../common/request';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { TokensService } from './tokens.service';

export interface DeviceInfo {
  deviceName?: string | undefined;
  platform?: DevicePlatform | undefined;
}

export interface SessionOptions {
  method: AuthProvider;
  impersonatorAdminId?: string;
  impersonationReason?: string;
  /** Sessões com prazo fixo (impersonação) não são renovadas além disso. */
  expiresAt?: Date;
  notifyNewLogin?: boolean;
}

/** Sessões por dispositivo e rotação de refresh token com detecção de reuso. */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  async createUserSession(
    userId: string,
    device: DeviceInfo,
    meta: RequestMeta,
    o: SessionOptions,
  ): Promise<AuthTokens> {
    const expiresAt = o.expiresAt ?? this.tokens.refreshExpiry();
    const session = await this.prisma.system.session.create({
      data: {
        userId,
        deviceName: device.deviceName ?? null,
        platform: device.platform ?? 'WEB',
        ip: meta.ip,
        userAgent: meta.userAgent,
        authMethod: o.method,
        impersonatorAdminId: o.impersonatorAdminId ?? null,
        impersonationReason: o.impersonationReason ?? null,
        expiresAt,
      },
    });
    if (!o.impersonatorAdminId) {
      await this.prisma.system.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
      if (o.notifyNewLogin !== false) {
        await this.events.publish('auth.new_login', {
          actorId: userId,
          payload: {
            userId,
            device: device.deviceName ?? meta.userAgent?.slice(0, 60) ?? 'dispositivo desconhecido',
            ip: meta.ip ?? '',
            when: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          },
        });
      }
    }
    return this.issue(
      session.id,
      { sub: userId, typ: 'user', imp: o.impersonatorAdminId },
      expiresAt,
    );
  }

  async createAdminSession(adminUserId: string, meta: RequestMeta): Promise<AuthTokens> {
    const expiresAt = new Date(Date.now() + 12 * 3_600_000);
    const session = await this.prisma.system.session.create({
      data: {
        adminUserId,
        platform: 'WEB',
        ip: meta.ip,
        userAgent: meta.userAgent,
        authMethod: 'PASSWORD',
        expiresAt,
      },
    });
    await this.prisma.system.adminUser.update({
      where: { id: adminUserId },
      data: { lastLoginAt: new Date() },
    });
    return this.issue(session.id, { sub: adminUserId, typ: 'admin' }, expiresAt);
  }

  private async issue(
    sessionId: string,
    c: { sub: string; typ: 'user' | 'admin'; imp?: string | undefined },
    sessionExpiresAt: Date,
  ): Promise<AuthTokens> {
    const refreshToken = await this.tokens.issueRefresh(sessionId, sessionExpiresAt);
    const remaining = Math.floor((sessionExpiresAt.getTime() - Date.now()) / 1000);
    const access = await this.tokens.signAccess(
      { sub: c.sub, sid: sessionId, typ: c.typ, ...(c.imp ? { imp: c.imp } : {}) },
      remaining,
    );
    return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn, sessionId };
  }

  /**
   * Rotação: cada refresh token vale uma vez. Reapresentar um token já trocado
   * indica roubo — a sessão inteira é revogada e o usuário é avisado.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const db = this.prisma.system;
    const rt = await db.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { session: true },
    });
    if (!rt) throw unauthorized('Sessão inválida. Entre novamente.', 'TOKEN_INVALID');
    const s = rt.session;
    const now = new Date();

    const reuse = async () => {
      await this.revoke(s.id, 'refresh_token_reuse');
      if (s.userId) {
        await this.events.publish('auth.refresh_token_reused', {
          actorId: s.userId,
          payload: {
            userId: s.userId,
            device: s.deviceName ?? s.userAgent?.slice(0, 60) ?? 'dispositivo',
            ip: meta.ip ?? '',
          },
        });
      }
      return unauthorized(
        'Detectamos reuso do acesso. Por segurança, entre novamente.',
        'TOKEN_REUSED',
      );
    };

    if (rt.rotatedAt) throw await reuse();
    if (s.revokedAt || s.expiresAt <= now || rt.expiresAt <= now) {
      throw unauthorized('Sessão expirada. Entre novamente.', 'TOKEN_INVALID');
    }
    const claimed = await db.refreshToken.updateMany({
      where: { id: rt.id, rotatedAt: null },
      data: { rotatedAt: now },
    });
    if (claimed.count !== 1) throw await reuse();

    // Sessões normais deslizam; impersonação mantém o prazo fixo.
    const expiresAt = s.impersonatorAdminId
      ? s.expiresAt
      : s.adminUserId
        ? s.expiresAt
        : this.tokens.refreshExpiry();
    await db.session.update({
      where: { id: s.id },
      data: { lastUsedAt: now, ip: meta.ip ?? s.ip, expiresAt },
    });
    const typ = s.adminUserId ? 'admin' : 'user';
    const sub = (s.adminUserId ?? s.userId)!;
    return this.issue(s.id, { sub, typ, imp: s.impersonatorAdminId ?? undefined }, expiresAt);
  }

  async revoke(sessionId: string, reason: string) {
    await this.prisma.system.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.tokens.markRevoked(sessionId);
  }

  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    const sessions = await this.prisma.system.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    for (const s of sessions) await this.revoke(s.id, reason);
    return sessions.length;
  }

  async list(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.system.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, impersonatorAdminId: null },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  async revokeOwn(userId: string, sessionId: string) {
    const s = await this.prisma.system.session.findFirst({ where: { id: sessionId, userId } });
    if (!s) throw notFound('Sessão não encontrada.');
    await this.revoke(s.id, 'user_revoked');
  }
}
