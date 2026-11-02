import { Inject, Injectable } from '@nestjs/common';
import { deepLinks, type ProgramInput } from '@vetta/contracts';
import type { Prisma, TenantTransactionClient } from '@vetta/db';
import { randomToken, type EventPublisher } from '@vetta/server';
import { type ApiEnv, ENV } from '../config/env';
import { badRequest, notFound } from '../common/errors';
import type { TenantAccess } from '../common/request';
import { assertStudentInScope, studentScope } from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { StudentsAdminService } from '../students/students-admin.service';

const dateOrNull = (d?: string | null) => (d ? new Date(d) : null);

export const programInclude = {
  studentLink: { select: { id: true, displayName: true } },
  routines: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      exercises: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              category: true,
              primaryMuscles: true,
              equipment: true,
              videoMediaId: true,
              imageMediaId: true,
              gifMediaId: true,
              externalVideoUrl: true,
              instructions: true,
              tips: true,
              tenantId: true,
            },
          },
          sets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
} satisfies Prisma.WorkoutProgramInclude;

export type ProgramTree = Prisma.WorkoutProgramGetPayload<{ include: typeof programInclude }>;

/** Converte a árvore salva de volta para o formato de entrada (clonar/aplicar). */
export function treeToInput(p: ProgramTree, keepIds = false): ProgramInput {
  const num = (v: Prisma.Decimal | number | null) => (v === null ? null : Number(v));
  return {
    name: p.name,
    goal: p.goal,
    description: p.description,
    startsOn: p.startsOn?.toISOString().slice(0, 10) ?? null,
    endsOn: p.endsOn?.toISOString().slice(0, 10) ?? null,
    routines: p.routines.map((r) => ({
      ...(keepIds ? { id: r.id } : {}),
      label: r.label,
      name: r.name,
      notes: r.notes,
      items: r.exercises.map((i) => ({
        ...(keepIds ? { id: i.id } : {}),
        exerciseId: i.exerciseId,
        method: i.method,
        groupId: i.groupKey,
        restSeconds: i.restSeconds,
        notes: i.notes,
        sets: i.sets.map((s) => ({
          type: s.type,
          reps: s.reps,
          targetLoadKg: num(s.targetLoadKg),
          durationSeconds: s.durationSeconds,
          distanceMeters: s.distanceMeters,
          restSeconds: s.restSeconds,
          rpe: num(s.rpe),
          rir: s.rir,
          cadence: s.cadence,
          notes: s.notes,
        })),
      })),
    })),
  };
}

