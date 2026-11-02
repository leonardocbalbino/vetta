import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  EXPORT_KINDS,
  ExportQuerySchema,
  HealthImportSchema,
  HealthQuerySchema,
  WhatsAppOptInSchema,
  type ExportKind,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import {
  CalendarNotConfiguredError,
  encryptSecret,
  ensureWatchChannel,
  hasWhatsAppOptIn,
  pullChanges,
  pushAppointment,
  randomToken,
  safeEqual,
  tableToCsv,
  tableToPdf,
  type CalendarProvider,
  type CalendarSyncDeps,
  type ExportTable,
} from '@vetta/server';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, Public, RequireFeature, Roles } from '../access/decorators';
import { AuthService } from '../auth/auth.service';
import { badRequest, forbidden, integrationNotConfigured, notFound } from '../common/errors';
import {
  CurrentTenant,
  CurrentUser,
  Meta,
  type RequestMeta,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { assertStudentInScope, studentScope } from '../common/scope';
import { type ApiEnv, ENV } from '../config/env';
import { CALENDAR } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class OptInDto extends createZodDto(WhatsAppOptInSchema) {}
class HealthImportDto extends createZodDto(HealthImportSchema) {}
class HealthQueryDto extends createZodDto(HealthQuerySchema) {}
class ExportQueryDto extends createZodDto(ExportQuerySchema) {}
class CallbackQueryDto extends createZodDto(
  z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  }),
) {}

