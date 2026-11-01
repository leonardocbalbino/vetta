import type { DomainEvent, NotificationChannel } from '@vetta/contracts';

/** Nomes das filas BullMQ (api publica, worker consome). */
export const QUEUES = {
  /** Eventos de domínio → NotificationService. */
  events: 'domain-events',
  /** Entregas por canal (com retry exponencial). */
  delivery: 'notification-delivery',
  /** Processamento de mídia. */
  media: 'media',
  /** Jobs agendados (repeatable). */
  scheduler: 'scheduler',
  /** Documentos gerados (PDF de avaliação). */
  documents: 'documents',
} as const;

export type DomainEventJob = DomainEvent;

export interface DeliveryJob {
  deliveryLogId: string;
  channel: NotificationChannel;
}

export interface MediaJob {
  mediaId: string;
}

/** Jobs agendados. As próximas fases adicionam os lembretes aqui. */
export const SCHEDULED_JOBS = {
  expireTrials: { name: 'subscriptions.expire-trials', every: 60 * 60 * 1000 },
  notifyTrialEnding: { name: 'subscriptions.notify-trial-ending', every: 6 * 60 * 60 * 1000 },
  expireOverrides: { name: 'entitlements.expire-overrides', every: 60 * 60 * 1000 },
  cleanupPendingUploads: { name: 'media.cleanup-pending', every: 24 * 60 * 60 * 1000 },
  purgeDeletedMedia: { name: 'media.purge-deleted', every: 24 * 60 * 60 * 1000 },
  pushReceipts: { name: 'push.check-receipts', every: 15 * 60 * 1000 },
  trainingReminders: { name: 'training.reminders', every: 5 * 60 * 1000 },
  inactiveStudents: { name: 'students.inactive', every: 6 * 60 * 60 * 1000 },
  birthdays: { name: 'students.birthdays', every: 6 * 60 * 60 * 1000 },
  assessmentsDue: { name: 'assessments.due', every: 6 * 60 * 60 * 1000 },
  // Fase 2
  platformReminders: { name: 'billing.platform-reminders', every: 60 * 60 * 1000 },
  platformGrace: { name: 'billing.platform-grace', every: 60 * 60 * 1000 },
  platformPeriodEnd: { name: 'billing.platform-period-end', every: 30 * 60 * 1000 },
  studentReminders: { name: 'billing.student-reminders', every: 60 * 60 * 1000 },
  blockOverdue: { name: 'billing.block-overdue', every: 60 * 60 * 1000 },
  planEndings: { name: 'billing.plan-endings', every: 6 * 60 * 60 * 1000 },
  fiscalInvoices: { name: 'billing.fiscal-invoices', every: 10 * 60 * 1000 },
  kycDocuments: { name: 'billing.kyc-documents', every: 5 * 60 * 1000 },
  retryWebhooks: { name: 'billing.retry-webhooks', every: 2 * 60 * 1000 },
  reconcile: { name: 'billing.reconcile', every: 24 * 60 * 60 * 1000 },
  appointmentReminders: { name: 'schedule.reminders', every: 5 * 60 * 1000 },
  broadcasts: { name: 'comms.scheduled-broadcasts', every: 60 * 1000 },
  periodization: { name: 'workouts.periodization-switch', every: 60 * 60 * 1000 },
  anamnesisReapply: { name: 'anamnesis.reapply', every: 6 * 60 * 60 * 1000 },
} as const;
export type ScheduledJobName = (typeof SCHEDULED_JOBS)[keyof typeof SCHEDULED_JOBS]['name'];

/** Opções padrão de retry com backoff exponencial. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** Canal Redis usado para invalidar o cache de entitlements entre instâncias. */
export const ENTITLEMENTS_CACHE_VERSION_KEY = 'ent:version';
export const entitlementsCacheKey = (version: string | number, tenantId: string) =>
  `ent:${version}:${tenantId}`;
