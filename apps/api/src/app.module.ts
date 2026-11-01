import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import type { EventPublisher } from '@vetta/server';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import { AccessGuard } from './access/access.guard';
import { TenantAccessService } from './access/tenant-access.service';
import { ImpersonationAuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { AdminAuthService } from './auth/admin-auth.service';
import {
  AdminAuthController,
  AuthController,
  ImpersonationController,
} from './auth/auth.controller';
import { OneTimeTokensService } from './auth/auth-tokens.service';
import { AuthService } from './auth/auth.service';
import { OAuthService } from './auth/oauth.service';
import { SessionsService } from './auth/sessions.service';
import { TokensService } from './auth/tokens.service';
import { TotpService } from './auth/totp.service';
import { ErrorFilter } from './common/error.filter';
import { AppThrottlerGuard, RedisThrottlerStorage } from './common/throttler';
import { type ApiEnv, ENV } from './config/env';
import { AUTH_THROTTLE } from './auth/auth.controller';
import { EntitlementsService } from './entitlements/entitlements.service';
import { HealthController } from './health/health.controller';
import { EVENTS, InfraModule, REDIS } from './infra/infra.module';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsGateway } from './notifications/notifications.gateway';
import { AdminPlansController, PlansController } from './plans/plans.controller';
import { StudentsService } from './tenants/students.service';
import {
  InvitesController,
  StudentsController,
  TenantsController,
} from './tenants/tenants.controller';
import { UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';
import { MeController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv, overrides: { events?: EventPublisher } = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        SentryModule.forRoot(),
        {
          module: class EnvModule {},
          global: true,
          providers: [{ provide: ENV, useValue: env }],
          exports: [ENV],
        },
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.refreshToken',
                'req.body.token',
              ],
              censor: '[redacted]',
            },
            autoLogging: { ignore: (req) => req.url === '/health' },
            ...(env.NODE_ENV === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
        InfraModule,
        ThrottlerModule.forRootAsync({
          inject: [REDIS],
          useFactory: (redis: Redis) => ({
            throttlers: [
              { name: 'default', ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE },
              {
                name: 'auth',
                ttl: 60_000,
                limit: env.AUTH_RATE_LIMIT_PER_MINUTE,
                skipIf: (ctx) => !Reflect.getMetadata(AUTH_THROTTLE, ctx.getHandler()),
              },
            ],
            storage: new RedisThrottlerStorage(redis),
          }),
        }),
      ],
      controllers: [
        HealthController,
        AuthController,
        AdminAuthController,
        ImpersonationController,
        MeController,
        TenantsController,
        StudentsController,
        InvitesController,
        PlansController,
        AdminPlansController,
        UploadsController,
        NotificationsController,
      ],
      providers: [
        TokensService,
        TotpService,
        OAuthService,
        OneTimeTokensService,
        SessionsService,
        AuthService,
        AdminAuthService,
        AuditService,
        TenantAccessService,
        EntitlementsService,
        UsersService,
        StudentsService,
        UploadsService,
        NotificationsGateway,
        // Testes podem substituir o publicador de eventos (ex.: MemoryEventPublisher).
        ...(overrides.events ? [{ provide: EVENTS, useValue: overrides.events }] : []),
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: ErrorFilter },
        // Ordem importa: autentica antes do rate limit (que usa o usuário como chave).
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_GUARD, useClass: AppThrottlerGuard },
        { provide: APP_INTERCEPTOR, useClass: ImpersonationAuditInterceptor },
      ],
    };
  }
}
