import { Inject, Injectable } from '@nestjs/common';
import {
  StudentCsvRowSchema,
  normalizeText,
  type StudentListQuery,
  type UpdateStudentInput,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import type { EventPublisher } from '@vetta/server';
import { badRequest, forbidden, notFound } from '../common/errors';
import type { TenantAccess, UserPrincipal } from '../common/request';
import { assertStudentInScope, studentScope } from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { parseCsv } from '../library/library.service';
import { StudentsService } from '../tenants/students.service';

const DAY = 86_400_000;
const COUNTED = ['INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE'] as const;

@Injectable()
export class StudentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: StudentsService,
    private readonly entitlements: EntitlementsService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  async list(t: TenantAccess, q: StudentListQuery) {
    const db = this.prisma.tenant(t.tenantId);
    const and: Prisma.StudentLinkWhereInput[] = [{ deletedAt: null }, studentScope(t)];
    if (q.status) and.push({ status: q.status });
    else and.push({ status: { not: 'ARCHIVED' } });
    if (q.groupId)
      and.push({ groupMemberships: { some: { groupId: q.groupId, deletedAt: null } } });
    if (q.tag) and.push({ tags: { has: q.tag } });
    if (q.inactiveDays) {
      const cutoff = new Date(Date.now() - q.inactiveDays * DAY);
      and.push({
        status: 'ACTIVE',
        OR: [{ lastWorkoutAt: null }, { lastWorkoutAt: { lt: cutoff } }],
      });
    }
    if (q.q) {
      const term = q.q.trim();
      and.push({
        OR: [
          { displayName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { tags: { has: normalizeText(term) } },
        ],
      });
    }
    const orderBy: Prisma.StudentLinkOrderByWithRelationInput[] =
      q.sort === 'last_workout'
        ? [{ lastWorkoutAt: { sort: 'desc', nulls: 'last' } }]
        : q.sort === 'joined'
          ? [{ createdAt: 'desc' }]
          : [{ displayName: 'asc' }];
    const items = await db.studentLink.findMany({
      where: { AND: and },
      orderBy,
      take: 1000,
      select: {
        id: true,
        displayName: true,
        email: true,
        whatsapp: true,
        status: true,
        goal: true,
        level: true,
        tags: true,
        assistantMemberId: true,
        lastWorkoutAt: true,
        joinedAt: true,
        invitedAt: true,
        birthDate: true,
        groupMemberships: {
          where: { deletedAt: null },
          select: { group: { select: { id: true, name: true, color: true } } },
        },
      },
    });
    return {
      items: items.map(({ groupMemberships, ...s }) => ({
        ...s,
        groups: groupMemberships.map((g) => g.group),
      })),
    };
  }

  async detail(t: TenantAccess, id: string) {
    await assertStudentInScope(this.prisma, t, id);
    const db = this.prisma.tenant(t.tenantId);
    const link = await db.studentLink.findFirstOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, avatarMediaId: true, lastLoginAt: true } },
        groupMemberships: { where: { deletedAt: null }, include: { group: true } },
        assistant: { include: { user: { select: { name: true } } } },
      },
    });
    const since = new Date(Date.now() - 30 * DAY);
    const [sessions30d, lastSession, activeProgram, lastAssessment, pendingAnamnesis] =
      await Promise.all([
        db.workoutSession.count({
          where: { studentLinkId: id, finishedAt: { gte: since }, deletedAt: null },
        }),
        db.workoutSession.findFirst({
          where: { studentLinkId: id, deletedAt: null },
          orderBy: { startedAt: 'desc' },
        }),
        db.workoutProgram.findFirst({
          where: { studentLinkId: id, status: 'ACTIVE', isExtra: false, deletedAt: null },
          select: { id: true, name: true, startsOn: true, endsOn: true },
        }),
        db.physicalAssessment.findFirst({
          where: { studentLinkId: id, deletedAt: null },
          orderBy: { assessedAt: 'desc' },
        }),
        db.anamnesisResponse.count({
          where: { studentLinkId: id, status: 'PENDING', deletedAt: null },
        }),
      ]);
    const { notes, ...rest } = link;
    return {
      ...rest,
      // Observações privadas: só a equipe vê.
      notes: t.role === 'ALUNO' ? undefined : notes,
      groups: link.groupMemberships.map((g) => g.group),
      assistantName: link.assistant?.user.name ?? null,
      summary: {
        sessionsLast30Days: sessions30d,
        lastSession: lastSession
          ? { id: lastSession.id, startedAt: lastSession.startedAt, rating: lastSession.rating }
          : null,
        activeProgram,
        lastAssessment: lastAssessment
          ? {
              id: lastAssessment.id,
              assessedAt: lastAssessment.assessedAt,
              nextAssessmentOn: lastAssessment.nextAssessmentOn,
            }
          : null,
        pendingAnamnesis,
      },
    };
  }

  async update(t: TenantAccess, id: string, dto: UpdateStudentInput) {
    await assertStudentInScope(this.prisma, t, id);
    const db = this.prisma.tenant(t.tenantId);
    if (dto.assistantMemberId !== undefined && t.role !== 'PERSONAL')
      throw forbidden('Só o personal define o assistente.');
    if (dto.assistantMemberId) {
      const m = await db.tenantMember.findFirst({
        where: { id: dto.assistantMemberId, role: 'ASSISTANT', status: 'ACTIVE' },
      });
      if (!m) throw badRequest('Assistente inválido.');
    }
    const { birthDate, tags, ...rest } = dto;
    return db.studentLink.update({
      where: { id },
      data: {
        ...rest,
        ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}),
        ...(tags ? { tags: [...new Set(tags.map((x) => normalizeText(x)))] } : {}),
      },
    });
  }

  async bulk(
    t: TenantAccess,
    dto: { ids: string[]; action: string; tag?: string | undefined; groupId?: string | undefined },
  ) {
    const db = this.prisma.tenant(t.tenantId);
    if (['archive', 'restore', 'pause', 'resume'].includes(dto.action) && t.role !== 'PERSONAL')
      throw forbidden();
    const ids = (
      await db.studentLink.findMany({
        where: { id: { in: dto.ids }, deletedAt: null, ...studentScope(t) },
        select: { id: true },
      })
    ).map((x) => x.id);
    if (!ids.length) throw notFound('Nenhum aluno encontrado.');
    const now = new Date();
    switch (dto.action) {
      case 'archive':
        await db.studentLink.updateMany({
          where: { id: { in: ids } },
          data: { status: 'ARCHIVED', archivedAt: now, archivedReason: 'manual' },
        });
        break;
      case 'restore': {
        await this.entitlements.assertLimit(t.tenantId, 'students.max', ids.length);
        await db.studentLink.updateMany({
          where: { id: { in: ids }, userId: { not: null } },
          data: { status: 'ACTIVE', archivedAt: null },
        });
        await db.studentLink.updateMany({
          where: { id: { in: ids }, userId: null },
          data: { status: 'INVITED', archivedAt: null },
        });
        break;
      }
      case 'pause':
        await db.studentLink.updateMany({
          where: { id: { in: ids }, status: 'ACTIVE' },
          data: { status: 'PAUSED' },
        });
        break;
      case 'resume':
        await db.studentLink.updateMany({
          where: { id: { in: ids }, status: 'PAUSED' },
          data: { status: 'ACTIVE' },
        });
        break;
      case 'add_tag':
      case 'remove_tag': {
        if (!dto.tag) throw badRequest('Informe a tag.');
        const tag = normalizeText(dto.tag);
        const links = await db.studentLink.findMany({
          where: { id: { in: ids } },
          select: { id: true, tags: true },
        });
        for (const l of links) {
          const tags =
            dto.action === 'add_tag'
              ? [...new Set([...l.tags, tag])]
              : l.tags.filter((x) => x !== tag);
          await db.studentLink.update({ where: { id: l.id }, data: { tags } });
        }
        break;
      }
      case 'add_to_group':
      case 'remove_from_group': {
        if (!dto.groupId) throw badRequest('Informe o grupo.');
        await this.entitlements.assertFeature(t.tenantId, 'students.groups');
        const g = await db.studentGroup.findFirst({ where: { id: dto.groupId, deletedAt: null } });
        if (!g) throw notFound('Grupo não encontrado.');
        if (dto.action === 'add_to_group') await this.addMembers(t, g.id, ids);
        else
          await db.studentGroupMember.updateMany({
            where: { groupId: g.id, studentLinkId: { in: ids } },
            data: { deletedAt: now },
          });
        break;
      }
    }
    return { ok: true as const, affected: ids.length };
  }

  /** Importação CSV: nome;email;whatsapp;objetivo;tags. Convites por e-mail para quem tem e-mail. */
  async importCsv(t: TenantAccess, actor: UserPrincipal, csv: string, sendInvites: boolean) {
    const rows = parseCsv(csv);
    if (!rows.length) throw badRequest('CSV vazio.');
    if (rows.length > 500) throw badRequest('Importe até 500 alunos por vez.');
    await this.entitlements.assertLimit(t.tenantId, 'students.max', rows.length);
    const errors: { line: number; message: string }[] = [];
    let created = 0;
    for (const [i, r] of rows.entries()) {
      const parsed = StudentCsvRowSchema.safeParse(
        Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '')),
      );
      if (!parsed.success) {
        errors.push({ line: i + 2, message: parsed.error.issues[0]!.message });
        continue;
      }
      try {
        const inv = await this.invites.invite(t, actor, {
          name: parsed.data.nome,
          ...(parsed.data.email ? { email: parsed.data.email } : {}),
          ...(parsed.data.whatsapp ? { phone: parsed.data.whatsapp } : {}),
          delivery: sendInvites && parsed.data.email ? 'EMAIL' : 'LINK',
        });
        await this.prisma.tenant(t.tenantId).studentLink.update({
          where: { id: inv.studentLinkId },
          data: {
            goal: parsed.data.objetivo ?? null,
            whatsapp: parsed.data.whatsapp ?? null,
            tags: list(parsed.data.tags).map(normalizeText),
          },
        });
        created++;
      } catch (err) {
        errors.push({ line: i + 2, message: (err as Error).message });
      }
    }
    return { rows: rows.length, created, errors };
  }

  // ─── Grupos ───────────────────────────────────────────────────────────

  groups(t: TenantAccess) {
    return this.prisma.tenant(t.tenantId).studentGroup.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: { where: { deletedAt: null } } } } },
    });
  }

  createGroup(
    t: TenantAccess,
    dto: {
      name: string;
      description?: string | null | undefined;
      color?: string | null | undefined;
    },
  ) {
    return this.prisma.tenant(t.tenantId).studentGroup.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        color: dto.color ?? null,
      } as never,
    });
  }

  async updateGroup(
    t: TenantAccess,
    id: string,
    dto: {
      name: string;
      description?: string | null | undefined;
      color?: string | null | undefined;
    },
  ) {
    await this.group(t, id);
    return this.prisma.tenant(t.tenantId).studentGroup.update({
      where: { id },
      data: { name: dto.name, description: dto.description ?? null, color: dto.color ?? null },
    });
  }

  async removeGroup(t: TenantAccess, id: string) {
    await this.group(t, id);
    await this.prisma
      .tenant(t.tenantId)
      .studentGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  private async group(t: TenantAccess, id: string) {
    const g = await this.prisma
      .tenant(t.tenantId)
      .studentGroup.findFirst({ where: { id, deletedAt: null } });
    if (!g) throw notFound('Grupo não encontrado.');
    return g;
  }

  async addMembers(t: TenantAccess, groupId: string, studentLinkIds: string[]) {
    await this.group(t, groupId);
    const db = this.prisma.tenant(t.tenantId);
    for (const id of studentLinkIds) {
      await assertStudentInScope(this.prisma, t, id);
      const existing = await db.studentGroupMember.findFirst({
        where: { groupId, studentLinkId: id },
      });
      if (existing)
        await db.studentGroupMember.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
      else await db.studentGroupMember.create({ data: { groupId, studentLinkId: id } as never });
    }
    return { ok: true as const };
  }

  async removeMember(t: TenantAccess, groupId: string, studentLinkId: string) {
    await this.group(t, groupId);
    await this.prisma.tenant(t.tenantId).studentGroupMember.updateMany({
      where: { groupId, studentLinkId },
      data: { deletedAt: new Date() },
    });
    return { ok: true as const };
  }

  // ─── Relatórios ───────────────────────────────────────────────────────

  /** Treinos concluídos por aluno nas últimas N semanas (semana começando na segunda, UTC). */
  async frequency(t: TenantAccess, weeks: number) {
    const db = this.prisma.tenant(t.tenantId);
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const start = new Date(monday.getTime() - (weeks - 1) * 7 * DAY);
    const weekKeys = Array.from({ length: weeks }, (_, i) =>
      new Date(start.getTime() + i * 7 * DAY).toISOString().slice(0, 10),
    );
    const students = await db.studentLink.findMany({
      where: { deletedAt: null, status: { in: [...COUNTED] }, ...studentScope(t) },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
    const sessions = await db.workoutSession.findMany({
      where: {
        finishedAt: { gte: start },
        deletedAt: null,
        studentLinkId: { in: students.map((s) => s.id) },
      },
      select: { studentLinkId: true, finishedAt: true },
    });
    const counts = new Map<string, number[]>();
    for (const s of sessions) {
      const idx = Math.floor((s.finishedAt!.getTime() - start.getTime()) / (7 * DAY));
      if (idx < 0 || idx >= weeks) continue;
      const arr = counts.get(s.studentLinkId) ?? Array<number>(weeks).fill(0);
      arr[idx]!++;
      counts.set(s.studentLinkId, arr);
    }
    return {
      weeks: weekKeys,
      rows: students.map((s) => ({
        ...s,
        counts: counts.get(s.id) ?? Array<number>(weeks).fill(0),
      })),
    };
  }

  /** Alunos ativos sem treinar há pelo menos X dias (X configurável no tenant, padrão 5). */
  async inactive(t: TenantAccess, days?: number) {
    const db = this.prisma.tenant(t.tenantId);
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: t.tenantId },
      select: { inactivityAlertDays: true },
    });
    const d = days ?? tenant.inactivityAlertDays;
    const cutoff = new Date(Date.now() - d * DAY);
    const items = await db.studentLink.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...studentScope(t),
        OR: [{ lastWorkoutAt: { lt: cutoff } }, { lastWorkoutAt: null, joinedAt: { lt: cutoff } }],
      },
      select: { id: true, displayName: true, whatsapp: true, lastWorkoutAt: true, joinedAt: true },
      orderBy: { lastWorkoutAt: { sort: 'asc', nulls: 'first' } },
    });
    return {
      days: d,
      items: items.map((s) => ({
        ...s,
        daysWithoutTraining: Math.floor(
          (Date.now() - (s.lastWorkoutAt ?? s.joinedAt ?? new Date()).getTime()) / DAY,
        ),
      })),
    };
  }

  /** Linha do tempo: atividades, treinos, avaliações e anamneses em ordem cronológica. */
  async timeline(t: TenantAccess, id: string) {
    await assertStudentInScope(this.prisma, t, id);
    const db = this.prisma.tenant(t.tenantId);
    const [acts, sessions, assessments, anamneses] = await Promise.all([
      db.studentActivity.findMany({
        where: { studentLinkId: id, deletedAt: null },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
      db.workoutSession.findMany({
        where: { studentLinkId: id, deletedAt: null },
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: { routine: { select: { label: true, name: true } } },
      }),
      db.physicalAssessment.findMany({
        where: { studentLinkId: id, deletedAt: null },
        orderBy: { assessedAt: 'desc' },
        take: 20,
      }),
      db.anamnesisResponse.findMany({
        where: { studentLinkId: id, deletedAt: null, answeredAt: { not: null } },
        include: { template: { select: { name: true } } },
        take: 20,
      }),
    ]);
    const items = [
      ...acts.map((a) => ({ type: a.type, title: a.title, at: a.occurredAt, ref: a.id })),
      ...sessions.map((s) => ({
        type: 'workout',
        title:
          `Treino ${s.routine?.label ?? ''} ${s.routine?.name ?? ''}`.trim() +
          (s.rating ? ` · nota ${s.rating}` : ''),
        at: s.finishedAt ?? s.startedAt,
        ref: s.id,
      })),
      ...assessments.map((a) => ({
        type: 'assessment',
        title: 'Avaliação física',
        at: a.assessedAt,
        ref: a.id,
      })),
      ...anamneses.map((a) => ({
        type: 'anamnesis',
        title: `Anamnese: ${a.template.name}`,
        at: a.answeredAt!,
        ref: a.id,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    return { items: items.slice(0, 100) };
  }

  async updateSettings(
    t: TenantAccess,
    dto: {
      inactivityAlertDays?: number | undefined;
      reassessmentDays?: number | null | undefined;
      bio?: string | null | undefined;
    },
  ) {
    return this.prisma.tenant(t.tenantId).tenant.update({
      where: { id: t.tenantId },
      data: dto,
      select: { id: true, inactivityAlertDays: true, reassessmentDays: true, bio: true },
    });
  }

  async markOnboarding(tenantId: string, step: 'profile' | 'first_student' | 'first_workout') {
    const tenant = await this.prisma.system.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingSteps: true },
    });
    if (tenant && !tenant.onboardingSteps.includes(step)) {
      await this.prisma.system.tenant.update({
        where: { id: tenantId },
        data: { onboardingSteps: { push: step } },
      });
    }
  }

  async publishLimitThresholds(tenantId: string) {
    const used = (await this.entitlements.usage(tenantId, 'students.max')) ?? 0;
    const max = Number((await this.entitlements.value(tenantId, 'students.max')) ?? 0);
    if (max <= 0) return;
    const ent = await this.entitlements.resolve(tenantId);
    const pct = Math.round((used / max) * 100);
    const payload = { used, max, percent: pct, plan: ent.plan.name };
    if (used >= max) {
      await this.events.publish('plan.limit_reached', {
        tenantId,
        payload,
        id: `limit-100:${tenantId}:${max}`,
      });
    } else if (pct >= 80) {
      await this.events.publish('plan.limit_warning', {
        tenantId,
        payload,
        id: `limit-80:${tenantId}:${max}`,
      });
    }
  }
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
