import { Inject, Injectable } from '@nestjs/common';
import { isCriticalFeedback, type SyncSessionInput } from '@vetta/contracts';
import { bestsOf, detectRecords, parseReps, suggestNext, type ExerciseBests } from '@vetta/fitness';
import type { EventPublisher } from '@vetta/server';
import { badRequest, notFound } from '../common/errors';
import type { TenantAccess } from '../common/request';
import { assertStudentInScope, requireStudent, studentScope } from '../common/scope';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { LibraryService } from '../library/library.service';
import { programInclude, type ProgramTree } from '../workouts/workouts.service';

const RECORD_LABEL = {
  MAX_LOAD: 'carga máxima',
  ONE_RM: '1RM estimado',
  MAX_VOLUME: 'volume',
} as const;

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly library: LibraryService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  /** Última execução de cada exercício (para pré-preencher carga e reps). */
  async lastPerformances(tenantId: string, studentLinkId: string, exerciseIds: string[]) {
    if (!exerciseIds.length)
      return new Map<string, { date: Date; sets: { loadKg: number; reps: number }[] }>();
    const logs = await this.prisma.tenant(tenantId).sessionSetLog.findMany({
      where: {
        exerciseId: { in: exerciseIds },
        session: { studentLinkId, deletedAt: null },
        skipped: false,
        deletedAt: null,
      },
      orderBy: [{ session: { startedAt: 'desc' } }, { setOrder: 'asc' }],
      include: { session: { select: { id: true, startedAt: true } } },
      take: 2000,
    });
    const out = new Map<
      string,
      { date: Date; sessionId: string; sets: { loadKg: number; reps: number }[] }
    >();
    for (const l of logs) {
      const cur = out.get(l.exerciseId);
      if (cur && cur.sessionId !== l.session.id) continue;
      const entry = cur ?? { date: l.session.startedAt, sessionId: l.session.id, sets: [] };
      entry.sets.push({ loadKg: Number(l.loadKg ?? 0), reps: l.reps ?? 0 });
      out.set(l.exerciseId, entry);
    }
    return out;
  }

  /** Árvore do programa + mídias + última execução + sugestão de carga (dupla progressão). */
  async enrich(tenantId: string, studentLinkId: string, p: ProgramTree) {
    const exerciseIds = [
      ...new Set(p.routines.flatMap((r) => r.exercises.map((i) => i.exerciseId))),
    ];
    const last = await this.lastPerformances(tenantId, studentLinkId, exerciseIds);
    const media = new Map(
      (
        await this.library.withMedia(p.routines.flatMap((r) => r.exercises.map((i) => i.exercise)))
      ).map((e) => [e.id, e.media]),
    );
    return {
      ...p,
      routines: p.routines.map((r) => ({
        ...r,
        exercises: r.exercises.map((i) => {
          const prev = last.get(i.exerciseId);
          const target = parseReps(i.sets.find((s) => s.type === 'WORK')?.reps ?? null);
          return {
            ...i,
            exercise: { ...i.exercise, media: media.get(i.exerciseId) ?? null },
            lastPerformance: prev ? { date: prev.date, sets: prev.sets } : null,
            suggestion: prev && target ? suggestNext({ lastSets: prev.sets, target }) : null,
          };
        }),
      })),
    };
  }

  /** Treino do dia: programa principal ativo (próxima rotina em rodízio) + extras válidos. */
  async today(t: TenantAccess) {
    const studentLinkId = requireStudent(t);
    const db = this.prisma.tenant(t.tenantId);
    const todayIso = new Date().toISOString().slice(0, 10);
    const programs = await db.workoutProgram.findMany({
      where: {
        studentLinkId,
        status: 'ACTIVE',
        deletedAt: null,
        OR: [{ isExtra: false }, { endsOn: null }, { endsOn: { gte: new Date(todayIso) } }],
      },
      include: programInclude,
      orderBy: [{ isExtra: 'asc' }, { publishedAt: 'desc' }],
    });
    const out = [];
    for (const p of programs) {
      const last = await db.workoutSession.findFirst({
        where: { studentLinkId, programId: p.id, deletedAt: null },
        orderBy: { startedAt: 'desc' },
        select: { routineId: true, startedAt: true },
      });
      const idx = last?.routineId ? p.routines.findIndex((r) => r.id === last.routineId) : -1;
      const next = p.routines.length ? p.routines[(idx + 1) % p.routines.length]! : null;
      out.push({
        ...(await this.enrich(t.tenantId, studentLinkId, p)),
        nextRoutineId: next?.id ?? null,
        lastSessionAt: last?.startedAt ?? null,
      });
    }
    return { programs: out };
  }

  /**
   * Sincroniza uma sessão (do app, inclusive offline, ou do link público).
   * Idempotente por clientSessionId: reenviar não duplica.
   */
  async sync(
    tenantId: string,
    studentLinkId: string,
    actorUserId: string | null,
    dto: SyncSessionInput,
  ) {
    const db = this.prisma.tenant(tenantId);
    const existing = await db.workoutSession.findFirst({
      where: { clientId: dto.clientSessionId },
    });
    if (existing) return { sessionId: existing.id, duplicated: true, records: [] };

    let routineLabel = '';
    let programName = 'Treino';
    if (dto.programId) {
      const p = await db.workoutProgram.findFirst({
        where: { id: dto.programId, studentLinkId },
        select: { name: true },
      });
      if (!p) throw notFound('Treino não encontrado.');
      programName = p.name;
    }
    if (dto.routineId) {
      const r = await db.workoutRoutine.findFirst({
        where: { id: dto.routineId, ...(dto.programId ? { programId: dto.programId } : {}) },
      });
      if (!r) throw badRequest('Rotina não pertence ao treino.');
      routineLabel = r.label;
    }
    const startedAt = new Date(dto.startedAt);
    const finishedAt = new Date(dto.finishedAt);
    if (finishedAt < startedAt) throw badRequest('Fim antes do início.');
    const exerciseIds = [...new Set(dto.sets.map((s) => s.exerciseId))];
    const exercises = await db.exercise.findMany({
      where: { id: { in: exerciseIds } },
      select: { id: true, name: true },
    });
    if (exercises.length !== exerciseIds.length) throw badRequest('Exercício inválido na sessão.');
    const done = dto.sets.filter((s) => s.completed && !s.skipped);
    const volume = done.reduce((a, s) => a + (s.loadKg ?? 0) * (s.reps ?? 0), 0);
    const critical = isCriticalFeedback(dto.feedback);

    // Recordes: compara com as melhores marcas históricas (tabela personal_records).
    const prevRecords = await db.personalRecord.groupBy({
      by: ['exerciseId', 'type'],
      where: { studentLinkId, exerciseId: { in: exerciseIds }, deletedAt: null },
      _max: { value: true },
    });
    const bests = new Map<string, ExerciseBests>();
    for (const r of prevRecords) {
      const b = bests.get(r.exerciseId) ?? { maxLoadKg: 0, bestOneRmKg: 0, maxSessionVolumeKg: 0 };
      const v = Number(r._max.value ?? 0);
      if (r.type === 'MAX_LOAD') b.maxLoadKg = v;
      if (r.type === 'ONE_RM') b.bestOneRmKg = v;
      if (r.type === 'MAX_VOLUME') b.maxSessionVolumeKg = v;
      bests.set(r.exerciseId, b);
    }
    const records = exerciseIds.flatMap((exerciseId) => {
      const sets = done
        .filter((s) => s.exerciseId === exerciseId)
        .map((s) => ({ loadKg: s.loadKg ?? 0, reps: s.reps ?? 0 }));
      if (!bestsOf(sets).maxLoadKg) return [];
      return detectRecords(bests.get(exerciseId) ?? null, sets).map((r) => ({ ...r, exerciseId }));
    });

    const session = await db.$tenantTransaction(
      async (tx) => {
        const s = await tx.workoutSession.create({
          data: {
            studentLinkId,
            programId: dto.programId ?? null,
            routineId: dto.routineId ?? null,
            clientId: dto.clientSessionId,
            startedAt,
            finishedAt,
            durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
            rating: dto.feedback.rating,
            perceivedEffort: dto.feedback.perceivedEffort,
            hasPain: dto.feedback.hasPain,
            painLocation: dto.feedback.painLocation ?? null,
            feedback: dto.feedback.comment ?? null,
            totalVolumeKg: Math.round(volume * 10) / 10,
            critical,
          } as never,
        });
        if (dto.sets.length) {
          await tx.sessionSetLog.createMany({
            data: dto.sets.map((l) => ({
              sessionId: s.id,
              routineExerciseId: l.routineExerciseId ?? null,
              exerciseId: l.exerciseId,
              setOrder: l.setOrder,
              reps: l.reps ?? null,
              loadKg: l.loadKg ?? null,
              durationSeconds: l.durationSeconds ?? null,
              distanceMeters: l.distanceMeters ?? null,
              rpe: l.rpe ?? null,
              completed: l.completed,
              skipped: l.skipped,
              notes: l.notes ?? null,
            })) as never,
          });
        }
        if (records.length) {
          await tx.personalRecord.createMany({
            data: records.map((r) => ({
              studentLinkId,
              exerciseId: r.exerciseId,
              sessionId: s.id,
              type: r.type,
              value: r.value,
              achievedAt: finishedAt,
            })) as never,
          });
        }
        await tx.studentLink.update({
          where: { id: studentLinkId },
          data: {
            lastWorkoutAt: finishedAt,
            lastActivityAt: new Date(),
            inactivityNotifiedAt: null,
          },
        });
        return s;
      },
      { timeout: 30_000 },
    );

    const link = await db.studentLink.findFirstOrThrow({
      where: { id: studentLinkId },
      select: { displayName: true, userId: true },
    });
    const workoutName = routineLabel ? `${programName} · ${routineLabel}` : programName;
    const base = {
      studentLinkId,
      sessionId: session.id,
      studentName: link.displayName,
      workoutName,
    };
    await this.events.publish('workout.completed', {
      tenantId,
      actorId: actorUserId,
      payload: base,
    });
    if (critical) {
      await this.events.publish('feedback.critical', {
        tenantId,
        actorId: actorUserId,
        payload: {
          ...base,
          rating: dto.feedback.rating,
          painText: dto.feedback.hasPain
            ? ` e relatou dor${dto.feedback.painLocation ? ` (${dto.feedback.painLocation})` : ''}`
            : '',
        },
      });
    }
    const names = new Map(exercises.map((e) => [e.id, e.name]));
    const recordsOut = records.map((r) => ({ ...r, exerciseName: names.get(r.exerciseId) ?? '' }));
    if (recordsOut.length && link.userId) {
      const first = recordsOut[0]!;
      await this.events.publish('record.achieved', {
        tenantId,
        payload: {
          userId: link.userId,
          exerciseName: first.exerciseName,
          recordText: `${RECORD_LABEL[first.type]} de ${first.value} kg${recordsOut.length > 1 ? ` (+${recordsOut.length - 1} recordes)` : ''}`,
        },
      });
    }
    return { sessionId: session.id, duplicated: false, records: recordsOut };
  }

  async history(t: TenantAccess, studentLinkId: string, limit = 50) {
    if (t.role === 'ALUNO') studentLinkId = requireStudent(t);
    else await assertStudentInScope(this.prisma, t, studentLinkId);
    return this.prisma.tenant(t.tenantId).workoutSession.findMany({
      where: { studentLinkId, deletedAt: null },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        routine: { select: { label: true, name: true } },
        program: { select: { name: true } },
        setLogs: {
          include: { exercise: { select: { name: true } } },
          orderBy: [{ exerciseId: 'asc' }, { setOrder: 'asc' }],
        },
      },
    });
  }

  async records(t: TenantAccess, studentLinkId: string) {
    if (t.role === 'ALUNO') studentLinkId = requireStudent(t);
    else await assertStudentInScope(this.prisma, t, studentLinkId);
    const rows = await this.prisma.tenant(t.tenantId).personalRecord.findMany({
      where: { studentLinkId, deletedAt: null },
      orderBy: { achievedAt: 'desc' },
      include: { exercise: { select: { name: true } } },
    });
    const best = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const k = `${r.exerciseId}:${r.type}`;
      if (!best.has(k) || Number(r.value) > Number(best.get(k)!.value)) best.set(k, r);
    }
    return [...best.values()];
  }

  // ─── Caixa de feedbacks (personal) ───────────────────────────────────────

  feedbacks(t: TenantAccess, unreadOnly: boolean) {
    return this.prisma.tenant(t.tenantId).workoutSession.findMany({
      where: {
        deletedAt: null,
        rating: { not: null },
        studentLink: studentScope(t),
        ...(unreadOnly ? { feedbackReadAt: null } : {}),
      },
      orderBy: [{ critical: 'desc' }, { finishedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        finishedAt: true,
        rating: true,
        perceivedEffort: true,
        hasPain: true,
        painLocation: true,
        feedback: true,
        critical: true,
        feedbackReadAt: true,
        totalVolumeKg: true,
        studentLink: { select: { id: true, displayName: true } },
        routine: { select: { label: true, name: true } },
        program: { select: { name: true } },
      },
    });
  }

  async markRead(t: TenantAccess, sessionId: string) {
    const s = await this.prisma
      .tenant(t.tenantId)
      .workoutSession.findFirst({ where: { id: sessionId, studentLink: studentScope(t) } });
    if (!s) throw notFound('Feedback não encontrado.');
    await this.prisma
      .tenant(t.tenantId)
      .workoutSession.update({ where: { id: sessionId }, data: { feedbackReadAt: new Date() } });
    return { ok: true as const };
  }

  /** Resposta ao feedback vira mensagem no chat do aluno. */
  async reply(t: TenantAccess, userId: string, sessionId: string, message: string) {
    const db = this.prisma.tenant(t.tenantId);
    const s = await db.workoutSession.findFirst({
      where: { id: sessionId, studentLink: studentScope(t) },
      include: { studentLink: { select: { id: true, userId: true } } },
    });
    if (!s) throw notFound('Feedback não encontrado.');
    const conversation =
      (await db.conversation.findFirst({ where: { studentLinkId: s.studentLinkId } })) ??
      (await db.conversation.create({ data: { studentLinkId: s.studentLinkId } as never }));
    const msg = await db.message.create({
      data: {
        conversationId: conversation.id,
        senderUserId: userId,
        type: 'TEXT',
        body: message,
      } as never,
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), staffLastReadAt: new Date() },
    });
    await db.workoutSession.update({
      where: { id: sessionId },
      data: { feedbackReadAt: new Date() },
    });
    const sender = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    if (s.studentLink.userId) {
      await this.events.publish('chat.message_created', {
        tenantId: t.tenantId,
        actorId: userId,
        payload: {
          userIds: [s.studentLink.userId],
          conversationId: conversation.id,
          senderName: sender.name,
          preview: message.slice(0, 120),
        },
      });
    }
    return { messageId: msg.id, conversationId: conversation.id };
  }
}
