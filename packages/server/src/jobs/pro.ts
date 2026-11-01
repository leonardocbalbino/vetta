import { locateWeek } from '@vetta/fitness';
import type { Prisma, PrismaClient } from '@vetta/db';
import type { EventPublisher } from '../events';
import { addDaysToDate, toDateOnly } from '../billing/billing';
import { localDate } from './engagement';

export interface ProJobDeps {
  db: PrismaClient;
  publisher: EventPublisher;
}

const fmtTime = (d: Date, tz: string) =>
  d.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

/** Lembretes de aula: 24 h e 1 h antes, para os participantes confirmados ou reservados. */
export async function appointmentReminders(deps: ProJobDeps, now = new Date()) {
  const windows = [
    { field: 'reminderSentAt' as const, ms: 24 * 3_600_000, label: 'amanhã' },
    { field: 'reminder1hSentAt' as const, ms: 3_600_000, label: 'em 1 hora' },
  ];
  let sent = 0;
  for (const w of windows) {
    const appts = await deps.db.appointment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        deletedAt: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + w.ms) },
        [w.field]: null,
      },
      include: {
        tenant: { select: { timezone: true, name: true } },
        attendees: {
          where: { status: { in: ['BOOKED', 'CONFIRMED'] }, deletedAt: null },
          include: { studentLink: { select: { userId: true } } },
        },
        member: { select: { userId: true } },
      },
      take: 500,
    });
    for (const a of appts) {
      // Lembrete de 24 h só faz sentido se ainda faltar mais de 1 h.
      if (w.field === 'reminderSentAt' && a.startsAt.getTime() - now.getTime() <= 3_600_000) {
        await deps.db.appointment.update({ where: { id: a.id }, data: { reminderSentAt: now } });
        continue;
      }
      await deps.db.appointment.update({ where: { id: a.id }, data: { [w.field]: now } });
      const userIds = [
        ...a.attendees.map((x) => x.studentLink.userId).filter((x): x is string => !!x),
        a.member.userId,
      ];
      if (!userIds.length) continue;
      await deps.publisher.publish('appointment.reminder', {
        tenantId: a.tenantId,
        id: `appt-reminder:${a.id}:${w.field}`,
        payload: {
          userIds,
          appointmentId: a.id,
          title: a.title,
          time: fmtTime(a.startsAt, a.tenant.timezone),
          when: w.label,
          place: a.type === 'ONLINE' ? (a.meetingUrl ?? 'online') : (a.location ?? ''),
        },
      });
      sent++;
    }
  }
  return sent;
}

type Audience =
  | { all: true }
  | { groupIds: string[] }
  | { studentLinkIds: string[] }
  | {
      filter: {
        status?: ('INVITED' | 'ACTIVE' | 'PAUSED' | 'OVERDUE')[];
        tags?: string[];
        inactiveDays?: number;
        consultingPlanId?: string;
      };
    };

/** Alunos (com conta) que recebem um comunicado. */
export function audienceWhere(
  tenantId: string,
  audience: Audience,
  now = new Date(),
): Prisma.StudentLinkWhereInput {
  const base: Prisma.StudentLinkWhereInput = { tenantId, deletedAt: null, userId: { not: null } };
  if ('all' in audience) return { ...base, status: { in: ['ACTIVE', 'PAUSED', 'OVERDUE'] } };
  if ('groupIds' in audience)
    return {
      ...base,
      status: { in: ['ACTIVE', 'PAUSED', 'OVERDUE'] },
      groupMemberships: { some: { groupId: { in: audience.groupIds }, deletedAt: null } },
    };
  if ('studentLinkIds' in audience) return { ...base, id: { in: audience.studentLinkIds } };
  const f = audience.filter;
  return {
    ...base,
    status: { in: f.status?.length ? f.status : ['ACTIVE', 'PAUSED', 'OVERDUE'] },
    ...(f.tags?.length ? { tags: { hasSome: f.tags } } : {}),
    ...(f.inactiveDays
      ? {
          OR: [
            { lastWorkoutAt: null },
            { lastWorkoutAt: { lt: new Date(now.getTime() - f.inactiveDays * 86_400_000) } },
          ],
        }
      : {}),
    ...(f.consultingPlanId
      ? {
          subscriptions: {
            some: { consultingPlanId: f.consultingPlanId, status: { in: ['ACTIVE', 'OVERDUE'] } },
          },
        }
      : {}),
  };
}

