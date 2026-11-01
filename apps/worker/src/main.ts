import * as Sentry from '@sentry/node';
import { Emitter } from '@socket.io/redis-emitter';
import type { DomainEvent } from '@vetta/contracts';
import { createPrismaClient } from '@vetta/db';
import {
  assessmentsDue,
  birthdays,
  checkPushReceipts,
  generateAssessmentPdf,
  inactiveStudents,
  trainingReminders,
  trialEndsToday,
  CloudflareStreamVideoProvider,
  cleanupPendingUploads,
  createEmailProvider,
  deliver,
  dispatchEvent,
  EntitlementsCache,
  expireOverrides,
  expireTrials,
  ExpoPushProvider,
  failMedia,
  LocalFfmpegVideoProvider,
  MuxVideoProvider,
  notifyTrialEnding,
  processMedia,
  purgeDeletedMedia,
  QUEUES,
  QueueEventPublisher,
  S3StorageProvider,
  SCHEDULED_JOBS,
  UnconfiguredSmsProvider,
  UnconfiguredWhatsAppProvider,
  DEFAULT_JOB_OPTIONS,
  appointmentReminders,
  blockOverdueStudents,
  createInvoiceIssuer,
  createPaymentProvider,
  issueFiscalInvoices,
  platformGraceExpired,
  platformInvoiceReminders,
  platformPeriodEnd,
  reapplyAnamnesis,
  reconcileDay,
  retryFailedWebhooks,
  sendKycDocuments,
  sendScheduledBroadcasts,
  studentInvoiceReminders,
  studentPlanEndings,
  switchPeriodizationPhases,
  type BillingDeps,
  type DeliveryJobData,
  type MediaJob,
  type VideoProvider,
} from '@vetta/server';
import { Queue, Worker, type Job } from 'bullmq';
import ffmpegStatic from 'ffmpeg-static';
import { Redis } from 'ioredis';
import pino from 'pino';
import { loadWorkerEnv } from './env';

try {
  process.loadEnvFile('.env');
} catch {
  // sem .env: usa apenas o ambiente
}

