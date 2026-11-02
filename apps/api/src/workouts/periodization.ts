import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Put,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PeriodizationInputSchema, type PeriodizationInput } from '@vetta/contracts';
import {
  applyAdjustment,
  InvalidProgressionError,
  locateWeek,
  parseReps,
  phaseCalendar,
  weekAdjustment,
  type ProgressionRule,
  type WeekAdjustment,
} from '@vetta/fitness';
import { localDate, toDateOnly } from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import { badRequest, notFound } from '../common/errors';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { assertStudentInScope, studentScope } from '../common/scope';
import { PrismaService } from '../infra/prisma.service';

class PeriodizationDto extends createZodDto(PeriodizationInputSchema) {}
class ListQueryDto extends createZodDto(z.object({ studentLinkId: z.uuid().optional() })) {}

interface SetLike {
  type?: string;
  reps?: string | null;
  targetLoadKg?: unknown;
  [k: string]: unknown;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Ajusta as séries de trabalho de um exercício conforme a semana da periodização. */
export function adjustSets<T extends SetLike>(
  sets: T[],
  adj: WeekAdjustment,
  rule: ProgressionRule,
): T[] {
  const work = sets.filter((s) => (s.type ?? 'WORK') === 'WORK');
  if (!work.length) return sets;
  const first = work[0]!;
  const range = parseReps(first.reps ?? null);
  const target = applyAdjustment(
    {
      sets: work.length,
      repsMin: range?.min ?? null,
      repsMax: range?.max ?? null,
      loadKg: num(first.targetLoadKg),
    },
    adj,
    rule,
  );
  const reps =
    range && target.repsMin !== null
      ? target.repsMin === target.repsMax
        ? String(target.repsMin)
        : `${target.repsMin}-${target.repsMax}`
      : (first.reps ?? null);
  const scaled = work.map((s) => {
    const load = num(s.targetLoadKg);
    return {
      ...s,
      reps: range ? reps : s.reps,
      targetLoadKg:
        load === null
          ? null
          : applyAdjustment({ sets: 1, repsMin: null, repsMax: null, loadKg: load }, adj, rule)
              .loadKg,
    };
  });
  const resized =
    target.sets <= scaled.length
      ? scaled.slice(0, target.sets)
      : [
          ...scaled,
          ...Array.from({ length: target.sets - scaled.length }, (_, i) => ({
            ...scaled[scaled.length - 1]!,
            id: `${String(scaled[scaled.length - 1]!.id)}+${i + 1}`,
          })),
        ];
  return [...sets.filter((s) => (s.type ?? 'WORK') !== 'WORK'), ...resized] as T[];
}

@Injectable()
export class PeriodizationService {
  constructor(private readonly prisma: PrismaService) {}

  private validate(dto: PeriodizationInput) {
    try {
      for (const p of dto.phases) weekAdjustment(p.progression, 1);
      phaseCalendar(dto.startsOn, dto.phases);
    } catch (err) {
      if (err instanceof InvalidProgressionError) throw badRequest(err.message);
      throw err;
    }
  }

  private async assertPrograms(t: TenantAccess, dto: PeriodizationInput) {
    const ids = dto.phases.map((p) => p.programId).filter((x): x is string => !!x);
    if (!ids.length) return;
    const found = await this.prisma.tenant(t.tenantId).workoutProgram.count({
      where: {
        id: { in: ids },
        deletedAt: null,
        OR: [{ studentLinkId: dto.studentLinkId }, { studentLinkId: null }],
      },
    });
    if (found !== new Set(ids).size)
      throw badRequest('Programa de alguma fase não pertence a este aluno.');
  }

  async list(t: TenantAccess, studentLinkId?: string) {
    return this.prisma.tenant(t.tenantId).periodization.findMany({
      where: {
        deletedAt: null,
        studentLink: studentScope(t),
        ...(studentLinkId ? { studentLinkId } : {}),
      },
      include: {
        phases: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        studentLink: { select: { displayName: true } },
      },
      orderBy: { startsOn: 'desc' },
    });
  }

