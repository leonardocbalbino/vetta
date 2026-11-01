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
