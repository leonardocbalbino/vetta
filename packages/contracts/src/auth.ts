import { z } from 'zod';
import { EmailSchema, PasswordSchema, SlugSchema, TimezoneSchema } from './common.js';
import {
  DevicePlatform,
  Locale,
  PlanCode,
  PlatformRole,
  StudentLinkStatus,
  SubscriptionStatus,
  TenantRole,
} from './enums.js';

export const DeviceInfoSchema = z.object({
  deviceName: z.string().max(120).optional(),
  platform: z.enum(DevicePlatform).default('WEB'),
});

export const RegisterPersonalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: EmailSchema,
  password: PasswordSchema,
  businessName: z.string().trim().min(2).max(120).optional(),
  slug: SlugSchema.optional(),
  cref: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(20).optional(),
  locale: z.enum(Locale).default('pt-BR'),
  timezone: TimezoneSchema.default('America/Sao_Paulo'),
  acceptTerms: z.literal(true, { error: 'Aceite os termos de uso para continuar.' }),
  acceptHealthDataConsent: z.boolean().default(false),
});
export type RegisterPersonalInput = z.infer<typeof RegisterPersonalSchema>;

export const LoginSchema = DeviceInfoSchema.extend({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Segundos até o access token expirar. */
  expiresIn: z.number().int(),
  sessionId: z.uuid(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

/** Login com 2FA ativo devolve um desafio em vez de tokens. */
export const TwoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challengeToken: z.string(),
});

export const LoginResponseSchema = z.union([AuthTokensSchema, TwoFactorChallengeSchema]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const TwoFactorLoginSchema = DeviceInfoSchema.extend({
  challengeToken: z.string().min(10),
  code: z.string().trim().min(6).max(12),
});

export const RefreshSchema = z.object({ refreshToken: z.string().min(20) });
export const TokenSchema = z.object({ token: z.string().min(20) });
export const EmailOnlySchema = z.object({ email: EmailSchema });
export const ResetPasswordSchema = z.object({
  token: z.string().min(20),
  password: PasswordSchema,
});
export const MagicLinkVerifySchema = DeviceInfoSchema.extend({ token: z.string().min(20) });

export const OAuthLoginSchema = DeviceInfoSchema.extend({
  provider: z.enum(['GOOGLE', 'APPLE']),
  idToken: z.string().min(20),
  /** Necessário quando o login social cria uma conta nova de personal. */
  acceptTerms: z.boolean().optional(),
  /** A Apple só envia o nome no primeiro login, pelo cliente. */
  name: z.string().trim().max(120).optional(),
});

export const InviteStudentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: EmailSchema.optional(),
  phone: z.string().trim().max(20).optional(),
  assistantMemberId: z.uuid().optional(),
  /** EMAIL envia o convite; LINK só devolve a URL para compartilhar. */
  delivery: z.enum(['EMAIL', 'LINK']).default('EMAIL'),
});
export type InviteStudentInput = z.infer<typeof InviteStudentSchema>;

export const InviteResponseSchema = z.object({
  studentLinkId: z.uuid(),
  inviteUrl: z.url(),
  whatsappUrl: z.url().nullable(),
  expiresAt: z.iso.datetime(),
});

export const InvitePreviewSchema = z.object({
  tenantName: z.string(),
  studentName: z.string(),
  email: z.string().nullable(),
  requiresPassword: z.boolean(),
});

export const AcceptInviteSchema = DeviceInfoSchema.extend({
  /** Obrigatório quando o convite foi gerado por link (sem e-mail). */
  email: EmailSchema.optional(),
  token: z.string().min(20),
  password: PasswordSchema.optional(),
  name: z.string().trim().min(2).max(120).optional(),
  acceptTerms: z.literal(true),
  acceptHealthDataConsent: z.boolean(),
});

export const TwoFactorSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});
export const TwoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(12) });
export const TwoFactorEnableResponseSchema = z.object({ recoveryCodes: z.array(z.string()) });

export const SessionSchema = z.object({
  id: z.uuid(),
  deviceName: z.string().nullable(),
  platform: z.enum(DevicePlatform),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  current: z.boolean(),
});
export type SessionDto = z.infer<typeof SessionSchema>;

export const ImpersonateSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(10, 'Descreva o motivo (mín. 10 caracteres).').max(500),
  minutes: z.number().int().min(5).max(60).default(30),
});

export const MembershipSchema = z.object({
  tenantId: z.uuid(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  role: z.enum(TenantRole),
  studentLinkId: z.uuid().nullable(),
  status: z.enum(StudentLinkStatus).nullable(),
});
export type Membership = z.infer<typeof MembershipSchema>;

export const MeResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  avatarUrl: z.string().nullable(),
  locale: z.enum(Locale),
  timezone: z.string(),
  twoFactorEnabled: z.boolean(),
  memberships: z.array(MembershipSchema),
  impersonatedBy: z.uuid().nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const AdminLoginResponseSchema = z.union([
  AuthTokensSchema,
  TwoFactorChallengeSchema,
  z.object({ twoFactorSetupRequired: z.literal(true), challengeToken: z.string() }),
]);

export const AdminMeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(PlatformRole),
});

export const SubscriptionSummarySchema = z.object({
  plan: z.enum(PlanCode),
  status: z.enum(SubscriptionStatus),
  trialEndsAt: z.iso.datetime().nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
});

export const UpdateMeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, 'Use o formato +5511999999999.')
    .nullable()
    .optional(),
  locale: z.enum(Locale).optional(),
  timezone: TimezoneSchema.optional(),
  avatarMediaId: z.uuid().nullable().optional(),
  birthDate: z.iso.date().nullable().optional(),
  trainingReminderEnabled: z.boolean().optional(),
  trainingReminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});

export const UpdateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  cref: z.string().trim().max(30).nullable().optional(),
  crefState: z.string().length(2).nullable().optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  documentType: z.enum(['CPF', 'CNPJ']).nullable().optional(),
  documentNumber: z
    .string()
    .regex(/^\d{11}$|^\d{14}$/, 'Somente números (CPF ou CNPJ).')
    .nullable()
    .optional(),
  billingEmail: EmailSchema.nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  timezone: TimezoneSchema.optional(),
});

export const UpdatePlanFeaturesSchema = z.object({
  values: z.record(z.string(), z.union([z.boolean(), z.number().int().min(-1)])),
});
