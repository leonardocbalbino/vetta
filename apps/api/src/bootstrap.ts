import { type INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { createAdapter } from '@socket.io/redis-adapter';
import helmet from 'helmet';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { ServerOptions } from 'socket.io';
import { PrismaService } from './infra/prisma.service';
import { AppModule, type AppOverrides } from './app.module';
import type { ApiEnv } from './config/env';

type OriginCheck = (origin: string | undefined) => Promise<boolean>;

/**
 * Origens aceitas pela API e pelo Socket.IO: as fixas (web, admin, site, CORS_ORIGINS) e os
 * domínios próprios ativos (white label), só em https. Os domínios ficam em cache por 1 min.
 */
export function originChecker(
  origins: string[],
  customHosts: () => Promise<Set<string>>,
): OriginCheck {
  return async (origin) => {
    if (!origin || origins.includes(origin)) return true;
    let u: URL;
    try {
      u = new URL(origin);
    } catch {
      return false;
    }
    if (u.protocol !== 'https:') return false;
    return customHosts()
      .then((hosts) => hosts.has(u.hostname))
      .catch(() => false);
  };
}

/** Socket.IO com adapter Redis: o worker emite para as salas de qualquer instância. */
class RedisIoAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;

  constructor(
    app: INestApplication,
    private readonly redisUrl: string,
    private readonly allowed: OriginCheck,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      // Mesma regra do HTTP: inclui o domínio próprio do personal (chat e sino em tempo real).
      cors: {
        origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
          void this.allowed(origin).then((ok) => cb(null, ok));
        },
        credentials: true,
      },
    });
    this.pub = new Redis(this.redisUrl);
    this.sub = this.pub.duplicate();
    server.adapter(createAdapter(this.pub, this.sub));
    return server;
  }

  override async close(server: unknown) {
    await super.close(server as never);
    await Promise.allSettled([this.pub?.quit(), this.sub?.quit()]);
  }
}

export function corsOrigins(env: ApiEnv): string[] {
  return [
    ...new Set(
      [env.APP_WEB_URL, env.APP_ADMIN_URL, env.APP_SITE_URL, ...env.CORS_ORIGINS].map((u) =>
        u.replace(/\/$/, ''),
      ),
    ),
  ];
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Vetta API')
    .setDescription('API da Vetta — Seu método. Seu aluno. Sua evolução.')
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addServer('https://api.vettafit.com.br')
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/** Cria e configura a aplicação (usado por main.ts e pelos testes e2e). */
export async function createApp(
  env: ApiEnv,
  opts: { logs?: boolean } & AppOverrides = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env, opts), {
    bufferLogs: true,
    ...(opts.logs === false ? { logger: false } : {}),
  });
  if (opts.logs !== false) app.useLogger(app.get(Logger));
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false }));
  const origins = corsOrigins(env);
  // Domínios próprios ativos (white label) também podem chamar a API; cache de 1 min.
  const prisma = app.get(PrismaService);
  let custom = { at: 0, hosts: new Set<string>() };
  const customHosts = async () => {
    if (Date.now() - custom.at > 60_000) {
      const rows = await prisma.system.tenantBrand.findMany({
        where: { customDomainStatus: 'ACTIVE', customDomain: { not: null } },
        select: { customDomain: true },
      });
      custom = { at: Date.now(), hosts: new Set(rows.map((r) => r.customDomain!)) };
    }
    return custom.hosts;
  };
  const allowed = originChecker(origins, customHosts);
  app.enableCors({
    origin: (origin, cb) => {
      void allowed(origin).then((ok) => cb(null, ok));
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL, allowed));
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const doc = buildOpenApi(app);
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/openapi.json' });
  }
  return app;
}
