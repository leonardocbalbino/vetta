import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Can } from '../access/decorators';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { studentScope } from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../infra/prisma.service';

const DAY = 86_400_000;

/** Início do dia no fuso do tenant, em UTC. */
function startOfDay(tz: string, now = new Date()): Date {
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const offset = now.getTime() - local.getTime();
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() + offset);
}

/** Dias até o próximo aniversário (0 = hoje). */
export function daysUntilBirthday(birth: Date, today: Date): number {
  const y = today.getUTCFullYear();
  let next = Date.UTC(y, birth.getUTCMonth(), birth.getUTCDate());
  const t0 = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  if (next < t0) next = Date.UTC(y + 1, birth.getUTCMonth(), birth.getUTCDate());
  return Math.round((next - t0) / DAY);
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async personal(t: TenantAccess) {
    const db = this.prisma.tenant(t.tenantId);
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: t.tenantId },
      select: {
        timezone: true,
        inactivityAlertDays: true,
        onboardingSteps: true,
        cref: true,
        bio: true,
      },
    });
    const scope = studentScope(t);
    const today = startOfDay(tenant.timezone);
    const inactiveCutoff = new Date(Date.now() - tenant.inactivityAlertDays * DAY);
    const [activeStudents, workoutsToday, pendingFeedbacks, students, reassessments, programs] =
      await Promise.all([
        db.studentLink.count({ where: { deletedAt: null, status: 'ACTIVE', ...scope } }),
        db.workoutSession.count({
          where: { deletedAt: null, finishedAt: { gte: today }, studentLink: scope },
        }),
        db.workoutSession.count({
          where: {
            deletedAt: null,
            rating: { not: null },
            feedbackReadAt: null,
            studentLink: scope,
          },
        }),
        db.studentLink.findMany({
          where: { deletedAt: null, status: 'ACTIVE', ...scope },
          select: {
            id: true,
            displayName: true,
            birthDate: true,
            lastWorkoutAt: true,
            joinedAt: true,
            whatsapp: true,
          },
        }),
        db.physicalAssessment.findMany({
          where: {
            deletedAt: null,
            nextAssessmentOn: { gte: today, lte: new Date(today.getTime() + 7 * DAY) },
            studentLink: scope,
          },
          select: {
            id: true,
            nextAssessmentOn: true,
            studentLink: { select: { id: true, displayName: true } },
          },
        }),
        db.workoutProgram.count({ where: { deletedAt: null, isTemplate: false } }),
      ]);
    const inactive = students
      .filter((s) => (s.lastWorkoutAt ?? s.joinedAt ?? new Date()) < inactiveCutoff)
      .map((s) => ({
        id: s.id,
        name: s.displayName,
        whatsapp: s.whatsapp,
        lastWorkoutAt: s.lastWorkoutAt,
      }))
      .slice(0, 20);
    const birthdays = students
      .filter((s) => s.birthDate)
      .map((s) => ({
        id: s.id,
        name: s.displayName,
        inDays: daysUntilBirthday(s.birthDate!, new Date()),
      }))
      .filter((s) => s.inDays <= 7)
      .sort((a, b) => a.inDays - b.inDays);
    const usage = await this.entitlements.toResponse(t.tenantId);
    const totalStudents = await db.studentLink.count({ where: { deletedAt: null } });
    return {
      activeStudents,
      workoutsToday,
      pendingFeedbacks,
      alerts: {
        inactive,
        inactivityDays: tenant.inactivityAlertDays,
        birthdays,
        reassessments: reassessments.map((r) => ({
          assessmentId: r.id,
          date: r.nextAssessmentOn,
          student: r.studentLink,
        })),
      },
      plan: usage.plan,
      limits: usage.limits,
      onboarding: {
        profile: tenant.onboardingSteps.includes('profile') || !!(tenant.cref && tenant.bio),
        firstStudent: totalStudents > 0,
        firstWorkout: programs > 0,
      },
    };
  }
}

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Can('read', 'students')
  get(@CurrentTenant() t: TenantAccess) {
    return this.dashboard.personal(t);
  }
}
