import type { NotificationCategory } from './enums.js';

/**
 * Catálogo de eventos de domínio. Módulos apenas publicam eventos;
 * o NotificationService decide quem recebe, por qual canal e quando.
 */
export const DOMAIN_EVENTS = {
  // segurança / conta
  'auth.email_verification_requested': 'SECURITY',
  'auth.password_reset_requested': 'SECURITY',
  'auth.magic_link_requested': 'SECURITY',
  'auth.new_login': 'SECURITY',
  'auth.two_factor_enabled': 'SECURITY',
  'auth.refresh_token_reused': 'SECURITY',
  'student.invited': 'SYSTEM',
  'student.joined': 'SYSTEM',
  'students.archived': 'SYSTEM',
  // plano
  'subscription.trial_ending': 'FINANCE',
  'subscription.trial_expired': 'FINANCE',
  // mídia
  'media.ready': 'SYSTEM',
  'media.failed': 'SYSTEM',
  'storage.quota_warning': 'SYSTEM',
  'storage.quota_exceeded': 'SYSTEM',
  // próximas fases (regras já declaradas)
  'workout.published': 'TRAINING',
  'workout.updated': 'TRAINING',
  'training.reminder': 'TRAINING',
  'feedback.critical': 'TRAINING',
  'record.achieved': 'TRAINING',
  'student.inactive': 'TRAINING',
  'assessment.due': 'TRAINING',
  'anamnesis.requested': 'SYSTEM',
  'anamnesis.answered': 'SYSTEM',
  'anamnesis.risk': 'SYSTEM',
  'birthday.upcoming': 'SYSTEM',
  'birthday.today': 'SYSTEM',
  'plan.limit_warning': 'SYSTEM',
  'plan.limit_reached': 'SYSTEM',
  'subscription.trial_ends_today': 'FINANCE',
  'personal.registered': 'SYSTEM',
  'workout.completed': 'TRAINING',
  'chat.message_created': 'CHAT',
  'invoice.created': 'FINANCE',
  'invoice.overdue': 'FINANCE',
  'appointment.reminder': 'TRAINING',
  // Fase 2 – assinatura da plataforma
  'subscription.activated': 'FINANCE',
  'subscription.plan_changed': 'FINANCE',
  'subscription.payment_reminder': 'FINANCE',
  'subscription.payment_failed': 'FINANCE',
  'subscription.past_due': 'FINANCE',
  'subscription.downgraded': 'FINANCE',
  'platform_invoice.paid': 'FINANCE',
  'platform_invoice.refunded': 'FINANCE',
  'fiscal_invoice.issued': 'FINANCE',
  // Fase 2 – financeiro do personal
  'payment_account.status_changed': 'FINANCE',
  'invoice.paid': 'FINANCE',
  'invoice.reminder': 'FINANCE',
  'invoice.payment_failed': 'FINANCE',
  'student.blocked': 'FINANCE',
  'student.unblocked': 'FINANCE',
  'student_plan.ending': 'FINANCE',
  'checkout.paid': 'FINANCE',
  'withdrawal.done': 'FINANCE',
  'withdrawal.failed': 'FINANCE',
  // Fase 2 – agenda, comunicados, periodização, página de vendas, documentos
  'appointment.booked': 'TRAINING',
  'appointment.canceled': 'TRAINING',
  'broadcast.sent': 'CHAT',
  'periodization.phase_started': 'TRAINING',
  'testimonial.submitted': 'SYSTEM',
  'result.consent_requested': 'SYSTEM',
  'document.shared': 'SYSTEM',
} as const satisfies Record<string, NotificationCategory>;

export type DomainEventName = keyof typeof DOMAIN_EVENTS;

export interface DomainEvent<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Id único do evento (idempotência). */
  id: string;
  name: DomainEventName;
  tenantId: string | null;
  /** Usuário que causou o evento, quando houver. */
  actorId: string | null;
  occurredAt: string;
  payload: P;
}
