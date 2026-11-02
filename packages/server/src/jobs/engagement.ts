import type { PrismaClient } from '@vetta/db';
import { resolveEntitlements } from '../entitlements';
import type { EventPublisher } from '../events';
import { localMinutes } from '../notifications/engine';

const DAY = 86_400_000;

export interface EngagementDeps {
  db: PrismaClient;
  publisher: EventPublisher;
}

/** "YYYY-MM-DD" no fuso informado. */
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Lembrete diário de treino no horário escolhido pelo aluno (janela de 5 min).
 * Id determinístico por usuário e dia: rodar de novo não duplica.
 */
export async function trainingReminders(
  deps: EngagementDeps,
  now = new Date(),
  windowMinutes = 5,
): Promise<number> {
  const users = await deps.db.user.findMany({
    where: {
      trainingReminderEnabled: true,
      trainingReminderTime: { not: null },
      deletedAt: null,
      studentLinks: { some: { status: 'ACTIVE', deletedAt: null } },
    },
    select: { id: true, timezone: true, trainingReminderTime: true },
  });
  let sent = 0;
  for (const u of users) {
    const diff = localMinutes(now, u.timezone) - toMin(u.trainingReminderTime!);
    if (diff < 0 || diff >= windowMinutes) continue;
    await deps.publisher.publish('training.reminder', {
      id: `reminder:${u.id}:${localDate(now, u.timezone)}`,
      payload: { userId: u.id, routineLabel: 'de hoje' },
    });
    sent++;
  }
  return sent;
}

/** Aluno sem treinar há X dias (X do tenant; só com a feature students.inactivity_alert). */
export async function inactiveStudents(deps: EngagementDeps, now = new Date()): Promise<number> {
  const tenants = await deps.db.tenant.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { id: true, inactivityAlertDays: true },
  });
  let count = 0;
  for (const t of tenants) {
    const ent = await resolveEntitlements(deps.db, t.id, now);
    if (ent.features['students.inactivity_alert'] !== true) continue;
    const cutoff = new Date(now.getTime() - t.inactivityAlertDays * DAY);
    const links = await deps.db.studentLink.findMany({
      where: {
        tenantId: t.id,
        status: 'ACTIVE',
        deletedAt: null,
        inactivityNotifiedAt: null,
        OR: [{ lastWorkoutAt: { lt: cutoff } }, { lastWorkoutAt: null, joinedAt: { lt: cutoff } }],
      },
      select: { id: true, displayName: true, lastWorkoutAt: true, joinedAt: true },
    });
    for (const l of links) {
      const since = l.lastWorkoutAt ?? l.joinedAt ?? now;
      await deps.db.studentLink.update({
        where: { id: l.id },
        data: { inactivityNotifiedAt: now },
      });
      await deps.publisher.publish('student.inactive', {
        tenantId: t.id,
        id: `inactive:${l.id}:${since.toISOString().slice(0, 10)}`,
        payload: {
          studentLinkId: l.id,
          studentName: l.displayName,
          days: Math.floor((now.getTime() - since.getTime()) / DAY),
        },
      });
      count++;
    }
  }
  return count;
}

/** Aniversários: aviso ao personal 7 dias antes e no dia; parabéns ao aluno no dia. */
export async function birthdays(deps: EngagementDeps, now = new Date()): Promise<number> {
  const links = await deps.db.studentLink.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      birthDate: { not: null },
      tenant: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      tenantId: true,
      displayName: true,
      birthDate: true,
      userId: true,
      tenant: { select: { name: true } },
    },
  });
  const t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let count = 0;
  for (const l of links) {
    const b = l.birthDate!;
    let next = Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    if (next < t0) next = Date.UTC(now.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate());
    const inDays = Math.round((next - t0) / DAY);
    const year = new Date(next).getUTCFullYear();
    if (inDays !== 7 && inDays !== 0) continue;
    const date =
      inDays === 0
        ? 'hoje'
        : new Date(next).toLocaleDateString('pt-BR', {
            timeZone: 'UTC',
            day: '2-digit',
            month: '2-digit',
          });
    await deps.publisher.publish('birthday.upcoming', {
      tenantId: l.tenantId,
      id: `bday${inDays}:${l.id}:${year}`,
      payload: { studentLinkId: l.id, studentName: l.displayName, date },
    });
    if (inDays === 0 && l.userId) {
      await deps.publisher.publish('birthday.today', {
        tenantId: l.tenantId,
        id: `bday-student:${l.id}:${year}`,
        payload: {
          userIds: [l.userId],
          studentLinkId: l.id,
          message: `Feliz aniversário, ${l.displayName.split(' ')[0]}! ${l.tenant.name} deseja um ano cheio de conquistas.`,
        },
      });
    }
    count++;
  }
  return count;
}

/** Reavaliação marcada para daqui a 7 dias (uma vez por avaliação). */
export async function assessmentsDue(deps: EngagementDeps, now = new Date()): Promise<number> {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 7 * DAY,
  );
  const items = await deps.db.physicalAssessment.findMany({
    where: {
      deletedAt: null,
      reminderSentAt: null,
      nextAssessmentOn: { gte: new Date(now.getTime()), lte: target },
    },
    select: {
      id: true,
      tenantId: true,
      nextAssessmentOn: true,
      studentLink: { select: { id: true, displayName: true } },
    },
  });
  for (const a of items) {
    await deps.db.physicalAssessment.update({ where: { id: a.id }, data: { reminderSentAt: now } });
    await deps.publisher.publish('assessment.due', {
      tenantId: a.tenantId,
      id: `assessment-due:${a.id}`,
      payload: {
        studentLinkId: a.studentLink.id,
        studentName: a.studentLink.displayName,
        date: a.nextAssessmentOn!.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
      },
    });
  }
  return items.length;
}

/** Trial terminando hoje (o aviso de 3 dias fica em notifyTrialEnding). */
export async function trialEndsToday(deps: EngagementDeps, now = new Date()): Promise<number> {
  const subs = await deps.db.tenantSubscription.findMany({
    where: { status: 'TRIALING', trialEndsAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
    select: { id: true, tenantId: true },
  });
  for (const s of subs) {
    await deps.publisher.publish('subscription.trial_ends_today', {
      tenantId: s.tenantId,
      id: `trial-today:${s.id}`,
    });
  }
  return subs.length;
}
