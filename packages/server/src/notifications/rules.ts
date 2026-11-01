import {
  DOMAIN_EVENTS,
  deepLinks,
  type DomainEvent,
  type DomainEventName,
  type NotificationCategory,
  type NotificationChannel,
} from '@vetta/contracts';
import { MVP_RULES } from './rules-mvp';

/**
 * Quem recebe o evento:
 * - user: payload.userId
 * - users: payload.userIds
 * - tenant_owner: dono do tenant do evento
 * - tenant_staff: dono + assistente responsável pelo aluno (payload.studentLinkId)
 * - student: usuário do aluno (payload.studentLinkId)
 */
export type RecipientSpec =
  | 'user'
  | 'users'
  | 'tenant_owner'
  | 'tenant_staff'
  | 'student'
  /** Equipe da plataforma (só e-mail). */
  | 'platform_admins';

export interface NotificationRule {
  event: DomainEventName;
  category: NotificationCategory;
  recipients: RecipientSpec;
  channels: readonly NotificationChannel[];
  /** Transacional: ignora o horário de silêncio (ex.: convite que o usuário acabou de pedir). */
  immediate?: boolean;
  /** Atraso fixo antes de enviar (segundos). */
  delaySeconds?: number;
  /** Agrupa eventos semelhantes dentro da janela numa única notificação. */
  group?: { key: (e: DomainEvent) => string; windowSeconds: number };
  deepLink: (e: DomainEvent) => string;
}

const p = (e: DomainEvent, k: string) => String(e.payload[k] ?? '');

const RULES_LIST: NotificationRule[] = [
  ...MVP_RULES,
  {
    event: 'auth.email_verification_requested',
    category: 'SECURITY',
    recipients: 'user',
    channels: ['EMAIL'],
    deepLink: (e) => deepLinks.verifyEmail(p(e, 'token')),
  },
  {
    event: 'auth.password_reset_requested',
    category: 'SECURITY',
    recipients: 'user',
    channels: ['EMAIL'],
    deepLink: (e) => deepLinks.resetPassword(p(e, 'token')),
  },
  {
    event: 'auth.magic_link_requested',
    category: 'SECURITY',
    recipients: 'user',
    channels: ['EMAIL'],
    deepLink: (e) => deepLinks.magicLink(p(e, 'token')),
  },
  {
    event: 'auth.new_login',
    category: 'SECURITY',
    recipients: 'user',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    deepLink: () => deepLinks.security(),
  },
  {
    event: 'auth.two_factor_enabled',
    category: 'SECURITY',
    recipients: 'user',
    channels: ['EMAIL'],
    deepLink: () => deepLinks.security(),
  },
  {
    event: 'auth.refresh_token_reused',
    category: 'SECURITY',
    recipients: 'user',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.security(),
  },
  {
    event: 'student.invited',
    category: 'SYSTEM',
    recipients: 'user',
    channels: ['EMAIL'],
    immediate: true,
    deepLink: (e) => deepLinks.invite(p(e, 'token')),
  },
  {
    event: 'student.joined',
    category: 'SYSTEM',
    recipients: 'tenant_staff',
    channels: ['IN_APP', 'PUSH'],
    deepLink: (e) => deepLinks.student(p(e, 'studentLinkId')),
  },
  {
    event: 'students.archived',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.subscription(),
  },
  {
    event: 'subscription.trial_ending',
    category: 'FINANCE',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    deepLink: () => deepLinks.subscription(),
  },
  {
    event: 'subscription.trial_expired',
    category: 'FINANCE',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.subscription(),
  },
  {
    event: 'media.ready',
    category: 'SYSTEM',
    recipients: 'user',
    channels: ['IN_APP'],
    deepLink: (e) => deepLinks.media(p(e, 'mediaId')),
  },
  {
    event: 'media.failed',
    category: 'SYSTEM',
    recipients: 'user',
    channels: ['IN_APP', 'PUSH'],
    deepLink: (e) => deepLinks.media(p(e, 'mediaId')),
  },
  {
    event: 'storage.quota_warning',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.storage(),
  },
  {
    event: 'storage.quota_exceeded',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.storage(),
  },
  // Próximas fases — regras já declaradas para os módulos publicarem os eventos.
  {
    event: 'workout.completed',
    category: 'TRAINING',
    recipients: 'tenant_staff',
    channels: ['IN_APP', 'PUSH'],
    group: { key: (e) => `workout.completed:${e.tenantId}`, windowSeconds: 3600 }, // agrupado por hora
    deepLink: (e) => deepLinks.student(p(e, 'studentLinkId')),
  },
  {
    event: 'chat.message_created',
    category: 'CHAT',
    recipients: 'users',
    channels: ['IN_APP', 'PUSH'],
    group: { key: (e) => `chat:${p(e, 'conversationId')}`, windowSeconds: 60 },
    deepLink: (e) => deepLinks.chat(p(e, 'conversationId')),
  },
  {
    event: 'invoice.created',
    category: 'FINANCE',
    recipients: 'student',
    channels: ['IN_APP', 'EMAIL', 'WHATSAPP'],
    deepLink: (e) => deepLinks.invoice(p(e, 'invoiceId')),
  },
  {
    event: 'invoice.overdue',
    category: 'FINANCE',
    recipients: 'student',
    channels: ['EMAIL', 'PUSH', 'WHATSAPP'],
    deepLink: (e) => deepLinks.invoice(p(e, 'invoiceId')),
  },
  {
    event: 'appointment.reminder',
    category: 'TRAINING',
    recipients: 'users',
    channels: ['IN_APP', 'PUSH', 'WHATSAPP'],
    immediate: true,
    deepLink: (e) => deepLinks.appointment(p(e, 'appointmentId')),
  },
];

export const NOTIFICATION_RULES: Readonly<Partial<Record<DomainEventName, NotificationRule>>> =
  Object.fromEntries(RULES_LIST.map((r) => [r.event, r]));

/** Garante que a categoria declarada na regra bate com o catálogo de eventos. */
export function assertRulesConsistent(): void {
  for (const r of RULES_LIST) {
    if (DOMAIN_EVENTS[r.event] !== r.category) {
      throw new Error(`Regra ${r.event}: categoria ${r.category} ≠ ${DOMAIN_EVENTS[r.event]}`);
    }
  }
}
