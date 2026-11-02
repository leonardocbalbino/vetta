import { Global, Inject, Module, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import {
  createAiProvider,
  createCalendarProvider,
  createCustomDomainProvider,
  createPaymentProvider,
  type AiProvider,
  type CalendarProvider,
  type CustomDomainProvider,
  EntitlementsCache,
  type BillingDeps,
  type PaymentProvider,
  QUEUES,
  QueueEventPublisher,
  S3StorageProvider,
  type EventPublisher,
  type StorageProvider,
} from '@vetta/server';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { type ApiEnv, ENV } from '../config/env';
import { PrismaService } from './prisma.service';

export const REDIS = Symbol('REDIS');
export const STORAGE = Symbol('STORAGE');
export const EVENTS = Symbol('EVENTS');
export const MEDIA_QUEUE = Symbol('MEDIA_QUEUE');
export const EVENTS_QUEUE = Symbol('EVENTS_QUEUE');
export const DOCUMENTS_QUEUE = Symbol('DOCUMENTS_QUEUE');
/** Gateway de pagamento (null sem ASAAS_API_KEY: rotas respondem 503). */
export const PAYMENTS = Symbol('PAYMENTS');
export const BILLING = Symbol('BILLING');
/** Fase 3: IA, domínio próprio e Google Calendar (substituíveis nos testes). */
export const AI = Symbol('AI');
export const CUSTOM_DOMAINS = Symbol('CUSTOM_DOMAINS');
export const CALENDAR = Symbol('CALENDAR');

const providers: Provider[] = [
  PrismaService,
  {
    provide: REDIS,
    inject: [ENV],
    useFactory: (env: ApiEnv) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 }),
  },
  {
    provide: STORAGE,
    inject: [ENV],
    useFactory: (env: ApiEnv): StorageProvider =>
      new S3StorageProvider({
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        ...(env.S3_PUBLIC_ENDPOINT ? { publicEndpoint: env.S3_PUBLIC_ENDPOINT } : {}),
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      }),
  },
  {
    provide: EVENTS_QUEUE,
    inject: [ENV],
    useFactory: (env: ApiEnv) => new Queue(QUEUES.events, { connection: { url: env.REDIS_URL } }),
  },
  {
    provide: MEDIA_QUEUE,
    inject: [ENV],
    useFactory: (env: ApiEnv) => new Queue(QUEUES.media, { connection: { url: env.REDIS_URL } }),
  },
  {
    provide: DOCUMENTS_QUEUE,
    inject: [ENV],
    useFactory: (env: ApiEnv) =>
      new Queue(QUEUES.documents, { connection: { url: env.REDIS_URL } }),
  },
  {
    provide: EVENTS,
    inject: [EVENTS_QUEUE],
    useFactory: (q: Queue): EventPublisher => new QueueEventPublisher(q),
  },
  {
    provide: EntitlementsCache,
    inject: [PrismaService, REDIS],
    useFactory: (prisma: PrismaService, redis: Redis) =>
      new EntitlementsCache(prisma.system, redis),
  },
  {
    provide: PAYMENTS,
    inject: [ENV],
    useFactory: (env: ApiEnv): PaymentProvider | null => createPaymentProvider(env),
  },
  { provide: AI, inject: [ENV], useFactory: (env: ApiEnv): AiProvider => createAiProvider(env) },
  {
    provide: CUSTOM_DOMAINS,
    inject: [ENV],
    useFactory: (env: ApiEnv): CustomDomainProvider => createCustomDomainProvider(env),
  },
  {
    provide: CALENDAR,
    inject: [ENV],
    useFactory: (env: ApiEnv): CalendarProvider => createCalendarProvider(env),
  },
];

/**
 * Dependências do faturamento (webhooks, ativação de plano). Registrado no AppModule
 * para respeitar o publicador de eventos substituído nos testes.
 */
export const BILLING_PROVIDER: Provider = {
  provide: BILLING,
  inject: [ENV, PrismaService, PAYMENTS, EVENTS, EntitlementsCache],
  useFactory: (
    env: ApiEnv,
    prisma: PrismaService,
    provider: PaymentProvider | null,
    publisher: EventPublisher,
    cache: EntitlementsCache,
  ): BillingDeps => ({
    db: prisma.system,
    provider,
    publisher,
    invalidateTenant: (id) => cache.invalidateTenant(id),
    encryptionKey: env.APP_ENCRYPTION_KEY,
    platformWalletId: env.ASAAS_PLATFORM_WALLET_ID,
  }),
};

@Global()
@Module({ providers, exports: providers })
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(EVENTS_QUEUE) private readonly events: Queue,
    @Inject(MEDIA_QUEUE) private readonly media: Queue,
    @Inject(DOCUMENTS_QUEUE) private readonly documents: Queue,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([this.events.close(), this.media.close(), this.documents.close()]);
    // quit() espera as respostas pendentes; disconnect() rejeitaria comandos em voo.
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