/** Envia um comunicado (imediato ou agendado): um evento com todos os destinatários. */
export async function deliverBroadcast(deps: ProJobDeps, broadcastId: string, now = new Date()) {
  const claimed = await deps.db.broadcast.updateMany({
    where: { id: broadcastId, status: { in: ['DRAFT', 'SCHEDULED'] } },
    data: { status: 'SENDING' },
  });
  if (!claimed.count) return null;
  const b = await deps.db.broadcast.findUniqueOrThrow({
    where: { id: broadcastId },
    include: { tenant: { select: { name: true } } },
  });
  const links = await deps.db.studentLink.findMany({
    where: audienceWhere(b.tenantId, b.audience as Audience, now),
    select: { userId: true },
  });
  const userIds = [...new Set(links.map((l) => l.userId!))];
  await deps.db.broadcast.update({
    where: { id: b.id },
    data: {
      status: 'SENT',
      sentAt: now,
      recipientsCount: userIds.length,
      recipientUserIds: userIds,
    },
  });
  if (userIds.length) {
    await deps.publisher.publish('broadcast.sent', {
      tenantId: b.tenantId,
      actorId: b.createdByUserId,
      id: `broadcast:${b.id}`,
      payload: {
        userIds,
        broadcastId: b.id,
        title: b.title,
        body: b.body,
        tenantName: b.tenant.name,
        channels: b.channels,
      },
    });
  }
  return userIds.length;
}

export async function sendScheduledBroadcasts(deps: ProJobDeps, now = new Date()) {
  const due = await deps.db.broadcast.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now }, deletedAt: null },
    select: { id: true },
    take: 50,
  });
  for (const b of due) await deliverBroadcast(deps, b.id, now);
  return due.length;
}

/**
 * Troca automática de rotina: quando a data entra numa nova fase da periodização,
 * publica o programa da fase (arquivando o anterior) e avisa o aluno.
 */
export async function switchPeriodizationPhases(deps: ProJobDeps, now = new Date()) {
  const items = await deps.db.periodization.findMany({
    where: { isActive: true, deletedAt: null },
    include: {
      phases: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      tenant: { select: { timezone: true, name: true } },
    },
    take: 1000,
  });
  let switched = 0;
  for (const p of items) {
    const today = localDate(now, p.tenant.timezone);
    const loc = locateWeek(toDateOnly(p.startsOn), p.phases, today);
    if (!loc) {
      if (p.endsOn && today > toDateOnly(p.endsOn))
        await deps.db.periodization.update({ where: { id: p.id }, data: { isActive: false } });
      continue;
    }
    const phase = p.phases[loc.phaseIndex]!;
    if (phase.id === p.activePhaseId) continue;
    await deps.db.$transaction(async (tx) => {
      await tx.periodization.update({ where: { id: p.id }, data: { activePhaseId: phase.id } });
      if (phase.programId) {
        await tx.workoutProgram.updateMany({
          where: {
            tenantId: p.tenantId,
            studentLinkId: p.studentLinkId,
            status: 'ACTIVE',
            isExtra: false,
            id: { not: phase.programId },
          },
          data: { status: 'ARCHIVED' },
        });
        await tx.workoutProgram.update({
          where: { id: phase.programId },
          data: { status: 'ACTIVE', publishedAt: now, studentLinkId: p.studentLinkId },
        });
      }
    });
    const program = phase.programId
      ? await deps.db.workoutProgram.findUnique({
          where: { id: phase.programId },
          select: { name: true },
        })
      : null;
    await deps.publisher.publish('periodization.phase_started', {
      tenantId: p.tenantId,
      id: `phase:${phase.id}`,
      payload: {
        studentLinkId: p.studentLinkId,
        periodizationId: p.id,
        phaseName: phase.name,
        workoutName: program?.name ?? phase.name,
        tenantName: p.tenant.name,
      },
    });
    switched++;
  }
  return switched;
}

/** Reaplicação periódica de anamnese. */
export async function reapplyAnamnesis(deps: ProJobDeps, now = new Date()) {
  const today = toDateOnly(now);
  const due = await deps.db.anamnesisAssignment.findMany({
    where: { isActive: true, deletedAt: null, nextDueOn: { lte: new Date(`${today}T00:00:00Z`) } },
    include: {
      template: true,
      tenant: { select: { name: true } },
      studentLink: { select: { status: true } },
    },
    take: 500,
  });
  let sent = 0;
  for (const a of due) {
    const next = new Date(`${addDaysToDate(today, a.repeatEveryDays)}T00:00:00Z`);
    await deps.db.anamnesisAssignment.update({
      where: { id: a.id },
      data: { nextDueOn: next, lastSentAt: now },
    });
    if (!['ACTIVE', 'PAUSED', 'OVERDUE'].includes(a.studentLink.status) || !a.template.isActive)
      continue;
    const pending = await deps.db.anamnesisResponse.findFirst({
      where: {
        studentLinkId: a.studentLinkId,
        templateId: a.templateId,
        status: 'PENDING',
        deletedAt: null,
      },
    });
    if (pending) continue;
    const r = await deps.db.anamnesisResponse.create({
      data: {
        tenantId: a.tenantId,
        studentLinkId: a.studentLinkId,
        templateId: a.templateId,
        templateVersion: a.template.version,
      },
    });
    await deps.publisher.publish('anamnesis.requested', {
      tenantId: a.tenantId,
      id: `anamnesis-reapply:${a.id}:${today}`,
      payload: {
        studentLinkId: a.studentLinkId,
        responseId: r.id,
        templateName: a.template.name,
        tenantName: a.tenant.name,
        dueText: '',
      },
    });
    sent++;
  }
  return sent;
}