// ─── Google Calendar ────────────────────────────────────────────────────────

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger('CalendarSync');
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    @Inject(CALENDAR) private readonly calendar: CalendarProvider,
    private readonly prisma: PrismaService,
  ) {}

  get deps(): CalendarSyncDeps {
    return {
      db: this.prisma.system,
      calendar: this.calendar,
      encryptionKey: this.env.APP_ENCRYPTION_KEY,
      webhookUrl: `${this.env.APP_API_URL}/v1/integrations/google/webhook`,
    };
  }

  get redirectUri() {
    return `${this.env.APP_API_URL}/v1/integrations/google/callback`;
  }

  /** Envia aulas ao Google sem atrasar a resposta (falha fica no log da integração). */
  queuePush(appointmentIds: string[]) {
    if (this.calendar.name === 'unconfigured' || !appointmentIds.length) return;
    void (async () => {
      for (const id of appointmentIds.slice(0, 60)) {
        await pushAppointment(this.deps, id).catch((e: unknown) =>
          this.logger.warn(`push ${id}: ${e instanceof Error ? e.message : e}`),
        );
      }
    })();
  }

  async status(t: TenantAccess) {
    const i = await this.prisma.tenant(t.tenantId).calendarIntegration.findFirst({
      where: { memberId: t.memberId!, provider: 'GOOGLE', deletedAt: null },
    });
    return {
      configured: this.calendar.name !== 'unconfigured',
      connected: !!i?.refreshTokenEncrypted,
      email: i?.externalAccountEmail ?? null,
      lastSyncedAt: i?.lastSyncedAt ?? null,
      lastError: i?.lastError ?? null,
      channelExpiresAt: i?.channelExpiresAt ?? null,
    };
  }

  async connect(t: TenantAccess) {
    if (this.calendar.name === 'unconfigured')
      throw integrationNotConfigured('Google Calendar ainda não está disponível neste ambiente.');
    const state = randomToken(24);
    const db = this.prisma.tenant(t.tenantId);
    const existing = await db.calendarIntegration.findFirst({
      where: { memberId: t.memberId!, provider: 'GOOGLE' },
    });
    if (existing)
      await db.calendarIntegration.update({
        where: { id: existing.id },
        data: { oauthState: state, deletedAt: null },
      });
    else
      await db.calendarIntegration.create({
        data: { memberId: t.memberId!, provider: 'GOOGLE', oauthState: state } as never,
      });
    return { url: this.calendar.authUrl(state, this.redirectUri) };
  }

  /** Callback do OAuth: grava tokens cifrados, abre o canal e faz a primeira sincronização. */
  async callback(q: CallbackQueryDto): Promise<string> {
    const back = (status: string) => `${this.env.APP_WEB_URL}/integracoes?google=${status}`;
    if (!q.state) return back('erro');
    const sys = this.prisma.system;
    const i = await sys.calendarIntegration.findUnique({ where: { oauthState: q.state } });
    if (!i) return back('erro');
    if (q.error || !q.code) {
      await sys.calendarIntegration.update({ where: { id: i.id }, data: { oauthState: null } });
      return back('cancelado');
    }
    try {
      const tokens = await this.calendar.exchangeCode(q.code, this.redirectUri);
      await sys.calendarIntegration.update({
        where: { id: i.id },
        data: {
          oauthState: null,
          externalAccountEmail: tokens.email,
          calendarId: 'primary',
          accessTokenEncrypted: encryptSecret(tokens.accessToken, this.env.APP_ENCRYPTION_KEY),
          ...(tokens.refreshToken
            ? {
                refreshTokenEncrypted: encryptSecret(
                  tokens.refreshToken,
                  this.env.APP_ENCRYPTION_KEY,
                ),
              }
            : {}),
          tokenExpiresAt: tokens.expiresAt,
          syncToken: null,
          lastError: null,
        },
      });
    } catch {
      return back('erro');
    }
    // Canal e carga inicial são best-effort: o worker refaz periodicamente.
    await ensureWatchChannel(this.deps, i.id).catch(() => undefined);
    await pullChanges(this.deps, i.id).catch(() => undefined);
    const upcoming = await sys.appointment.findMany({
      where: {
        memberId: i.memberId,
        deletedAt: null,
        status: { not: 'CANCELED' },
        startsAt: { gte: new Date() },
      },
      select: { id: true },
      take: 60,
    });
    this.queuePush(upcoming.map((a) => a.id));
    return back('ok');
  }

  async sync(t: TenantAccess) {
    const i = await this.prisma.tenant(t.tenantId).calendarIntegration.findFirst({
      where: { memberId: t.memberId!, provider: 'GOOGLE', deletedAt: null },
    });
    if (!i?.refreshTokenEncrypted) throw badRequest('Conecte o Google Calendar primeiro.');
    try {
      return await pullChanges(this.deps, i.id);
    } catch (e) {
      if (e instanceof CalendarNotConfiguredError)
        throw integrationNotConfigured('Google Calendar ainda não está disponível neste ambiente.');
      throw e;
    }
  }

  async disconnect(t: TenantAccess) {
    const db = this.prisma.tenant(t.tenantId);
    const i = await db.calendarIntegration.findFirst({
      where: { memberId: t.memberId!, provider: 'GOOGLE', deletedAt: null },
    });
    if (!i) return { ok: true };
    if (i.channelId && i.channelResourceId && i.accessTokenEncrypted) {
      await this.calendar.stop('', i.channelId, i.channelResourceId).catch(() => undefined);
    }
    await db.calendarIntegration.update({
      where: { id: i.id },
      data: {
        deletedAt: new Date(),
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        channelId: null,
        channelResourceId: null,
        channelToken: null,
        syncToken: null,
      },
    });
    // Bloqueios vindos do Google deixam de valer.
    await db.scheduleBlock.updateMany({
      where: { memberId: i.memberId, googleEventId: { not: null }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /** Notificação de mudança do Google: valida o token do canal e puxa as mudanças. */
  async webhook(
    channelId: string | undefined,
    token: string | undefined,
    state: string | undefined,
  ) {
    if (!channelId || !token) return { ok: false };
    const i = await this.prisma.system.calendarIntegration.findUnique({ where: { channelId } });
    if (!i?.channelToken || !safeEqual(i.channelToken, token) || i.deletedAt) return { ok: false };
    if (state === 'sync') return { ok: true };
    await pullChanges(this.deps, i.id).catch((e: unknown) =>
      this.logger.warn(`pull ${i.id}: ${e instanceof Error ? e.message : e}`),
    );
    return { ok: true };
  }
}

// ─── WhatsApp, saúde e exportações ──────────────────────────────────────────

const money = (cents: number) => Math.round(cents) / 100;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async whatsappStatus(userId: string) {
    const u = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true },
    });
    return { optedIn: await hasWhatsAppOptIn(this.prisma.system, userId), phone: u.phone };
  }

  /** Opt-in registrado em consents (versionado, com IP), exigido para qualquer envio. */
  async whatsappOptIn(user: UserPrincipal, dto: OptInDto, meta: RequestMeta) {
    const db = this.prisma.system;
    const u = await db.user.findUniqueOrThrow({ where: { id: user.userId } });
    if (dto.granted) {
      const phone = dto.phone ?? u.phone;
      if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone))
        throw badRequest('Informe seu WhatsApp no formato +5511999999999.');
      if (phone !== u.phone) await db.user.update({ where: { id: u.id }, data: { phone } });
      await db.consent.createMany({
        data: this.auth.consentRows(u.id, null, meta, ['WHATSAPP']),
      });
    } else {
      await db.consent.updateMany({
        where: { userId: u.id, type: 'WHATSAPP', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await db.consent.create({
        data: {
          ...this.auth.consentRows(u.id, null, meta, ['WHATSAPP'])[0]!,
          granted: false,
        },
      });
    }
    return this.whatsappStatus(u.id);
  }

  /** Importa amostras do Apple Health / Health Connect (idempotente por id da origem). */
  async importHealth(userId: string, dto: HealthImportDto) {
    const db = this.prisma.system;
    let imported = 0;
    for (const s of dto.samples) {
      await db.healthSample.upsert({
        where: {
          userId_source_externalId: { userId, source: s.source, externalId: s.externalId },
        },
        create: {
          userId,
          source: s.source,
          type: s.type,
          externalId: s.externalId,
          startAt: new Date(s.startAt),
          endAt: new Date(s.endAt),
          value: s.value,
          unit: s.unit,
          metadata: s.metadata,
        },
        update: { value: s.value, unit: s.unit, endAt: new Date(s.endAt), deletedAt: null },
      });
      imported++;
    }
    return { imported };
  }

  async health(userId: string, q: HealthQueryDto) {
    const rows = await this.prisma.system.healthSample.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(q.type ? { type: q.type } : {}),
        startAt: {
          gte: new Date(`${q.from ?? day(new Date(Date.now() - 30 * 86_400_000))}T00:00:00-03:00`),
          ...(q.to
            ? { lt: new Date(new Date(`${q.to}T00:00:00-03:00`).getTime() + 86_400_000) }
            : {}),
        },
      },
      orderBy: { startAt: 'asc' },
      take: 2000,
    });
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      type: r.type,
      startAt: r.startAt,
      endAt: r.endAt,
      value: Number(r.value),
      unit: r.unit,
      metadata: r.metadata,
    }));
  }

  /** Personal vê os dados de saúde do aluno só com o consentimento de dados de saúde. */
  async studentHealth(t: TenantAccess, studentLinkId: string, q: HealthQueryDto) {
    const link = await assertStudentInScope(this.prisma, t, studentLinkId);
    if (!link.userId) return { consent: false, samples: [] };
    const consent = await this.prisma.system.consent.findFirst({
      where: { userId: link.userId, type: 'HEALTH_DATA', tenantId: t.tenantId },
      orderBy: { grantedAt: 'desc' },
    });
    // Sem o consentimento de dados de saúde para este personal, nada é mostrado.
    if (!consent?.granted || consent.revokedAt) return { consent: false, samples: [] };
    return { consent: true, samples: await this.health(link.userId, q) };
  }

  /** Treinos concluídos para exportar ao app de saúde do aluno. */
  async completedWorkouts(t: TenantAccess, since?: string) {
    const rows = await this.prisma.tenant(t.tenantId).workoutSession.findMany({
      where: {
        studentLinkId: t.studentLinkId!,
        deletedAt: null,
        finishedAt: {
          not: null,
          gte: since ? new Date(since) : new Date(Date.now() - 30 * 86_400_000),
        },
      },
      orderBy: { startedAt: 'asc' },
      include: { routine: { select: { label: true, name: true } } },
      take: 200,
    });
    return rows.map((s) => ({
      id: s.id,
      title: s.routine
        ? `Treino ${s.routine.label}${s.routine.name ? ` – ${s.routine.name}` : ''}`
        : 'Treino extra',
      startAt: s.startedAt,
      endAt: s.finishedAt,
      durationSeconds: s.durationSeconds,
      totalVolumeKg: s.totalVolumeKg ? Number(s.totalVolumeKg) : null,
    }));
  }

  // ─── Exportações ──────────────────────────────────────────────────────────

  async exportTable(t: TenantAccess, kind: ExportKind, q: ExportQueryDto): Promise<ExportTable> {
    const db = this.prisma.tenant(t.tenantId);
    const from = q.from
      ? new Date(`${q.from}T00:00:00-03:00`)
      : new Date(Date.now() - 90 * 86_400_000);
    const to = q.to
      ? new Date(new Date(`${q.to}T00:00:00-03:00`).getTime() + 86_400_000)
      : new Date();
    const period = `${day(from)} a ${day(new Date(to.getTime() - 1))}`;
    const scope = studentScope(t);
    switch (kind) {
      case 'students': {
        const rows = await db.studentLink.findMany({
          where: { deletedAt: null, ...scope },
          orderBy: { displayName: 'asc' },
          include: { assistant: { include: { user: { select: { name: true } } } } },
        });
        return {
          title: 'Alunos',
          columns: [
            'Nome',
            'E-mail',
            'Telefone',
            'Status',
            'Objetivo',
            'Entrou em',
            'Último treino',
            'Assistente',
            'Tags',
          ],
          rows: rows.map((s) => [
            s.displayName,
            s.email,
            s.phone,
            s.status,
            s.goal,
            day(s.joinedAt),
            day(s.lastWorkoutAt),
            s.assistant?.user.name ?? null,
            s.tags.join(', '),
          ]),
        };
      }
      case 'workouts': {
        const rows = await db.workoutSession.findMany({
          where: { deletedAt: null, startedAt: { gte: from, lt: to }, studentLink: scope },
          orderBy: { startedAt: 'desc' },
          include: {
            studentLink: { select: { displayName: true } },
            routine: { select: { label: true, name: true } },
            program: { select: { name: true } },
          },
          take: 20_000,
        });
        return {
          title: 'Treinos realizados',
          subtitle: period,
          columns: [
            'Data',
            'Aluno',
            'Programa',
            'Rotina',
            'Duração (min)',
            'Esforço',
            'Nota',
            'Volume (kg)',
            'Dor',
            'Feedback',
          ],
          rows: rows.map((s) => [
            day(s.startedAt),
            s.studentLink.displayName,
            s.program?.name ?? null,
            s.routine ? `${s.routine.label}${s.routine.name ? ` ${s.routine.name}` : ''}` : 'Extra',
            s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
            s.perceivedEffort,
            s.rating,
            s.totalVolumeKg ? Number(s.totalVolumeKg) : null,
            s.hasPain ? (s.painLocation ?? 'sim') : null,
            s.feedback,
          ]),
        };
      }
      case 'loads': {
        const rows = await db.sessionSetLog.findMany({
          where: {
            deletedAt: null,
            skipped: false,
            session: { startedAt: { gte: from, lt: to }, deletedAt: null, studentLink: scope },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            exercise: { select: { name: true } },
            session: {
              select: { startedAt: true, studentLink: { select: { displayName: true } } },
            },
          },
          take: 50_000,
        });
        return {
          title: 'Cargas registradas',
          subtitle: period,
          columns: ['Data', 'Aluno', 'Exercício', 'Série', 'Repetições', 'Carga (kg)', 'RPE'],
          rows: rows.map((l) => [
            day(l.session.startedAt),
            l.session.studentLink.displayName,
            l.exercise.name,
            l.setOrder,
            l.reps,
            l.loadKg ? Number(l.loadKg) : null,
            l.rpe ? Number(l.rpe) : null,
          ]),
        };
      }
      case 'finance': {
        if (t.role !== 'PERSONAL') throw forbidden();
        const rows = await db.invoice.findMany({
          where: { deletedAt: null, dueDate: { gte: from, lt: to } } as Prisma.InvoiceWhereInput,
          orderBy: { dueDate: 'desc' },
          include: { studentLink: { select: { displayName: true } } },
          take: 20_000,
        });
        return {
          title: 'Cobranças',
          subtitle: period,
          columns: [
            'Vencimento',
            'Pago em',
            'Aluno',
            'Descrição',
            'Forma',
            'Status',
            'Valor (R$)',
            'Líquido (R$)',
          ],
          rows: rows.map((i) => [
            day(i.dueDate),
            day(i.paidAt),
            i.studentLink.displayName,
            i.description,
            i.method,
            i.status,
            money(i.amountCents),
            money(i.netCents ?? 0),
          ]),
        };
      }
    }
  }

  async export(t: TenantAccess, kind: ExportKind, q: ExportQueryDto, res: Response) {
    const table = await this.exportTable(t, kind, q);
    const stamp = new Date().toISOString().slice(0, 10);
    if (q.format === 'pdf') {
      const brand = await this.prisma.tenant(t.tenantId).tenantBrand.findFirst();
      const tenant = await this.prisma.system.tenant.findUniqueOrThrow({
        where: { id: t.tenantId },
      });
      const pdf = await tableToPdf(table, brand?.displayName ?? tenant.name);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="vetta-${kind}-${stamp}.pdf"`);
      return res.send(pdf);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vetta-${kind}-${stamp}.csv"`);
    return res.send(tableToCsv(table));
  }
}

