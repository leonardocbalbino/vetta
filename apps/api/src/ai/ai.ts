import { Body, Controller, Get, Inject, Injectable, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  normalizeText,
  AiLoadRequestSchema,
  AiProgramRequestSchema,
  AiWeeklySummaryRequestSchema,
  type AiProgramDraft,
  type AiProgramRequest,
  type ProgramInput,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import {
  AiError,
  loadSuggestionTask,
  minimizeStudent,
  programTask,
  weeklySummaryTask,
  type AiProvider,
  type AiTask,
  type AiUsage,
  type LibraryAccess,
  type LoadHistoryItem,
  type MinimizedStudent,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AdminOnly, AssertLimit, Can, RequireFeature, Roles } from '../access/decorators';
import { integrationFailed, integrationNotConfigured } from '../common/errors';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { assertStudentInScope } from '../common/scope';
import { EntitlementsService, monthStartSaoPaulo } from '../entitlements/entitlements.service';
import { AI } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { WorkoutsService } from '../workouts/workouts.service';

class ProgramRequestDto extends createZodDto(AiProgramRequestSchema) {}
class LoadRequestDto extends createZodDto(AiLoadRequestSchema) {}
class SummaryRequestDto extends createZodDto(AiWeeklySummaryRequestSchema) {}
class UsageQueryDto extends createZodDto(
  z.object({ months: z.coerce.number().int().min(1).max(12).default(3) }),
) {}

type Kind = 'PROGRAM' | 'LOAD_SUGGESTION' | 'WEEKLY_SUMMARY';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Converte a saída da IA no formato do construtor (justificativas vão para as notas). */
export function draftToProgramInput(draft: AiProgramDraft): ProgramInput {
  return {
    name: draft.name,
    goal: draft.goal || null,
    description: `Gerado pela IA (revise antes de publicar). ${draft.rationale}`,
    routines: draft.routines.map((r) => ({
      label: r.label,
      name: r.name || null,
      notes: `IA: ${r.rationale}`,
      items: r.items.map((i) => ({
        exerciseId: i.exerciseId,
        method: i.method,
        groupId: i.groupId,
        restSeconds: i.restSeconds,
        notes: `IA: ${i.rationale}`,
        sets: i.sets.map((s) => ({
          type: s.type,
          reps: s.reps,
          targetLoadKg: s.targetLoadKg,
          durationSeconds: s.durationSeconds,
          rpe: s.rpe,
          rir: s.rir,
        })),
      })),
    })),
  };
}

@Injectable()
export class AiService {
  constructor(
    @Inject(AI) private readonly ai: AiProvider,
    private readonly prisma: PrismaService,
    private readonly workouts: WorkoutsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Biblioteca visível ao tenant (própria + global), única fonte de exercícios da IA. */
  library(tenantId: string): LibraryAccess {
    const db = this.prisma.tenant(tenantId);
    const visible: Prisma.ExerciseWhereInput = {
      deletedAt: null,
      isActive: true,
      OR: [{ tenantId }, { tenantId: null }],
    };
    return {
      search: async ({ query, muscle, equipment, limit }) => {
        const and: Prisma.ExerciseWhereInput[] = [visible];
        for (const term of normalizeText(query).split(' ').filter(Boolean))
          and.push({ searchText: { contains: term } });
        if (muscle) {
          const m = muscle.toLowerCase();
          and.push({ OR: [{ primaryMuscles: { has: m } }, { secondaryMuscles: { has: m } }] });
        }
        if (equipment) and.push({ equipment: { has: equipment.toLowerCase() } });
        const rows = await db.exercise.findMany({
          where: { AND: and },
          take: limit,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            category: true,
            level: true,
            primaryMuscles: true,
            equipment: true,
          },
        });
        return rows;
      },
      existing: async (ids) => {
        const valid = ids.filter((id) => z.uuid().safeParse(id).success);
        const rows = await db.exercise.findMany({
          where: { ...visible, id: { in: valid } },
          select: { id: true },
        });
        return new Set(rows.map((r) => r.id));
      },
    };
  }

  /** Dados do aluno minimizados (sem nome, contatos ou documentos). */
  async studentContext(
    t: TenantAccess,
    studentLinkId: string,
    opts: { anamnesis: boolean; loads: boolean },
  ): Promise<MinimizedStudent> {
    const link = await assertStudentInScope(this.prisma, t, studentLinkId);
    const db = this.prisma.tenant(t.tenantId);
    const anamnesis: { question: string; answer: string }[] = [];
    if (opts.anamnesis) {
      const responses = await db.anamnesisResponse.findMany({
        where: { studentLinkId, status: 'ANSWERED', deletedAt: null },
        orderBy: { answeredAt: 'desc' },
        take: 3,
        include: { template: { select: { schema: true } } },
      });
      for (const r of responses) {
        const questions =
          (r.template.schema as { questions?: { id: string; label: string }[] }).questions ?? [];
        const answers = r.answers as Record<string, unknown>;
        for (const q of questions) {
          const a = answers[q.id];
          if (a === undefined || a === null || a === '') continue;
          anamnesis.push({
            question: q.label,
            answer: Array.isArray(a)
              ? a.join(', ')
              : typeof a === 'object'
                ? JSON.stringify(a)
                : String(a),
          });
        }
      }
    }
    const loads = opts.loads ? await this.loadSummary(t.tenantId, studentLinkId) : [];
    return minimizeStudent({
      name: link.displayName,
      birthDate: link.birthDate,
      sex: link.sex,
      anamnesis,
      injuries: [link.injuries, link.restrictions].filter(Boolean).join('. ') || null,
      loads,
    });
  }

  private async loadSummary(tenantId: string, studentLinkId: string) {
    const db = this.prisma.tenant(tenantId);
    const logs = await db.sessionSetLog.findMany({
      where: {
        session: { studentLinkId, deletedAt: null },
        deletedAt: null,
        skipped: false,
        createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 800,
      select: {
        exerciseId: true,
        sessionId: true,
        reps: true,
        loadKg: true,
        exercise: { select: { name: true } },
      },
    });
    const by = new Map<
      string,
      {
        name: string;
        last: number | null;
        best: number | null;
        reps: string | null;
        sessions: Set<string>;
      }
    >();
    for (const l of logs) {
      const load = num(l.loadKg);
      const cur = by.get(l.exerciseId) ?? {
        name: l.exercise.name,
        last: load,
        best: null,
        reps: l.reps?.toString() ?? null,
        sessions: new Set(),
      };
      cur.best = load !== null && (cur.best === null || load > cur.best) ? load : cur.best;
      cur.sessions.add(l.sessionId);
      by.set(l.exerciseId, cur);
    }
    return [...by.entries()].map(([exerciseId, v]) => ({
      exerciseId,
      exerciseName: v.name,
      lastLoadKg: v.last,
      bestLoadKg: v.best,
      lastReps: v.reps,
      sessions: v.sessions.size,
    }));
  }

  /** Executa a tarefa e registra uso e custo (sucesso ou falha). */
  private async run<T>(
    t: TenantAccess,
    kind: Kind,
    studentLinkId: string | null,
    task: AiTask<T>,
  ): Promise<{ output: T; generationId: string; usage: AiUsage }> {
    const record = (status: 'SUCCEEDED' | 'FAILED', usage: AiUsage | null, extra: object) =>
      this.prisma.tenant(t.tenantId).aiGeneration.create({
        data: {
          memberId: t.memberId,
          studentLinkId,
          kind,
          status,
          provider: usage?.provider ?? this.ai.name,
          model: usage?.model ?? this.ai.model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          cacheReadTokens: usage?.cacheReadTokens ?? 0,
          cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
          costMicroUsd: usage?.costMicroUsd ?? 0,
          durationMs: usage?.durationMs ?? 0,
          toolCalls: usage?.toolCalls ?? 0,
          ...extra,
        } as never,
      });
    try {
      const { output, usage } = await this.ai.run(task);
      const g = await record('SUCCEEDED', usage, kind === 'PROGRAM' ? {} : { output });
      return { output, usage, generationId: g.id };
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      if (e.code === 'NOT_CONFIGURED')
        throw integrationNotConfigured(
          'A IA de treino não está configurada neste ambiente.',
          'AI_NOT_CONFIGURED',
        );
      await record('FAILED', e.usage, { error: `${e.code}: ${e.message}` });
      throw integrationFailed(
        e.code === 'REFUSED'
          ? 'A IA não conseguiu atender este pedido. Ajuste o texto e tente de novo.'
          : 'A IA não conseguiu montar um resultado válido. Tente de novo.',
        'AI_FAILED',
        { reason: e.code },
      );
    }
  }

  /** Gera um programa e salva como RASCUNHO: publicar continua sendo ação do personal. */
  async generateProgram(t: TenantAccess, req: AiProgramRequest) {
    const studentLinkId = req.studentLinkId ?? null;
    const student = studentLinkId
      ? await this.studentContext(t, studentLinkId, {
          anamnesis: req.useAnamnesis,
          loads: req.useLoadHistory,
        })
      : null;
    const library = this.library(t.tenantId);
    const { output, usage, generationId } = await this.run(
      t,
      'PROGRAM',
      studentLinkId,
      programTask(req, student, library),
    );
    const program = await this.workouts.create(t, {
      ...draftToProgramInput(output),
      studentLinkId,
      isTemplate: !studentLinkId,
      isExtra: false,
      publish: false,
    });
    await this.prisma.tenant(t.tenantId).$transaction([
      this.prisma.tenant(t.tenantId).workoutProgram.update({
        where: { id: program.id },
        data: { aiGenerated: true },
      }),
      this.prisma.tenant(t.tenantId).aiGeneration.update({
        where: { id: generationId },
        data: { programId: program.id, output: output as object },
      }),
    ]);
    return {
      generationId,
      programId: program.id,
      status: 'DRAFT' as const,
      draft: output,
      usage: { costMicroUsd: usage.costMicroUsd, model: usage.model },
    };
  }

  private async loadHistory(t: TenantAccess, studentLinkId: string): Promise<LoadHistoryItem[]> {
    const db = this.prisma.tenant(t.tenantId);
    const program = await db.workoutProgram.findFirst({
      where: { studentLinkId, status: 'ACTIVE', isExtra: false, deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      include: {
        routines: {
          where: { deletedAt: null },
          include: {
            exercises: {
              where: { deletedAt: null },
              include: {
                exercise: { select: { name: true } },
                sets: { where: { deletedAt: null } },
              },
            },
          },
        },
      },
    });
    if (!program) return [];
    const items = program.routines.flatMap((r) => r.exercises);
    const logs = await db.sessionSetLog.findMany({
      where: {
        exerciseId: { in: items.map((i) => i.exerciseId) },
        session: { studentLinkId, deletedAt: null, finishedAt: { not: null } },
        deletedAt: null,
        skipped: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 600,
      include: { session: { select: { startedAt: true } } },
    });
    return items.slice(0, 30).map((i) => {
      const mine = logs.filter((l) => l.exerciseId === i.exerciseId);
      const bySession = new Map<string, LoadHistoryItem['recent'][number]>();
      for (const l of mine) {
        const key = l.sessionId;
        const entry = bySession.get(key) ?? {
          date: l.session.startedAt.toISOString().slice(0, 10),
          sets: [],
        };
        entry.sets.push({ reps: l.reps, loadKg: num(l.loadKg), rpe: num(l.rpe) });
        bySession.set(key, entry);
      }
      return {
        exerciseId: i.exerciseId,
        exerciseName: i.exercise.name,
        prescribed: i.sets
          .filter((s) => s.type === 'WORK')
          .map((s) => ({ reps: s.reps, targetLoadKg: num(s.targetLoadKg), rpe: num(s.rpe) })),
        recent: [...bySession.values()].slice(0, 4),
      };
    });
  }

  async suggestLoads(t: TenantAccess, studentLinkId: string) {
    const student = await this.studentContext(t, studentLinkId, { anamnesis: false, loads: false });
    const history = await this.loadHistory(t, studentLinkId);
    if (!history.length)
      return { generationId: null, summary: 'Sem treino ativo para ajustar.', suggestions: [] };
    const { output, generationId } = await this.run(
      t,
      'LOAD_SUGGESTION',
      studentLinkId,
      loadSuggestionTask(student, history),
    );
    const names = new Map(history.map((h) => [h.exerciseId, h.exerciseName]));
    return {
      generationId,
      summary: output.summary,
      suggestions: output.suggestions.map((s) => ({
        ...s,
        exerciseName: names.get(s.exerciseId) ?? null,
      })),
    };
  }

  async weeklySummary(t: TenantAccess, studentLinkId: string) {
    const student = await this.studentContext(t, studentLinkId, { anamnesis: false, loads: false });
    const db = this.prisma.tenant(t.tenantId);
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [sessions, records, weights, routines] = await Promise.all([
      db.workoutSession.findMany({
        where: { studentLinkId, deletedAt: null, startedAt: { gte: since } },
        orderBy: { startedAt: 'asc' },
        include: { routine: { select: { label: true, name: true } } },
      }),
      db.personalRecord.findMany({
        where: { studentLinkId, createdAt: { gte: since } },
        include: { exercise: { select: { name: true } } },
        take: 20,
      }),
      db.bodyMeasurement.findMany({
        where: {
          studentLinkId,
          deletedAt: null,
          measuredAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
        orderBy: { measuredAt: 'asc' },
        take: 10,
      }),
      db.workoutRoutine.count({
        where: {
          deletedAt: null,
          program: { studentLinkId, status: 'ACTIVE', isExtra: false, deletedAt: null },
        },
      }),
    ]);
    const { output, generationId } = await this.run(
      t,
      'WEEKLY_SUMMARY',
      studentLinkId,
      weeklySummaryTask(student, {
        weekStart: since.toISOString().slice(0, 10),
        plannedSessions: routines,
        completedSessions: sessions.filter((s) => s.finishedAt).length,
        sessions: sessions.map((s) => ({
          date: s.startedAt.toISOString().slice(0, 10),
          routine: s.routine
            ? `${s.routine.label}${s.routine.name ? ` ${s.routine.name}` : ''}`
            : 'Extra',
          durationMin: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
          effort: s.perceivedEffort,
          feedback: s.feedback
            ? s.feedback.slice(0, 300)
            : s.hasPain
              ? `Dor: ${s.painLocation ?? 'sim'}`
              : null,
        })),
        personalRecords: records.map((r) => ({
          exercise: r.exercise.name,
          value: Number(r.value),
          type: r.type,
        })),
        bodyWeightKg: weights
          .filter((w) => w.weightKg !== null)
          .map((w) => ({
            date: w.measuredAt.toISOString().slice(0, 10),
            value: Number(w.weightKg),
          })),
      }),
    );
    return { generationId, ...output };
  }

  async usage(t: TenantAccess) {
    const ent = await this.entitlements.resolve(t.tenantId);
    const used = await this.entitlements.usage(t.tenantId, 'workouts.ai_monthly');
    const recent = await this.prisma.tenant(t.tenantId).aiGeneration.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        kind: true,
        status: true,
        programId: true,
        studentLinkId: true,
        createdAt: true,
      },
    });
    return {
      enabled: ent.features['workouts.ai_assistant'] === true,
      used: used ?? 0,
      limit: Number(ent.features['workouts.ai_monthly'] ?? 0),
      periodStart: monthStartSaoPaulo().toISOString(),
      recent,
    };
  }

  /** Admin: uso e custo por mês, modelo e tenant. */
  async platformUsage(months: number) {
    const since = new Date(Date.now() - months * 31 * 86_400_000);
    const rows = await this.prisma.system.aiGeneration.findMany({
      where: { createdAt: { gte: since } },
      select: {
        tenantId: true,
        kind: true,
        status: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        costMicroUsd: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    });
    const byMonth = new Map<
      string,
      {
        month: string;
        generations: number;
        failed: number;
        costMicroUsd: number;
        inputTokens: number;
        outputTokens: number;
      }
    >();
    const byTenant = new Map<
      string,
      { tenantId: string; tenantName: string; generations: number; costMicroUsd: number }
    >();
    const byModel = new Map<string, { model: string; generations: number; costMicroUsd: number }>();
    for (const r of rows) {
      const month = r.createdAt.toISOString().slice(0, 7);
      const m = byMonth.get(month) ?? {
        month,
        generations: 0,
        failed: 0,
        costMicroUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      m.generations++;
      if (r.status === 'FAILED') m.failed++;
      m.costMicroUsd += r.costMicroUsd;
      m.inputTokens += r.inputTokens + r.cacheReadTokens;
      m.outputTokens += r.outputTokens;
      byMonth.set(month, m);
      const tn = byTenant.get(r.tenantId) ?? {
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        generations: 0,
        costMicroUsd: 0,
      };
      tn.generations++;
      tn.costMicroUsd += r.costMicroUsd;
      byTenant.set(r.tenantId, tn);
      const md = byModel.get(r.model) ?? { model: r.model, generations: 0, costMicroUsd: 0 };
      md.generations++;
      md.costMicroUsd += r.costMicroUsd;
      byModel.set(r.model, md);
    }
    return {
      provider: this.ai.name,
      model: this.ai.model,
      months: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)),
      topTenants: [...byTenant.values()]
        .sort((a, b) => b.costMicroUsd - a.costMicroUsd)
        .slice(0, 20),
      models: [...byModel.values()],
    };
  }
}

@ApiTags('ia')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Gera um rascunho de programa (nunca publica). */
  @Post('programs')
  @Can('create', 'workouts')
  @RequireFeature('workouts.ai_assistant')
  @AssertLimit('workouts.ai_monthly')
  generate(@CurrentTenant() t: TenantAccess, @Body() dto: ProgramRequestDto) {
    return this.ai.generateProgram(t, dto);
  }

  @Post('load-suggestions')
  @Can('update', 'workouts')
  @RequireFeature('workouts.ai_assistant')
  @AssertLimit('workouts.ai_monthly')
  loads(@CurrentTenant() t: TenantAccess, @Body() dto: LoadRequestDto) {
    return this.ai.suggestLoads(t, dto.studentLinkId);
  }

  @Post('weekly-summary')
  @Can('read', 'progress')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @RequireFeature('workouts.ai_assistant')
  @AssertLimit('workouts.ai_monthly')
  summary(@CurrentTenant() t: TenantAccess, @Body() dto: SummaryRequestDto) {
    return this.ai.weeklySummary(t, dto.studentLinkId);
  }

  @Get('usage')
  @Can('read', 'workouts')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  usage(@CurrentTenant() t: TenantAccess) {
    return this.ai.usage(t);
  }
}

@ApiTags('admin')
@Controller('admin/ai')
export class AdminAiController {
  constructor(private readonly ai: AiService) {}

  @Get('usage')
  @AdminOnly()
  usage(@Query() q: UsageQueryDto) {
    return this.ai.platformUsage(q.months);
  }
}