@Injectable()
export class WorkoutsService {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    @Inject(EVENTS) private readonly events: EventPublisher,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly students: StudentsAdminService,
  ) {}

  private programScope(t: TenantAccess): Prisma.WorkoutProgramWhereInput {
    if (t.role === 'ALUNO') return { studentLinkId: t.studentLinkId, status: { not: 'DRAFT' } };
    if (t.scope === 'assigned')
      return { OR: [{ studentLinkId: null }, { studentLink: studentScope(t) }] };
    return {};
  }

  async list(
    t: TenantAccess,
    q: {
      studentLinkId?: string | undefined;
      templates?: boolean | undefined;
      status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | undefined;
      q?: string | undefined;
    },
  ) {
    return this.prisma.tenant(t.tenantId).workoutProgram.findMany({
      where: {
        AND: [
          { deletedAt: null },
          this.programScope(t),
          q.studentLinkId ? { studentLinkId: q.studentLinkId } : {},
          q.templates !== undefined ? { isTemplate: q.templates } : {},
          q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } },
          q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {},
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        name: true,
        goal: true,
        status: true,
        isTemplate: true,
        isExtra: true,
        startsOn: true,
        endsOn: true,
        publishedAt: true,
        publicToken: true,
        version: true,
        updatedAt: true,
        studentLink: { select: { id: true, displayName: true } },
        _count: { select: { routines: { where: { deletedAt: null } } } },
      },
    });
  }

  async get(t: TenantAccess, id: string): Promise<ProgramTree> {
    const p = await this.prisma.tenant(t.tenantId).workoutProgram.findFirst({
      where: { AND: [{ id, deletedAt: null }, this.programScope(t)] },
      include: programInclude,
    });
    if (!p) throw notFound('Treino não encontrado.');
    return p;
  }

  /** Exercícios precisam ser da biblioteca global ou do próprio tenant. */
  private async assertExercises(tx: TenantTransactionClient, input: ProgramInput) {
    const ids = [...new Set(input.routines.flatMap((r) => r.items.map((i) => i.exerciseId)))];
    if (!ids.length) return;
    const found = await tx.exercise.count({ where: { id: { in: ids }, deletedAt: null } });
    if (found !== ids.length) throw badRequest('Algum exercício não existe ou foi removido.');
  }

  /**
   * Reconcilia rotinas e itens pelo id (mantém o histórico de execução ligado
   * ao item) e recria as séries. Tudo numa transação no contexto do tenant.
   */
  private async writeTree(tx: TenantTransactionClient, programId: string, input: ProgramInput) {
    const existing = await tx.workoutRoutine.findMany({
      where: { programId, deletedAt: null },
      include: { exercises: true },
    });
    const keepRoutines = new Set(input.routines.map((r) => r.id).filter(Boolean));
    for (const r of existing) {
      if (!keepRoutines.has(r.id))
        await tx.workoutRoutine.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
    }
    for (const [ri, r] of input.routines.entries()) {
      const prev = r.id ? existing.find((e) => e.id === r.id) : undefined;
      const routine = prev
        ? await tx.workoutRoutine.update({
            where: { id: prev.id },
            data: { label: r.label, name: r.name ?? null, notes: r.notes ?? null, sortOrder: ri },
          })
        : await tx.workoutRoutine.create({
            data: {
              programId,
              label: r.label,
              name: r.name ?? null,
              notes: r.notes ?? null,
              sortOrder: ri,
            } as never,
          });
      const prevItems = prev?.exercises.filter((x) => !x.deletedAt) ?? [];
      const keepItems = new Set(r.items.map((i) => i.id).filter(Boolean));
      for (const old of prevItems) {
        if (!keepItems.has(old.id))
          await tx.routineExercise.update({
            where: { id: old.id },
            data: { deletedAt: new Date() },
          });
      }
      for (const [ii, item] of r.items.entries()) {
        const data = {
          exerciseId: item.exerciseId,
          method: item.method,
          groupKey: item.groupId ?? null,
          restSeconds: item.restSeconds ?? null,
          notes: item.notes ?? null,
          sortOrder: ii,
        };
        const prevItem = item.id ? prevItems.find((x) => x.id === item.id) : undefined;
        const row = prevItem
          ? await tx.routineExercise.update({ where: { id: prevItem.id }, data })
          : await tx.routineExercise.create({ data: { ...data, routineId: routine.id } as never });
        await tx.exerciseSet.deleteMany({ where: { routineExerciseId: row.id } });
        await tx.exerciseSet.createMany({
          data: item.sets.map((s, si) => ({
            routineExerciseId: row.id,
            sortOrder: si,
            type: s.type,
            reps: s.reps ?? null,
            targetLoadKg: s.targetLoadKg ?? null,
            durationSeconds: s.durationSeconds ?? null,
            distanceMeters: s.distanceMeters ?? null,
            restSeconds: s.restSeconds ?? null,
            rpe: s.rpe ?? null,
            rir: s.rir ?? null,
            cadence: s.cadence ?? null,
            notes: s.notes ?? null,
          })) as never,
        });
      }
    }
  }

  async create(
    t: TenantAccess,
    dto: ProgramInput & {
      studentLinkId?: string | null | undefined;
      isTemplate: boolean;
      isExtra: boolean;
      publish: boolean;
    },
  ) {
    if (dto.isTemplate) await this.entitlements.assertFeature(t.tenantId, 'workouts.templates');
    if (dto.isTemplate && dto.studentLinkId) throw badRequest('Modelo não pertence a um aluno.');
    if (!dto.isTemplate && !dto.studentLinkId)
      throw badRequest('Escolha o aluno ou salve como modelo.');
    if (dto.studentLinkId) await assertStudentInScope(this.prisma, t, dto.studentLinkId);
    const id = await this.prisma.tenant(t.tenantId).$tenantTransaction(
      async (tx) => {
        await this.assertExercises(tx, dto);
        const p = await tx.workoutProgram.create({
          data: {
            studentLinkId: dto.studentLinkId ?? null,
            createdByMemberId: t.memberId,
            name: dto.name,
            goal: dto.goal ?? null,
            description: dto.description ?? null,
            startsOn: dateOrNull(dto.startsOn),
            endsOn: dateOrNull(dto.endsOn),
            isTemplate: dto.isTemplate,
            isExtra: dto.isExtra,
          } as never,
        });
        await this.writeTree(tx, p.id, dto);
        return p.id;
      },
      { timeout: 30_000 },
    );
    await this.students.markOnboarding(t.tenantId, 'first_workout');
    if (dto.publish && dto.studentLinkId) return this.publish(t, id);
    return this.get(t, id);
  }

  async replace(t: TenantAccess, id: string, dto: ProgramInput) {
    const current = await this.get(t, id);
    await this.prisma.tenant(t.tenantId).$tenantTransaction(
      async (tx) => {
        await this.assertExercises(tx, dto);
        await tx.workoutProgram.update({
          where: { id },
          data: {
            name: dto.name,
            goal: dto.goal ?? null,
            description: dto.description ?? null,
            startsOn: dateOrNull(dto.startsOn),
            endsOn: dateOrNull(dto.endsOn),
            version: { increment: 1 },
          },
        });
        await this.writeTree(tx, id, dto);
      },
      { timeout: 30_000 },
    );
    if (current.status === 'ACTIVE' && current.studentLinkId) {
      await this.events.publish('workout.updated', {
        tenantId: t.tenantId,
        payload: { studentLinkId: current.studentLinkId, programId: id, workoutName: dto.name },
      });
    }
    return this.get(t, id);
  }

  /** Publica para o aluno: o programa principal anterior é arquivado (extras convivem). */
  async publish(t: TenantAccess, id: string) {
    const p = await this.get(t, id);
    if (!p.studentLinkId) throw badRequest('Aplique o modelo a um aluno antes de publicar.');
    if (!p.routines.length) throw badRequest('Adicione pelo menos uma rotina.');
    const db = this.prisma.tenant(t.tenantId);
    if (!p.isExtra) {
      await db.workoutProgram.updateMany({
        where: {
          studentLinkId: p.studentLinkId,
          status: 'ACTIVE',
          isExtra: false,
          id: { not: id },
        },
        data: { status: 'ARCHIVED' },
      });
    }
    await db.workoutProgram.update({
      where: { id },
      data: { status: 'ACTIVE', publishedAt: new Date() },
    });
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: t.tenantId },
      select: { name: true },
    });
    await this.events.publish('workout.published', {
      tenantId: t.tenantId,
      payload: {
        studentLinkId: p.studentLinkId,
        programId: id,
        workoutName: p.name,
        tenantName: tenant.name,
      },
    });
    return this.get(t, id);
  }

  async clone(
    t: TenantAccess,
    id: string,
    opts: {
      studentLinkId?: string | null;
      asTemplate?: boolean;
      name?: string;
      startsOn?: string | null;
      endsOn?: string | null;
      publish?: boolean;
    },
  ) {
    const p = await this.get(t, id);
    const input = treeToInput(p);
    const created = await this.create(t, {
      ...input,
      name: opts.name ?? (opts.asTemplate ? input.name : `${input.name}`),
      startsOn: opts.startsOn ?? input.startsOn ?? null,
      endsOn: opts.endsOn ?? input.endsOn ?? null,
      studentLinkId: opts.asTemplate ? null : (opts.studentLinkId ?? p.studentLinkId),
      isTemplate: !!opts.asTemplate,
      isExtra: p.isExtra,
      publish: !!opts.publish,
    });
    await this.prisma
      .tenant(t.tenantId)
      .workoutProgram.update({ where: { id: created.id }, data: { sourceProgramId: id } });
    return created;
  }

  /** Aplica um programa/modelo a vários alunos ou a um grupo (feature workouts.group_apply). */
  async apply(
    t: TenantAccess,
    id: string,
    dto: {
      studentLinkIds: string[];
      groupId?: string | undefined;
      startsOn?: string | null | undefined;
      endsOn?: string | null | undefined;
      publish: boolean;
    },
  ) {
    const db = this.prisma.tenant(t.tenantId);
    const ids = new Set(dto.studentLinkIds);
    if (dto.groupId) {
      const members = await db.studentGroupMember.findMany({
        where: { groupId: dto.groupId, deletedAt: null },
        select: { studentLinkId: true },
      });
      for (const m of members) ids.add(m.studentLinkId);
    }
    if (ids.size > 1 || dto.groupId)
      await this.entitlements.assertFeature(t.tenantId, 'workouts.group_apply');
    const created: string[] = [];
    for (const studentLinkId of ids) {
      await assertStudentInScope(this.prisma, t, studentLinkId);
      const c = await this.clone(t, id, {
        studentLinkId,
        startsOn: dto.startsOn ?? null,
        endsOn: dto.endsOn ?? null,
        publish: dto.publish,
      });
      created.push(c.id);
    }
    return { created: created.length, programIds: created };
  }

  async archive(t: TenantAccess, id: string) {
    await this.get(t, id);
    await this.prisma
      .tenant(t.tenantId)
      .workoutProgram.update({ where: { id }, data: { status: 'ARCHIVED', publicToken: null } });
    return { ok: true as const };
  }

  /** Link público (sem login, revogável) para abrir o treino com vídeos e cronômetro. */
  async createPublicLink(t: TenantAccess, id: string) {
    const p = await this.get(t, id);
    if (!p.studentLinkId) throw badRequest('Links públicos são para treinos de alunos.');
    const token = p.publicToken ?? randomToken(18);
    await this.prisma
      .tenant(t.tenantId)
      .workoutProgram.update({ where: { id }, data: { publicToken: token } });
    const url = new URL(`/t/${token}`, this.env.APP_WEB_URL).toString();
    const text = `Seu treino "${p.name}" está pronto: ${url}`;
    return { token, url, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}` };
  }

  async revokePublicLink(t: TenantAccess, id: string) {
    await this.get(t, id);
    await this.prisma
      .tenant(t.tenantId)
      .workoutProgram.update({ where: { id }, data: { publicToken: null } });
    return { ok: true as const };
  }

  /** Programa pelo token público (sem tenant no contexto: resolve e passa a usar o cliente do tenant). */
  async byPublicToken(token: string) {
    const ref = await this.prisma.system.workoutProgram.findUnique({
      where: { publicToken: token },
      select: { id: true, tenantId: true, status: true, deletedAt: true, studentLinkId: true },
    });
    if (!ref || ref.deletedAt || ref.status === 'ARCHIVED' || !ref.studentLinkId)
      throw notFound('Link inválido ou revogado.');
    const p = await this.prisma
      .tenant(ref.tenantId)
      .workoutProgram.findFirstOrThrow({ where: { id: ref.id }, include: programInclude });
    const tenant = await this.prisma
      .tenant(ref.tenantId)
      .tenant.findFirstOrThrow({ where: { id: ref.tenantId }, select: { name: true } });
    return {
      program: p,
      tenantId: ref.tenantId,
      studentLinkId: ref.studentLinkId,
      tenantName: tenant.name,
    };
  }

  todayLink() {
    return deepLinks.todayWorkout();
  }
}
