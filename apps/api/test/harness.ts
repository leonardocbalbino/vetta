import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  createPrismaClient,
  syncCatalog,
  syncNotificationTemplates,
  type PrismaClient,
} from '@vetta/db';
import {
  createTenantWorld,
  startTestDatabase,
  type TenantWorld,
  type TestDatabase,
} from '@vetta/db/testing';
import {
  EntitlementsCache,
  LocalFfmpegVideoProvider,
  MemoryEventPublisher,
  processMedia,
  S3StorageProvider,
  type StorageProvider,
} from '@vetta/server';
import { hash } from 'argon2';
import ffmpegPath from 'ffmpeg-static';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { loadApiEnv, type ApiEnv } from '../src/config/env';
import { TEST_S3 } from './global-setup';

export const PASSWORD = 'Senha-forte-123';
let passwordHash: string | null = null;

export interface TestContext {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  db: PrismaClient;
  redis: Redis;
  env: ApiEnv;
  events: MemoryEventPublisher;
  storage: StorageProvider;
  cache: EntitlementsCache;
  close: () => Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const tdb: TestDatabase = await startTestDatabase();
  const env = loadApiEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: tdb.url,
    REDIS_URL: process.env.TEST_REDIS_URL!,
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    S3_ENDPOINT: process.env.TEST_S3_ENDPOINT!,
    S3_BUCKET: TEST_S3.bucket,
    S3_ACCESS_KEY_ID: TEST_S3.accessKeyId,
    S3_SECRET_ACCESS_KEY: TEST_S3.secretAccessKey,
    RATE_LIMIT_PER_MINUTE: '100000',
    AUTH_RATE_LIMIT_PER_MINUTE: '100000',
    SWAGGER_ENABLED: 'true',
    ...overrides,
  });
  const db = createPrismaClient({ url: tdb.url });
  await syncCatalog(db);
  await syncNotificationTemplates(db);
  const events = new MemoryEventPublisher();
  const app = await createApp(env, { logs: false, events });
  await app.init();
  const redis = new Redis(env.REDIS_URL);
  const storage = new S3StorageProvider({
    endpoint: env.S3_ENDPOINT!,
    region: 'auto',
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: true,
  });
  return {
    app,
    http: request(app.getHttpServer()),
    db,
    redis,
    env,
    events,
    storage,
    cache: new EntitlementsCache(db, redis),
    close: async () => {
      await app.close();
      await db.$disconnect();
      redis.disconnect();
      await tdb.stop();
    },
  };
}

const uid = () => Math.random().toString(36).slice(2, 8);

/** Tenant completo (fixtures do @vetta/db) com senha conhecida. */
export async function seedWorld(
  ctx: TestContext,
  plan: 'FREE' | 'PRO' | 'PRO_PLUS',
  students = 1,
): Promise<TenantWorld & { ownerEmail: string; studentEmails: string[] }> {
  passwordHash ??= await hash(PASSWORD);
  const id = uid();
  const studentEmails = Array.from({ length: students }, (_, i) => `aluno${i}-${id}@test.dev`);
  const world = await createTenantWorld(ctx.db, {
    slug: `t-${id}`,
    ownerName: `Personal ${id}`,
    ownerEmail: `personal-${id}@test.dev`,
    businessName: `Studio ${id}`,
    plan,
    passwordHash,
    students: studentEmails.map((email, i) => ({ name: `Aluno ${i}`, email })),
  });
  return { ...world, ownerEmail: `personal-${id}@test.dev`, studentEmails };
}

export async function addAssistant(
  ctx: TestContext,
  world: TenantWorld,
  assignStudentLinkIds: string[],
) {
  passwordHash ??= await hash(PASSWORD);
  const email = `assistente-${uid()}@test.dev`;
  const user = await ctx.db.user.create({
    data: {
      email,
      name: 'Assistente',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const member = await ctx.db.tenantMember.create({
    data: { tenantId: world.tenantId, userId: user.id, role: 'ASSISTANT' },
  });
  if (assignStudentLinkIds.length) {
    await ctx.db.studentLink.updateMany({
      where: { id: { in: assignStudentLinkIds } },
      data: { assistantMemberId: member.id },
    });
  }
  return { email, userId: user.id, memberId: member.id };
}

export async function login(ctx: TestContext, email: string, password = PASSWORD): Promise<string> {
  const res = await ctx.http.post('/v1/auth/login').send({ email, password });
  if (res.status !== 200 || !res.body.accessToken)
    throw new Error(`login falhou (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

/** Cliente autenticado; tenantId vira X-Tenant-Id. */
export function as(ctx: TestContext, token: string | null, tenantId?: string) {
  const headers = (r: request.Test) => {
    if (token) r.set('Authorization', `Bearer ${token}`);
    if (tenantId) r.set('X-Tenant-Id', tenantId);
    return r;
  };
  return {
    get: (url: string) => headers(ctx.http.get(url)),
    post: (url: string, body?: object) => headers(ctx.http.post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => headers(ctx.http.patch(url)).send(body ?? {}),
    put: (url: string, body?: object) => headers(ctx.http.put(url)).send(body ?? {}),
    delete: (url: string) => headers(ctx.http.delete(url)),
  };
}

export function mediaDeps(ctx: TestContext) {
  return {
    db: ctx.db,
    storage: ctx.storage,
    video: new LocalFfmpegVideoProvider(ctx.storage, ffmpegPath as unknown as string),
    publisher: ctx.events,
    clamav: null,
  };
}

export const runMediaJob = (ctx: TestContext, mediaId: string) =>
  processMedia(mediaDeps(ctx), mediaId);

/** Último evento de um tipo (ex.: para pegar o token do e-mail de verificação). */
export function lastEvent(ctx: TestContext, name: Parameters<MemoryEventPublisher['of']>[0]) {
  const list = ctx.events.of(name);
  const e = list[list.length - 1];
  if (!e) throw new Error(`evento ${name} não publicado`);
  return e;
}

/** Token de admin sem passar pelo 2FA (o fluxo completo é testado em auth.e2e). */
export async function adminToken(
  ctx: TestContext,
  role: 'SUPER_ADMIN' | 'ADMIN_OPERADOR' = 'SUPER_ADMIN',
) {
  const { TokensService } = await import('../src/auth/tokens.service');
  const admin = await ctx.db.adminUser.create({
    data: { email: `admin-${uid()}@vettafit.dev`, name: 'Admin', passwordHash: 'x', role },
  });
  const session = await ctx.db.session.create({
    data: { adminUserId: admin.id, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  const tokens = ctx.app.get(TokensService);
  const { token } = await tokens.signAccess({ sub: admin.id, sid: session.id, typ: 'admin' });
  return { token, adminId: admin.id };
}