const env = loadWorkerEnv();
const log = pino({
  level: env.LOG_LEVEL,
  base: { app: 'worker' },
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
});
if (env.SENTRY_DSN)
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const db = createPrismaClient({ url: env.DATABASE_URL });
const storage = new S3StorageProvider({
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

function videoProvider(): VideoProvider {
  if (env.VIDEO_PROVIDER === 'cloudflare') {
    return new CloudflareStreamVideoProvider(storage, {
      accountId: env.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: env.CLOUDFLARE_STREAM_TOKEN!,
      customerSubdomain: env.CLOUDFLARE_STREAM_SUBDOMAIN!,
    });
  }
  if (env.VIDEO_PROVIDER === 'mux') {
    return new MuxVideoProvider(storage, {
      tokenId: env.MUX_TOKEN_ID!,
      tokenSecret: env.MUX_TOKEN_SECRET!,
    });
  }
  return new LocalFfmpegVideoProvider(
    storage,
    env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string),
  );
}

const queues = {
  events: new Queue(QUEUES.events, { connection }),
  delivery: new Queue(QUEUES.delivery, { connection }),
  scheduler: new Queue(QUEUES.scheduler, { connection }),
};
const publisher = new QueueEventPublisher(queues.events);
const cache = new EntitlementsCache(db, redis);
const emitter = new Emitter(redis);
const mediaDeps = {
  db,
  storage,
  video: videoProvider(),
  publisher,
  clamav: env.CLAMAV_ENABLED ? { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT } : null,
  log: (msg: string, extra?: Record<string, unknown>) => log.warn(extra ?? {}, msg),
};
const deliveryDeps = {
  db,
  redis,
  email: createEmailProvider(env),
  push: new ExpoPushProvider(env.EXPO_ACCESS_TOKEN),
  whatsapp: new UnconfiguredWhatsAppProvider(),
  sms: new UnconfiguredSmsProvider(),
  webUrl: env.APP_WEB_URL,
  adminUrl: env.APP_ADMIN_URL,
};
const jobDeps = {
  db,
  publisher,
  invalidateTenant: (tenantId: string) => cache.invalidateTenant(tenantId),
};
// Gateway e NFS-e: sempre o sandbox fora de produção (ver ADR-010 e docs/env.md).
const billingDeps: BillingDeps = {
  ...jobDeps,
  provider: createPaymentProvider(env),
  encryptionKey: env.APP_ENCRYPTION_KEY,
  platformWalletId: env.ASAAS_PLATFORM_WALLET_ID,
};
const issuer = createInvoiceIssuer(env);

/** Jobs agendados (BullMQ job schedulers). Novas fases registram lembretes aqui. */
const scheduled: Record<string, () => Promise<unknown>> = {
  [SCHEDULED_JOBS.expireTrials.name]: () => expireTrials(jobDeps),
  [SCHEDULED_JOBS.notifyTrialEnding.name]: async () => ({
    threeDays: await notifyTrialEnding(jobDeps),
    today: await trialEndsToday(jobDeps),
  }),
  [SCHEDULED_JOBS.trainingReminders.name]: () => trainingReminders(jobDeps),
  [SCHEDULED_JOBS.inactiveStudents.name]: () => inactiveStudents(jobDeps),
  [SCHEDULED_JOBS.birthdays.name]: () => birthdays(jobDeps),
  [SCHEDULED_JOBS.assessmentsDue.name]: () => assessmentsDue(jobDeps),
  [SCHEDULED_JOBS.expireOverrides.name]: () => expireOverrides(jobDeps),
  [SCHEDULED_JOBS.cleanupPendingUploads.name]: () => cleanupPendingUploads(db, storage),
  [SCHEDULED_JOBS.purgeDeletedMedia.name]: () => purgeDeletedMedia(db, storage),
  [SCHEDULED_JOBS.pushReceipts.name]: () => checkPushReceipts(deliveryDeps),
  [SCHEDULED_JOBS.platformReminders.name]: () => platformInvoiceReminders(billingDeps),
  [SCHEDULED_JOBS.platformGrace.name]: () => platformGraceExpired(billingDeps),
  [SCHEDULED_JOBS.platformPeriodEnd.name]: () => platformPeriodEnd(billingDeps),
  [SCHEDULED_JOBS.studentReminders.name]: () => studentInvoiceReminders(billingDeps),
  [SCHEDULED_JOBS.blockOverdue.name]: () => blockOverdueStudents(billingDeps),
  [SCHEDULED_JOBS.planEndings.name]: () => studentPlanEndings(billingDeps),
  [SCHEDULED_JOBS.fiscalInvoices.name]: () => issueFiscalInvoices({ ...billingDeps, issuer }),
  [SCHEDULED_JOBS.kycDocuments.name]: () => sendKycDocuments({ ...billingDeps, storage }),
  [SCHEDULED_JOBS.retryWebhooks.name]: () => retryFailedWebhooks(billingDeps),
  [SCHEDULED_JOBS.reconcile.name]: () => reconcileDay(billingDeps),
  [SCHEDULED_JOBS.appointmentReminders.name]: () => appointmentReminders(jobDeps),
  [SCHEDULED_JOBS.broadcasts.name]: () => sendScheduledBroadcasts(jobDeps),
  [SCHEDULED_JOBS.periodization.name]: () => switchPeriodizationPhases(jobDeps),
  [SCHEDULED_JOBS.anamnesisReapply.name]: () => reapplyAnamnesis(jobDeps),
};

function onFailed(name: string) {
  return (job: Job | undefined, err: Error) => {
    log.error(
      { queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message },
      'job falhou',
    );
    Sentry.captureException(err, { tags: { queue: name } });
  };
}

async function main() {
  const workers = [
    // Eventos de domínio → NotificationService (decide destinatário, canal e horário)
    new Worker<DomainEvent>(
      QUEUES.events,
      async (job) =>
        dispatchEvent(
          {
            db,
            redis,
            scheduleDelivery: async (data: DeliveryJobData, delayMs: number) => {
              await queues.delivery.add(data.channel, data, {
                ...DEFAULT_JOB_OPTIONS,
                delay: delayMs,
                jobId: data.deliveryLogId,
              });
            },
            emitInApp: (userId, n) => {
              emitter.to(`user:${userId}`).emit('notification', n);
            },
          },
          job.data,
        ),
      { connection, concurrency: env.WORKER_CONCURRENCY },
    ),
    // Entregas por canal, com retry exponencial
    new Worker<DeliveryJobData>(
      QUEUES.delivery,
      (job) =>
        deliver(deliveryDeps, job.data, {
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? 1,
        }),
      { connection, concurrency: env.WORKER_CONCURRENCY },
    ),
    // Mídia: magic number, antivírus, EXIF, WEBP, thumbnails, HLS
    new Worker<MediaJob>(
      QUEUES.media,
      async (job) => {
        try {
          return await processMedia(mediaDeps, job.data.mediaId);
        } catch (err) {
          if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
            const media = await db.media.findUnique({ where: { id: job.data.mediaId } });
            if (media) await failMedia(mediaDeps, media, 'Não foi possível processar o arquivo.');
          }
          throw err;
        }
      },
      { connection, concurrency: env.MEDIA_CONCURRENCY },
    ),
    // Documentos (PDF de avaliação física)
    new Worker<{ assessmentId: string; tenantId: string; branded: boolean }>(
      QUEUES.documents,
      (job) => generateAssessmentPdf({ db, storage }, job.data),
      { connection, concurrency: 2 },
    ),
    // Agendador
    new Worker(
      QUEUES.scheduler,
      async (job) => {
        const fn = scheduled[job.name];
        if (!fn) throw new Error(`job agendado desconhecido: ${job.name}`);
        const result = await fn();
        log.info({ job: job.name, result }, 'job agendado concluído');
        return result;
      },
      { connection, concurrency: 1 },
    ),
  ];
  for (const w of workers) w.on('failed', onFailed(w.name));

  for (const j of Object.values(SCHEDULED_JOBS)) {
    await queues.scheduler.upsertJobScheduler(
      j.name,
      { every: j.every },
      { name: j.name, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
  }
  log.info(
    { queues: Object.values(QUEUES), video: mediaDeps.video.name, antivirus: !!mediaDeps.clamav },
    'worker pronto',
  );

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'encerrando worker');
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled(Object.values(queues).map((q) => q.close()));
    await db.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  log.fatal({ err }, 'falha ao iniciar o worker');
  process.exitCode = 1;
});
