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
import {
  AI,
  BILLING_PROVIDER,
  CALENDAR,
  CUSTOM_DOMAINS,
  EVENTS,
  InfraModule,
  REDIS,
} from './infra/infra.module';
import type { AiProvider, CalendarProvider, CustomDomainProvider } from '@vetta/server';
import { AdminAiController, AiController, AiService } from './ai/ai';
import { ChangeLogInterceptor, TeamController, TeamService } from './team/team';
import { BrandService, PublicBrandController, WhiteLabelController } from './brand/brand';
import {
  CalendarSyncService,
  ExportsController,
  IntegrationsController,
  IntegrationsService,
} from './integrations/integrations';
import { ReportsController, ReportsService } from './reports/reports';
import {
  AcademyController,
  AcademyService,
  AdminAcademyController,
  AdminBroadcastsController,
  AdminSupportController,
  PlatformBroadcastOpenController,
  PlatformBroadcastsService,
  SupportController,
  SupportService,
} from './platform/platform';
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
import { AdminController, LegalController } from './admin/admin';
import { AnamnesisController, AnamnesisService } from './anamnesis/anamnesis';
import { AssessmentsController, AssessmentsService } from './assessments/assessments';
import { DashboardController, DashboardService } from './dashboard/dashboard';
import { AdminLibraryController, LibraryController } from './library/library.controller';
import { LibraryService } from './library/library.service';
import { ProgressController, ProgressService } from './progress/progress';
import { StudentsManagementController } from './students/students.controller';
import { StudentsAdminService } from './students/students-admin.service';
import { TrainingService } from './training/training.service';
import {
  FeedbacksController,
  PublicWorkoutsController,
  TrainingController,
  WorkoutsController,
} from './workouts/workouts.controller';
import { WorkoutsService } from './workouts/workouts.service';
import { UsersService } from './users/users.service';
import { SubscriptionController, SubscriptionService } from './subscription/subscription';
import { WebhooksController } from './webhooks/webhooks';
import { ScheduleController, ScheduleService } from './schedule/schedule';
import { BroadcastsController, ChatController, ChatService } from './chat/chat';
import { PeriodizationController, PeriodizationService } from './workouts/periodization';
import {
  DocumentsController,
  DocumentsService,
  PostureController,
  PostureService,
} from './assessments/posture-documents';
import { AdminFinanceController } from './admin/admin-finance';
import { AdminIntegrationsController, AdminIntegrationsService } from './admin/admin-integrations';
import { FinanceController, MyFinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';
import {
  BrandController,
  MySalesController,
  PublicSalesController,
  SalesPageController,
  SalesService,
} from './sales/sales';

/** Substituições para testes (eventos em memória, IA com respostas gravadas, dublês). */
export interface AppOverrides {
  events?: EventPublisher;
  ai?: AiProvider;
  customDomains?: CustomDomainProvider;
  calendar?: CalendarProvider;
}

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv, overrides: AppOverrides = {}): DynamicModule {
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
        LibraryController,
        AdminLibraryController,
        StudentsManagementController,
        AnamnesisController,
        AssessmentsController,
        WorkoutsController,
        TrainingController,
        FeedbacksController,
        PublicWorkoutsController,
        ProgressController,
        DashboardController,
        AdminController,
        LegalController,
        SubscriptionController,
        WebhooksController,
        FinanceController,
        MyFinanceController,
        SalesPageController,
        MySalesController,
        PublicSalesController,
        BrandController,
        ScheduleController,
        ChatController,
        BroadcastsController,
        PeriodizationController,
        PostureController,
        DocumentsController,
        AdminFinanceController,
        AdminIntegrationsController,
        AiController,
        AdminAiController,
        TeamController,
        WhiteLabelController,
        PublicBrandController,
        IntegrationsController,
        ExportsController,
        ReportsController,
        AcademyController,
        AdminAcademyController,
        AdminBroadcastsController,
        PlatformBroadcastOpenController,
        SupportController,
        AdminSupportController,
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
        LibraryService,
        StudentsAdminService,
        AnamnesisService,
        AssessmentsService,
        WorkoutsService,
        TrainingService,
        ProgressService,
        DashboardService,
        SubscriptionService,
        FinanceService,
        SalesService,
        ScheduleService,
        ChatService,
        PeriodizationService,
        PostureService,
        DocumentsService,
        AiService,
        TeamService,
        BrandService,
        CalendarSyncService,
        IntegrationsService,
        ReportsService,
        AcademyService,
        PlatformBroadcastsService,
        SupportService,
        AdminIntegrationsService,
        // Testes podem substituir o publicador de eventos (ex.: MemoryEventPublisher).
        ...(overrides.events ? [{ provide: EVENTS, useValue: overrides.events }] : []),
        ...(overrides.ai ? [{ provide: AI, useValue: overrides.ai }] : []),
        ...(overrides.customDomains
          ? [{ provide: CUSTOM_DOMAINS, useValue: overrides.customDomains }]
          : []),
        ...(overrides.calendar ? [{ provide: CALENDAR, useValue: overrides.calendar }] : []),
        BILLING_PROVIDER,
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: ErrorFilter },
        // Ordem importa: autentica antes do rate limit (que usa o usuário como chave).
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_GUARD, useClass: AppThrottlerGuard },
        { provide: APP_INTERCEPTOR, useClass: ImpersonationAuditInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ChangeLogInterceptor },
      ],
    };
  }
}
