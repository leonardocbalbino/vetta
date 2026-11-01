import { Inject, Injectable } from '@nestjs/common';
import {
  deepLinks,
  TRIAL_DAYS,
  TRIAL_PLAN,
  type AuthTokens,
  type LoginResponse,
  type RegisterPersonalInput,
} from '@vetta/contracts';
import type { ConsentType, Prisma } from '@vetta/db';
import { type EventPublisher } from '@vetta/server';
import { hash, verify } from 'argon2';
import { type ApiEnv, ENV } from '../config/env';
import { badRequest, conflict, unauthorized } from '../common/errors';
import type { RequestMeta, UserPrincipal } from '../common/request';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { OneTimeTokensService } from './auth-tokens.service';
import { OAuthService } from './oauth.service';
import { SessionsService, type DeviceInfo } from './sessions.service';
import { TotpService } from './totp.service';

const HOUR = 3_600_000;
/** Hash fixo para igualar o tempo de resposta quando o e-mail não existe. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$2bQ2Yq4Dq5lA0tqQ4R0kq3U9Hk2T0wQJt0fJx3o1mXk';

export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'personal'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    @Inject(EVENTS) private readonly events: EventPublisher,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly oneTime: OneTimeTokensService,
    private readonly totp: TotpService,
    private readonly oauth: OAuthService,
  ) {}

  hashPassword(password: string) {
    return hash(password);
  }

  // ─── Cadastro do personal ────────────────────────────────────────────────

  /** Cria User + Tenant + TenantMember OWNER + assinatura TRIALING (14 dias no PRO_PLUS). */
  async registerPersonal(
    input: RegisterPersonalInput,
    meta: RequestMeta,
    device: DeviceInfo = {},
  ): Promise<AuthTokens> {
    const db = this.prisma.system;
    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing?.passwordHash) throw conflict('Este e-mail já tem conta. Entre com sua senha.');
    if (input.slug && (await db.tenant.findUnique({ where: { slug: input.slug } }))) {
      throw conflict('Este endereço já está em uso. Escolha outro.', { field: 'slug' });
    }
    const passwordHash = await this.hashPassword(input.password);
    const user = await this.createPersonalAccount({
      existingUserId: existing?.id ?? null,
      email: input.email,
      name: input.name,
      passwordHash,
      businessName: input.businessName ?? input.name,
      slug: input.slug ?? null,
      cref: input.cref ?? null,
      phone: input.phone ?? null,
      locale: input.locale,
      timezone: input.timezone,
      emailVerified: false,
      healthConsent: input.acceptHealthDataConsent,
      meta,
    });
    await this.sendVerification(user.id, user.name);
    return this.sessions.createUserSession(user.id, device, meta, {
      method: 'PASSWORD',
      notifyNewLogin: false,
    });
  }

  private async uniqueSlug(base: string): Promise<string> {
    const root = slugify(base);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? root : `${root}-${i + 1}`;
      if (!(await this.prisma.system.tenant.findUnique({ where: { slug: candidate } })))
        return candidate;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  private async createPersonalAccount(o: {
    existingUserId: string | null;
    email: string;
    name: string;
    passwordHash: string | null;
    businessName: string;
    slug: string | null;
    cref: string | null;
    phone: string | null;
    locale: string;
    timezone: string;
    emailVerified: boolean;
    healthConsent: boolean;
    meta: RequestMeta;
  }) {
    const db = this.prisma.system;
    const plan = await db.plan.findUniqueOrThrow({ where: { code: TRIAL_PLAN } });
    const slug = o.slug ?? (await this.uniqueSlug(o.businessName));
    const now = new Date();
    return db.$transaction(async (tx) => {
      const userData = {
        email: o.email,
        name: o.name,
        passwordHash: o.passwordHash,
        phone: o.phone,
        locale: o.locale,
        timezone: o.timezone,
        status: o.emailVerified ? ('ACTIVE' as const) : ('PENDING' as const),
        emailVerifiedAt: o.emailVerified ? now : null,
      };
      const user = o.existingUserId
        ? await tx.user.update({ where: { id: o.existingUserId }, data: userData })
        : await tx.user.create({ data: userData });
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: o.businessName,
          ownerUserId: user.id,
          cref: o.cref,
          timezone: o.timezone,
          locale: o.locale,
        },
      });
      await tx.tenantMember.create({
        data: { tenantId: tenant.id, userId: user.id, role: 'OWNER' },
      });
      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'TRIALING',
          trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
          currentPeriodStart: now,
        },
      });
      await tx.tenantStorageUsage.create({ data: { tenantId: tenant.id } });
      await tx.consent.createMany({
        data: this.consentRows(user.id, null, o.meta, ['TERMS', 'PRIVACY']),
      });
      if (o.healthConsent) {
        await tx.consent.createMany({
          data: this.consentRows(user.id, tenant.id, o.meta, ['HEALTH_DATA']),
        });
      }
      return user;
    });
  }

  consentRows(
    userId: string,
    tenantId: string | null,
    meta: RequestMeta,
    types: ConsentType[],
  ): Prisma.ConsentCreateManyInput[] {
    const version: Record<ConsentType, string> = {
      TERMS: this.env.TERMS_VERSION,
      PRIVACY: this.env.PRIVACY_VERSION,
      HEALTH_DATA: this.env.HEALTH_CONSENT_VERSION,
      MARKETING: this.env.PRIVACY_VERSION,
    };
    return types.map((type) => ({
      userId,
      tenantId,
      type,
      version: version[type],
      granted: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    }));
  }

  // ─── Verificação de e-mail ───────────────────────────────────────────────

  async sendVerification(userId: string, name: string) {
    await this.oneTime.invalidatePending(userId, 'EMAIL_VERIFICATION');
    const { token } = await this.oneTime.create('EMAIL_VERIFICATION', 24 * HOUR, { userId });
    await this.events.publish('auth.email_verification_requested', {
      actorId: userId,
      payload: { userId, name, token },
    });
  }

  async resendVerification(principal: UserPrincipal) {
    const user = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: principal.userId },
    });
    if (user.emailVerifiedAt) return;
    await this.sendVerification(user.id, user.name);
  }

  async verifyEmail(token: string) {
    const t = await this.oneTime.consume(token, 'EMAIL_VERIFICATION');
    await this.prisma.system.user.update({
      where: { id: t.userId! },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
  }

  // ─── Login por senha (+ 2FA) ─────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<LoginResponse> {
    const user = await this.prisma.system.user.findUnique({ where: { email } });
    const ok = await verify(user?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
    if (!user || !user.passwordHash || !ok || user.deletedAt) {
      throw unauthorized('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
    }
    if (user.status === 'BLOCKED')
      throw unauthorized('Conta bloqueada. Fale com o suporte.', 'INVALID_CREDENTIALS');
    if (user.twoFactorEnabledAt) {
      const { token } = await this.oneTime.create('TWO_FACTOR_CHALLENGE', 10 * 60_000, {
        userId: user.id,
        metadata: { method: 'PASSWORD' },
      });
      return { twoFactorRequired: true, challengeToken: token };
    }
    return this.sessions.createUserSession(user.id, device, meta, { method: 'PASSWORD' });
  }

  async loginTwoFactor(
    challengeToken: string,
    code: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const challenge = await this.oneTime.peek(challengeToken, 'TWO_FACTOR_CHALLENGE');
    if (!challenge.userId) throw unauthorized('Desafio inválido.', 'TOKEN_INVALID');
    const user = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: challenge.userId },
    });
    await this.checkSecondFactor(
      'user',
      user.id,
      user.twoFactorSecret,
      user.twoFactorRecoveryCodes,
      code,
    );
    await this.oneTime.consume(challengeToken, 'TWO_FACTOR_CHALLENGE');
    return this.sessions.createUserSession(user.id, device, meta, { method: 'PASSWORD' });
  }

  /** Aceita TOTP ou código de recuperação (que é consumido). */
  async checkSecondFactor(
    kind: 'user' | 'admin',
    id: string,
    secret: string | null,
    recovery: string[],
    code: string,
  ) {
    if (this.totp.verify(secret, code.trim())) return;
    const remaining = this.totp.consumeRecoveryCode(recovery, code);
    if (!remaining) throw unauthorized('Código inválido.', 'TWO_FACTOR_INVALID');
    if (kind === 'user') {
      await this.prisma.system.user.update({
        where: { id },
        data: { twoFactorRecoveryCodes: remaining },
      });
    } else {
      await this.prisma.system.adminUser.update({
        where: { id },
        data: { twoFactorRecoveryCodes: remaining },
      });
    }
  }

  async setupTwoFactor(principal: UserPrincipal) {
    const user = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: principal.userId },
    });
    if (user.twoFactorEnabledAt) throw conflict('A verificação em duas etapas já está ativa.');
    const s = this.totp.createSecret(user.email);
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: s.encrypted },
    });
    return { secret: s.secret, otpauthUrl: s.otpauthUrl };
  }

  async enableTwoFactor(principal: UserPrincipal, code: string) {
    const user = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: principal.userId },
    });
    if (!this.totp.verify(user.twoFactorSecret, code))
      throw unauthorized('Código inválido.', 'TWO_FACTOR_INVALID');
    const rc = this.totp.recoveryCodes();
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: { twoFactorEnabledAt: new Date(), twoFactorRecoveryCodes: rc.hashes },
    });
    await this.events.publish('auth.two_factor_enabled', {
      actorId: user.id,
      payload: { userId: user.id },
    });
    return { recoveryCodes: rc.codes };
  }

  async disableTwoFactor(principal: UserPrincipal, code: string) {
    const user = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: principal.userId },
    });
    if (!user.twoFactorEnabledAt) return;
    await this.checkSecondFactor(
      'user',
      user.id,
      user.twoFactorSecret,
      user.twoFactorRecoveryCodes,
      code,
    );
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: { twoFactorEnabledAt: null, twoFactorSecret: null, twoFactorRecoveryCodes: [] },
    });
  }

  // ─── Recuperação de senha e magic link ───────────────────────────────────

  /** Sempre responde igual (não revela se o e-mail existe). */
  async forgotPassword(email: string) {
    const user = await this.prisma.system.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return;
    await this.oneTime.invalidatePending(user.id, 'PASSWORD_RESET');
    const { token } = await this.oneTime.create('PASSWORD_RESET', HOUR, { userId: user.id });
    await this.events.publish('auth.password_reset_requested', {
      actorId: user.id,
      payload: { userId: user.id, token },
    });
  }

  async resetPassword(token: string, password: string) {
    const t = await this.oneTime.consume(token, 'PASSWORD_RESET');
    const passwordHash = await this.hashPassword(password);
    await this.prisma.system.user.update({
      where: { id: t.userId! },
      data: { passwordHash, emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
    await this.sessions.revokeAllForUser(t.userId!, 'password_reset');
  }

  async requestMagicLink(email: string) {
    const user = await this.prisma.system.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.status === 'BLOCKED') return;
    await this.oneTime.invalidatePending(user.id, 'MAGIC_LINK');
    const { token } = await this.oneTime.create('MAGIC_LINK', 15 * 60_000, { userId: user.id });
    await this.events.publish('auth.magic_link_requested', {
      actorId: user.id,
      payload: { userId: user.id, token },
    });
  }

  async verifyMagicLink(
    token: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<LoginResponse> {
    const t = await this.oneTime.consume(token, 'MAGIC_LINK');
    const user = await this.prisma.system.user.update({
      where: { id: t.userId! },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
    if (user.twoFactorEnabledAt) {
      const c = await this.oneTime.create('TWO_FACTOR_CHALLENGE', 10 * 60_000, { userId: user.id });
      return { twoFactorRequired: true, challengeToken: c.token };
    }
    return this.sessions.createUserSession(user.id, device, meta, { method: 'MAGIC_LINK' });
  }

  // ─── Login social ────────────────────────────────────────────────────────

  async oauthLogin(
    input: {
      provider: 'GOOGLE' | 'APPLE';
      idToken: string;
      name?: string | undefined;
      acceptTerms?: boolean | undefined;
    },
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<LoginResponse> {
    const id = await this.oauth.verify(input.provider, input.idToken);
    const db = this.prisma.system;
    let user = (
      await db.userIdentity.findUnique({
        where: { provider_providerUserId: { provider: id.provider, providerUserId: id.subject } },
        include: { user: true },
      })
    )?.user;

    if (!user) {
      if (!id.email || !id.emailVerified)
        throw unauthorized('O provedor não confirmou seu e-mail.', 'INVALID_CREDENTIALS');
      user = (await db.user.findUnique({ where: { email: id.email } })) ?? undefined;
      if (!user) {
        // Conta nova via login social = cadastro de personal.
        if (!input.acceptTerms) throw badRequest('Aceite os termos de uso para criar sua conta.');
        const name = input.name ?? id.name ?? id.email.split('@')[0]!;
        user = await this.createPersonalAccount({
          existingUserId: null,
          email: id.email,
          name,
          passwordHash: null,
          businessName: name,
          slug: null,
          cref: null,
          phone: null,
          locale: 'pt-BR',
          timezone: 'America/Sao_Paulo',
          emailVerified: true,
          healthConsent: false,
          meta,
        });
      }
      await db.userIdentity.create({
        data: {
          userId: user.id,
          provider: id.provider,
          providerUserId: id.subject,
          email: id.email,
        },
      });
      if (!user.emailVerifiedAt) {
        user = await db.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
        });
      }
    }
    if (user.deletedAt || user.status === 'BLOCKED')
      throw unauthorized('Conta indisponível.', 'INVALID_CREDENTIALS');
    if (user.twoFactorEnabledAt) {
      const c = await this.oneTime.create('TWO_FACTOR_CHALLENGE', 10 * 60_000, { userId: user.id });
      return { twoFactorRequired: true, challengeToken: c.token };
    }
    return this.sessions.createUserSession(user.id, device, meta, { method: id.provider });
  }

  inviteUrl(token: string) {
    return new URL(deepLinks.invite(token), this.env.APP_WEB_URL).toString();
  }
}
