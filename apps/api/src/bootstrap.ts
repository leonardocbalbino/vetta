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
import { AppModule, type AppOverrides } from './app.module';
import type { ApiEnv } from './config/env';

/** Socket.IO com adapter Redis: o worker emite para as salas de qualquer instância. */
class RedisIoAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;

  constructor(
    app: INestApplication,
    private readonly redisUrl: string,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
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
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL, origins));
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const doc = buildOpenApi(app);
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/openapi.json' });
  }
  return app;
}
