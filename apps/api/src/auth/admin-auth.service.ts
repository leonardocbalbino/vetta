import { Inject, Injectable } from '@nestjs/common';
import { type EventPublisher } from '@vetta/server';
import { verify } from 'argon2';
import { notFound, unauthorized } from '../common/errors';
import type { AdminPrincipal, RequestMeta } from '../common/request';
import { AuditService } from '../audit/audit.service';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { OneTimeTokensService } from './auth-tokens.service';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { TotpService } from './totp.service';

const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$2bQ2Yq4Dq5lA0tqQ4R0kq3U9Hk2T0wQJt0fJx3o1mXk';

/** Login da equipe da plataforma: senha + 2FA TOTP obrigatório. */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oneTime: OneTimeTokensService,
    private readonly totp: TotpService,
    private readonly sessions: SessionsService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(EVENTS) private readonly _events: EventPublisher,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.system.adminUser.findUnique({ where: { email } });
    const ok = await verify(admin?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
    if (!admin || !ok || !admin.isActive || admin.deletedAt) {
      throw unauthorized('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
    }
    const { token } = await this.oneTime.create('TWO_FACTOR_CHALLENGE', 10 * 60_000, {
      adminUserId: admin.id,
    });
    return admin.twoFactorEnabledAt
      ? { twoFactorRequired: true as const, challengeToken: token }
      : { twoFactorSetupRequired: true as const, challengeToken: token };
  }

  /** Primeiro acesso: gera o segredo TOTP (ainda não ativo). */
  async setup(challengeToken: string) {
    const c = await this.oneTime.peek(challengeToken, 'TWO_FACTOR_CHALLENGE');
    const admin = await this.prisma.system.adminUser.findUnique({
      where: { id: c.adminUserId ?? '' },
    });
    if (!admin) throw unauthorized('Desafio inválido.', 'TOKEN_INVALID');
    if (admin.twoFactorEnabledAt) throw unauthorized('2FA já configurado.', 'TOKEN_INVALID');
    const s = this.totp.createSecret(admin.email);
    await this.prisma.system.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorSecret: s.encrypted },
    });
    return { secret: s.secret, otpauthUrl: s.otpauthUrl };
  }

  async verify(challengeToken: string, code: string, meta: RequestMeta) {
    const c = await this.oneTime.peek(challengeToken, 'TWO_FACTOR_CHALLENGE');
    const admin = await this.prisma.system.adminUser.findUnique({
      where: { id: c.adminUserId ?? '' },
    });
    if (!admin) throw unauthorized('Desafio inválido.', 'TOKEN_INVALID');
    let recoveryCodes: string[] | undefined;
    if (!admin.twoFactorEnabledAt) {
      if (!this.totp.verify(admin.twoFactorSecret, code))
        throw unauthorized('Código inválido.', 'TWO_FACTOR_INVALID');
      const rc = this.totp.recoveryCodes();
      await this.prisma.system.adminUser.update({
        where: { id: admin.id },
        data: { twoFactorEnabledAt: new Date(), twoFactorRecoveryCodes: rc.hashes },
      });
      recoveryCodes = rc.codes;
    } else {
      await this.auth.checkSecondFactor(
        'admin',
        admin.id,
        admin.twoFactorSecret,
        admin.twoFactorRecoveryCodes,
        code,
      );
    }
    await this.oneTime.consume(challengeToken, 'TWO_FACTOR_CHALLENGE');
    const tokens = await this.sessions.createAdminSession(admin.id, meta);
    await this.audit.log(
      { kind: 'admin', adminId: admin.id, sessionId: tokens.sessionId, role: admin.role },
      meta,
      {
        action: 'admin.login',
        resource: 'admin_users',
        resourceId: admin.id,
      },
    );
    return { ...tokens, ...(recoveryCodes ? { recoveryCodes } : {}) };
  }

  /**
   * Impersonação: sessão de tempo limitado em nome do usuário, com motivo
   * obrigatório, auditada; o app mostra banner (impersonatedBy em /me).
   */
  async impersonate(
    admin: AdminPrincipal,
    input: { userId: string; reason: string; minutes: number },
    meta: RequestMeta,
  ) {
    const user = await this.prisma.system.user.findUnique({ where: { id: input.userId } });
    if (!user || user.deletedAt) throw notFound('Usuário não encontrado.');
    const expiresAt = new Date(Date.now() + input.minutes * 60_000);
    const tokens = await this.sessions.createUserSession(
      user.id,
      { deviceName: 'Impersonação (admin)', platform: 'WEB' },
      meta,
      {
        method: 'PASSWORD',
        impersonatorAdminId: admin.adminId,
        impersonationReason: input.reason,
        expiresAt,
      },
    );
    await this.audit.log(admin, meta, {
      action: 'impersonation.start',
      resource: 'users',
      resourceId: user.id,
      metadata: { reason: input.reason, minutes: input.minutes, sessionId: tokens.sessionId },
    });
    return { ...tokens, expiresAt: expiresAt.toISOString() };
  }

  async endImpersonation(admin: AdminPrincipal, sessionId: string, meta: RequestMeta) {
    const s = await this.prisma.system.session.findFirst({
      where: { id: sessionId, impersonatorAdminId: admin.adminId },
    });
    if (!s) throw notFound('Impersonação não encontrada.');
    await this.sessions.revoke(s.id, 'impersonation_end');
    await this.audit.log(admin, meta, {
      action: 'impersonation.end',
      resource: 'sessions',
      resourceId: s.id,
    });
  }
}