  async get(t: TenantAccess, id: string) {
    const p = await this.prisma.tenant(t.tenantId).periodization.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
      include: {
        phases: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: { program: { select: { id: true, name: true, status: true } } },
        },
        studentLink: { select: { displayName: true } },
        tenant: { select: { timezone: true } },
      },
    });
    if (!p) throw notFound('Periodização não encontrada.');
    const startsOn = toDateOnly(p.startsOn);
    const spans = phaseCalendar(startsOn, p.phases);
    const today = localDate(new Date(), p.tenant.timezone);
    const current = locateWeek(startsOn, p.phases, today);
    return {
      id: p.id,
      studentLinkId: p.studentLinkId,
      studentName: p.studentLink.displayName,
      name: p.name,
      goal: p.goal,
      model: p.model,
      startsOn,
      endsOn: p.endsOn ? toDateOnly(p.endsOn) : null,
      isActive: p.isActive,
      activePhaseId: p.activePhaseId,
      current,
      /** Calendário visual: fases e semanas com o ajuste de cada semana. */
      phases: p.phases.map((ph, i) => {
        const rule = ph.progression as unknown as ProgressionRule;
        return {
          id: ph.id,
          name: ph.name,
          focus: ph.focus,
          weeks: ph.weeks,
          program: ph.program,
          progression: rule,
          startsOn: spans[i]!.startsOn,
          endsOn: spans[i]!.endsOn,
          schedule: Array.from({ length: ph.weeks }, (_, w) => {
            const adj = weekAdjustment(rule, w + 1);
            return {
              week: w + 1,
              startsOn: new Date(Date.parse(`${spans[i]!.startsOn}T00:00:00Z`) + w * 7 * 86_400_000)
                .toISOString()
                .slice(0, 10),
              loadPct: Math.round((adj.loadFactor - 1) * 1000) / 10,
              repsDelta: adj.repsDelta,
              setsDelta: adj.setsDelta,
              deload: adj.deload,
            };
          }),
        };
      }),
    };
  }

  async save(t: TenantAccess, dto: PeriodizationInput, id?: string) {
    await assertStudentInScope(this.prisma, t, dto.studentLinkId);
    this.validate(dto);
    await this.assertPrograms(t, dto);
    const db = this.prisma.tenant(t.tenantId);
    const spans = phaseCalendar(dto.startsOn, dto.phases);
    const endsOn = new Date(`${spans[spans.length - 1]!.endsOn}T00:00:00Z`);
    const result = await db.$transaction(async (tx) => {
      let pid = id;
      if (id) {
        const existing = await tx.periodization.findFirst({ where: { id, deletedAt: null } });
        if (!existing) throw notFound('Periodização não encontrada.');
        await tx.periodization.update({
          where: { id },
          data: {
            name: dto.name,
            goal: dto.goal ?? null,
            model: dto.model,
            startsOn: new Date(dto.startsOn),
            endsOn,
            activePhaseId: null,
            isActive: true,
          },
        });
        await tx.periodizationPhase.updateMany({
          where: { periodizationId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      } else {
        // Uma periodização ativa por aluno: a nova substitui a anterior.
        await tx.periodization.updateMany({
          where: { studentLinkId: dto.studentLinkId, isActive: true },
          data: { isActive: false },
        });
        pid = (
          await tx.periodization.create({
            data: {
              studentLinkId: dto.studentLinkId,
              name: dto.name,
              goal: dto.goal ?? null,
              model: dto.model,
              startsOn: new Date(dto.startsOn),
              endsOn,
            } as never,
          })
        ).id;
      }
      await tx.periodizationPhase.createMany({
        data: dto.phases.map((ph, i) => ({
          tenantId: t.tenantId,
          periodizationId: pid!,
          name: ph.name,
          focus: ph.focus ?? null,
          weeks: ph.weeks,
          programId: ph.programId ?? null,
          progression: ph.progression,
          sortOrder: i,
        })) as never,
      });
      return pid!;
    });
    return this.get(t, result);
  }

  async remove(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const p = await db.periodization.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
    });
    if (!p) throw notFound('Periodização não encontrada.');
    await db.periodization.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true as const };
  }

  /** Semana atual da periodização ativa do aluno para o programa, se houver. */
  async weekFor(tenantId: string, studentLinkId: string, programId: string) {
    const p = await this.prisma.tenant(tenantId).periodization.findFirst({
      where: { studentLinkId, isActive: true, deletedAt: null },
      include: {
        phases: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        tenant: { select: { timezone: true } },
      },
    });
    if (!p) return null;
    const loc = locateWeek(
      toDateOnly(p.startsOn),
      p.phases,
      localDate(new Date(), p.tenant.timezone),
    );
    if (!loc) return null;
    const phase = p.phases[loc.phaseIndex]!;
    if (phase.programId !== programId) return null;
    const rule = phase.progression as unknown as ProgressionRule;
    return {
      periodization: p.name,
      phase: phase.name,
      week: loc.week,
      overallWeek: loc.overallWeek,
      rule,
      adj: weekAdjustment(rule, loc.week),
    };
  }
}

@ApiTags('workouts')
@Controller('periodizations')
export class PeriodizationController {
  constructor(private readonly service: PeriodizationService) {}

  @Get()
  @Can('read', 'workouts')
  @RequireFeature('workouts.periodization')
  list(@CurrentTenant() t: TenantAccess, @Query() q: ListQueryDto) {
    return this.service.list(t, q.studentLinkId);
  }

  @Post()
  @Can('create', 'workouts')
  @RequireFeature('workouts.periodization')
  create(@CurrentTenant() t: TenantAccess, @Body() dto: PeriodizationDto) {
    return this.service.save(t, dto);
  }

  @Get(':id')
  @Can('read', 'workouts')
  @RequireFeature('workouts.periodization')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(t, id);
  }

  @Put(':id')
  @Can('update', 'workouts')
  @RequireFeature('workouts.periodization')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodizationDto,
  ) {
    return this.service.save(t, dto, id);
  }

  @Delete(':id')
  @Can('delete', 'workouts')
  @RequireFeature('workouts.periodization')
  remove(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(t, id);
  }
}
