/**
 * Enums compartilhados. Os valores espelham os enums do Prisma
 * (packages/db tem teste que garante a equivalência).
 */
const values = <const T extends readonly string[]>(...v: T) => v;

export const PlatformRole = values('SUPER_ADMIN', 'ADMIN_OPERADOR');
export type PlatformRole = (typeof PlatformRole)[number];

/** Papel efetivo do usuário dentro de um tenant. */
export const TenantRole = values('PERSONAL', 'PERSONAL_ASSISTENTE', 'ALUNO');
export type TenantRole = (typeof TenantRole)[number];

export const Role = values(...PlatformRole, ...TenantRole);
export type Role = (typeof Role)[number];

export const TenantMemberRole = values('OWNER', 'ASSISTANT');
export type TenantMemberRole = (typeof TenantMemberRole)[number];

export const TenantStatus = values('ACTIVE', 'SUSPENDED', 'CANCELED');
export type TenantStatus = (typeof TenantStatus)[number];

export const UserStatus = values('PENDING', 'ACTIVE', 'BLOCKED');
export type UserStatus = (typeof UserStatus)[number];

export const StudentLinkStatus = values('INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE', 'ARCHIVED');
export type StudentLinkStatus = (typeof StudentLinkStatus)[number];

export const PlanCode = values('FREE', 'PRO', 'PRO_PLUS');
export type PlanCode = (typeof PlanCode)[number];

export const FeatureType = values('BOOLEAN', 'LIMIT');
export type FeatureType = (typeof FeatureType)[number];

export const BillingCycle = values('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');
export type BillingCycle = (typeof BillingCycle)[number];

export const SubscriptionStatus = values('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
export type SubscriptionStatus = (typeof SubscriptionStatus)[number];

export const DevicePlatform = values('IOS', 'ANDROID', 'WEB');
export type DevicePlatform = (typeof DevicePlatform)[number];

export const AuthProvider = values('PASSWORD', 'GOOGLE', 'APPLE', 'MAGIC_LINK');
export type AuthProvider = (typeof AuthProvider)[number];

export const MediaStatus = values(
  'PENDING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETED',
);
export type MediaStatus = (typeof MediaStatus)[number];

export const NotificationChannel = values('IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS');
export type NotificationChannel = (typeof NotificationChannel)[number];

export const NotificationCategory = values(
  'TRAINING',
  'CHAT',
  'FINANCE',
  'MARKETING',
  'SECURITY',
  'SYSTEM',
);
export type NotificationCategory = (typeof NotificationCategory)[number];

export const DeliveryStatus = values(
  'QUEUED',
  'SENT',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'FAILED',
  'SKIPPED',
);
export type DeliveryStatus = (typeof DeliveryStatus)[number];

export const Locale = values('pt-BR', 'en', 'es');
export type Locale = (typeof Locale)[number];
export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