@ApiTags('integrações')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly calendar: CalendarSyncService,
    private readonly svc: IntegrationsService,
  ) {}

  @Get('google')
  @Can('read', 'schedule')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @RequireFeature('schedule.google_calendar')
  googleStatus(@CurrentTenant() t: TenantAccess) {
    return this.calendar.status(t);
  }

  @Post('google/connect')
  @HttpCode(200)
  @Can('update', 'schedule')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @RequireFeature('schedule.google_calendar')
  connect(@CurrentTenant() t: TenantAccess) {
    return this.calendar.connect(t);
  }

  @Public()
  @Get('google/callback')
  async callback(@Query() q: CallbackQueryDto, @Res() res: Response) {
    res.redirect(302, await this.calendar.callback(q));
  }

  @Post('google/sync')
  @HttpCode(200)
  @Can('update', 'schedule')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @RequireFeature('schedule.google_calendar')
  sync(@CurrentTenant() t: TenantAccess) {
    return this.calendar.sync(t);
  }

  @Delete('google')
  @Can('update', 'schedule')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  disconnect(@CurrentTenant() t: TenantAccess) {
    return this.calendar.disconnect(t);
  }

  /** Notificações de mudança (events.watch). Responde rápido; o token do canal autentica. */
  @Public()
  @Post('google/webhook')
  @HttpCode(200)
  webhook(
    @Headers('x-goog-channel-id') channelId?: string,
    @Headers('x-goog-channel-token') token?: string,
    @Headers('x-goog-resource-state') state?: string,
  ) {
    return this.calendar.webhook(channelId, token, state);
  }

  @Get('whatsapp')
  whatsapp(@CurrentUser() u: UserPrincipal) {
    return this.svc.whatsappStatus(u.userId);
  }

  @Put('whatsapp')
  optIn(@CurrentUser() u: UserPrincipal, @Body() dto: OptInDto, @Meta() meta: RequestMeta) {
    return this.svc.whatsappOptIn(u, dto, meta);
  }

  /** O app envia as amostras que o aluno autorizou no Apple Health / Health Connect. */
  @Post('health/samples')
  @HttpCode(200)
  @Can('create', 'progress')
  @Roles('ALUNO')
  @RequireFeature('progress.health_integrations')
  importHealth(@CurrentUser() u: UserPrincipal, @Body() dto: HealthImportDto) {
    return this.svc.importHealth(u.userId, dto);
  }

  @Get('health/samples')
  @Can('read', 'progress')
  @Roles('ALUNO')
  @RequireFeature('progress.health_integrations')
  myHealth(@CurrentUser() u: UserPrincipal, @Query() q: HealthQueryDto) {
    return this.svc.health(u.userId, q);
  }

  @Get('health/students/:studentLinkId')
  @Can('read', 'progress')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @RequireFeature('progress.health_integrations')
  studentHealth(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId', ParseUUIDPipe) id: string,
    @Query() q: HealthQueryDto,
  ) {
    return this.svc.studentHealth(t, id, q);
  }

  /** Treinos concluídos para gravar no app de saúde (exportação). */
  @Get('health/workouts')
  @Can('read', 'training')
  @Roles('ALUNO')
  @RequireFeature('progress.health_integrations')
  workouts(@CurrentTenant() t: TenantAccess, @Query('since') since?: string) {
    return this.svc.completedWorkouts(t, since);
  }
}

@ApiTags('exportações')
@Controller('exports')
export class ExportsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get(':kind')
  @Can('read', 'students')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @RequireFeature('finance.advanced_reports')
  export(
    @CurrentTenant() t: TenantAccess,
    @Param('kind') kind: string,
    @Query() q: ExportQueryDto,
    @Res() res: Response,
  ) {
    if (!(EXPORT_KINDS as readonly string[]).includes(kind))
      throw notFound('Exportação não encontrada.');
    return this.svc.export(t, kind as ExportKind, q, res);
  }
}
