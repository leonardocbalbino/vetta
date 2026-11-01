import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  MeasurementInputSchema,
  ProgressPhotoInputSchema,
  SIGNED_URL_TTL_SECONDS,
} from '@vetta/contracts';
import { bestsOf, weeklyVolume } from '@vetta/fitness';
import type { StorageProvider } from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import { badRequest } from '../common/errors';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { assertStudentInScope } from '../common/scope';
import { STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class MeasurementDto extends createZodDto(MeasurementInputSchema) {}
class PhotoDto extends createZodDto(ProgressPhotoInputSchema) {}
class ExerciseQueryDto extends createZodDto(z.object({ exerciseId: z.uuid() })) {}

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  /** "me" → vínculo do próprio aluno; senão valida o escopo da equipe. */
  async resolve(t: TenantAccess, studentLinkId: string) {
    if (studentLinkId === 'me') {
      if (t.role !== 'ALUNO' || !t.studentLinkId) throw badRequest('Use o id do aluno.');
      return t.studentLinkId;
    }
    await assertStudentInScope(this.prisma, t, studentLinkId);
    return studentLinkId;
  }

  /** Séries para os gráficos: peso, % gordura, medidas, carga por exercício e volume semanal. */
  async overview(t: TenantAccess, id: string) {
    const studentLinkId = await this.resolve(t, id);
    const db = this.prisma.tenant(t.tenantId);
    const since = new Date(Date.now() - 365 * 86_400_000);
    const [measurements, logs] = await Promise.all([
      db.bodyMeasurement.findMany({
        where: { studentLinkId, deletedAt: null },
        orderBy: { measuredAt: 'asc' },
      }),
      db.sessionSetLog.findMany({
        where: {
          session: { studentLinkId, deletedAt: null, startedAt: { gte: since } },
          completed: true,
          skipped: false,
          deletedAt: null,
        },
        select: {
          exerciseId: true,
          loadKg: true,
          reps: true,
          session: { select: { id: true, startedAt: true } },
          exercise: { select: { name: true } },
        },
      }),
    ]);
    const weight = measurements
      .filter((m) => m.weightKg !== null)
      .map((m) => ({ date: m.measuredAt, value: Number(m.weightKg) }));
    const bodyFat = measurements
      .filter((m) => m.bodyFatPct !== null)
      .map((m) => ({ date: m.measuredAt, value: Number(m.bodyFatPct) }));
    const measures: Record<string, { date: Date; value: number }[]> = {};
    for (const m of measurements) {
      for (const [k, v] of Object.entries((m.measures ?? {}) as Record<string, number>))
        (measures[k] ??= []).push({ date: m.measuredAt, value: v });
    }
    // Carga por exercício: melhor série de cada sessão.
    const byExercise = new Map<
      string,
      {
        name: string;
        sessions: Map<string, { date: Date; sets: { loadKg: number; reps: number }[] }>;
      }
    >();
    for (const l of logs) {
      const e = byExercise.get(l.exerciseId) ?? { name: l.exercise.name, sessions: new Map() };
      const s = e.sessions.get(l.session.id) ?? { date: l.session.startedAt, sets: [] };
      s.sets.push({ loadKg: Number(l.loadKg ?? 0), reps: l.reps ?? 0 });
      e.sessions.set(l.session.id, s);
      byExercise.set(l.exerciseId, e);
    }
    const exercises = [...byExercise.entries()]
      .map(([exerciseId, e]) => ({
        exerciseId,
        name: e.name,
        points: [...e.sessions.values()]
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((s) => {
            const b = bestsOf(s.sets);
            return {
              date: s.date,
              maxLoadKg: b.maxLoadKg,
              oneRmKg: b.bestOneRmKg,
              volumeKg: b.maxSessionVolumeKg,
            };
          }),
      }))
      .filter((e) => e.points.some((p) => p.maxLoadKg > 0))
      .sort((a, b) => b.points.length - a.points.length)
      .slice(0, 12);
    const volume = weeklyVolume(
      logs.map((l) => ({
        date: l.session.startedAt,
        loadKg: Number(l.loadKg ?? 0),
        reps: l.reps ?? 0,
      })),
    );
    return { weight, bodyFat, measures, exercises, weeklyVolume: volume.slice(-16) };
  }

  /** Histórico de cargas de um exercício (gráfico + tabela). */
  async exerciseHistory(t: TenantAccess, id: string, exerciseId: string) {
    const studentLinkId = await this.resolve(t, id);
    const logs = await this.prisma.tenant(t.tenantId).sessionSetLog.findMany({
      where: { exerciseId, session: { studentLinkId, deletedAt: null }, deletedAt: null },
      orderBy: [{ session: { startedAt: 'desc' } }, { setOrder: 'asc' }],
      select: {
        setOrder: true,
        reps: true,
        loadKg: true,
        completed: true,
        skipped: true,
        session: { select: { id: true, startedAt: true } },
      },
      take: 1000,
    });
    const sessions = new Map<
      string,
      { date: Date; sets: { setOrder: number; reps: number | null; loadKg: number | null }[] }
    >();
    for (const l of logs) {
      const s = sessions.get(l.session.id) ?? { date: l.session.startedAt, sets: [] };
      s.sets.push({
        setOrder: l.setOrder,
        reps: l.reps,
        loadKg: l.loadKg === null ? null : Number(l.loadKg),
      });
      sessions.set(l.session.id, s);
    }
    return { sessions: [...sessions.entries()].map(([sessionId, s]) => ({ sessionId, ...s })) };
  }

  async addMeasurement(t: TenantAccess, id: string, dto: z.infer<typeof MeasurementInputSchema>) {
    const studentLinkId = await this.resolve(t, id);
    return this.prisma.tenant(t.tenantId).bodyMeasurement.create({
      data: {
        studentLinkId,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
        source: t.role === 'ALUNO' ? 'STUDENT' : 'MANUAL',
        weightKg: dto.weightKg ?? null,
        bodyFatPct: dto.bodyFatPct ?? null,
        measures: dto.measures,
      } as never,
    });
  }

  async photos(t: TenantAccess, id: string) {
    const studentLinkId = await this.resolve(t, id);
    const photos = await this.prisma.tenant(t.tenantId).progressPhoto.findMany({
      where: { studentLinkId, deletedAt: null },
      orderBy: { takenAt: 'desc' },
    });
    const media = await this.prisma
      .tenant(t.tenantId)
      .media.findMany({ where: { id: { in: photos.map((p) => p.mediaId) }, status: 'READY' } });
    const urls = new Map<string, { url: string; thumbnail: string | null }>();
    for (const m of media) {
      const v = (m.variants ?? {}) as Record<string, { key: string }>;
      urls.set(m.id, {
        url: await this.storage.presignGet(v.webp?.key ?? m.storageKey, SIGNED_URL_TTL_SECONDS),
        thumbnail: v.thumbnail
          ? await this.storage.presignGet(v.thumbnail.key, SIGNED_URL_TTL_SECONDS)
          : null,
      });
    }
    return photos.map((p) => ({
      ...p,
      ...(urls.get(p.mediaId) ?? { url: null, thumbnail: null }),
    }));
  }

  async addPhoto(t: TenantAccess, id: string, dto: z.infer<typeof ProgressPhotoInputSchema>) {
    const studentLinkId = await this.resolve(t, id);
    const media = await this.prisma.tenant(t.tenantId).media.findFirst({
      where: { id: dto.mediaId, purpose: 'progress_photo', studentLinkId, deletedAt: null },
    });
    if (!media)
      throw badRequest('Foto inválida: envie com purpose progress_photo para este aluno.');
    return this.prisma.tenant(t.tenantId).progressPhoto.create({
      data: {
        studentLinkId,
        mediaId: dto.mediaId,
        view: dto.view ?? null,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date(),
        notes: dto.notes ?? null,
      } as never,
    });
  }
}

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** :studentLinkId = "me" para o próprio aluno. */
  @Get(':studentLinkId')
  @Can('read', 'progress')
  @RequireFeature('progress.charts')
  overview(@CurrentTenant() t: TenantAccess, @Param('studentLinkId') id: string) {
    return this.progress.overview(t, id);
  }

  @Get(':studentLinkId/exercise')
  @Can('read', 'progress')
  exercise(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId') id: string,
    @Query() q: ExerciseQueryDto,
  ) {
    return this.progress.exerciseHistory(t, id, q.exerciseId);
  }

  @Post(':studentLinkId/measurements')
  @Can('create', 'progress')
  measurement(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId') id: string,
    @Body() dto: MeasurementDto,
  ) {
    return this.progress.addMeasurement(t, id, dto);
  }

  @Get(':studentLinkId/photos')
  @Can('read', 'progress')
  @RequireFeature('progress.photos')
  photos(@CurrentTenant() t: TenantAccess, @Param('studentLinkId') id: string) {
    return this.progress.photos(t, id);
  }

  @Post(':studentLinkId/photos')
  @Can('create', 'progress')
  @RequireFeature('progress.photos')
  addPhoto(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId') id: string,
    @Body() dto: PhotoDto,
  ) {
    return this.progress.addPhoto(t, id, dto);
  }
}

export { ParseUUIDPipe };
