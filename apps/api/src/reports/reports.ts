import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportsQuerySchema } from '@vetta/contracts';
import {
  adherenceRate,
  churnRisk,
  cohortRetention,
  delinquencyRate,
  monthKey,
} from '@vetta/fitness';
import { createZodDto } from 'nestjs-zod';
import { Can, RequireFeature, Roles } from '../access/decorators';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { PrismaService } from '../infra/prisma.service';

class ReportsQueryDto extends createZodDto(ReportsQuerySchema) {}

const DAY = 86_400_000;

/** Relatórios avançados do personal (Pro Plus). */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(t: TenantAccess, months: number) {
    const db = this.prisma.tenant(t.tenantId);
    const now = new Date();
    const since = new Date(now.getTime() - months * 31 * DAY);
    const fourWeeks = new Date(now.getTime() - 28 * DAY);

    const [links, sessions28, routinesByStudent, invoices, subs, prescribed, recent] =
      await Promise.all([
        db.studentLink.findMany({
          where: { deletedAt: null, status: { not: 'INVITED' } },
          select: {
            id: true,
            displayName: true,
            status: true,
            joinedAt: true,
            createdAt: true,
            archivedAt: true,
            lastWorkoutAt: true,
          },
        }),
        db.workoutSession.groupBy({
          by: ['studentLinkId'],
          where: { deletedAt: null, finishedAt: { not: null }, startedAt: { gte: fourWeeks } },
          _count: { _all: true },
          _avg: { rating: true },
        }),
        db.workoutRoutine.findMany({
          where: {
            deletedAt: null,
            program: {
              status: 'ACTIVE',
              isExtra: false,
              deletedAt: null,
              studentLinkId: { not: null },
            },
          },
          select: { program: { select: { studentLinkId: true } } },
        }),
        db.invoice.findMany({
          where: { deletedAt: null, dueDate: { gte: since } },
          select: {
            studentLinkId: true,
            status: true,
            amountCents: true,
            netCents: true,
            dueDate: true,
            paidAt: true,
            subscription: {
              select: { consultingPlan: { select: { id: true, name: true } } },
            },
          },
        }),
        db.studentSubscription.findMany({
          where: { deletedAt: null, status: { in: ['ACTIVE', 'OVERDUE'] } },
          select: { studentLinkId: true, endsAt: true, paymentMode: true },
        }),
        db.routineExercise.groupBy({
          by: ['exerciseId'],
          where: {
            deletedAt: null,
            routine: { deletedAt: null, program: { deletedAt: null, isTemplate: false } },
          },
          _count: { _all: true },
          orderBy: { _count: { exerciseId: 'desc' } },
          take: 15,
        }),
        db.workoutSession.groupBy({
          by: ['studentLinkId'],
          where: { deletedAt: null, hasPain: true, startedAt: { gte: fourWeeks } },
          _count: { _all: true },
        }),
      ]);

    // Retenção por coorte de entrada.
    const cohorts = cohortRetention(
      links.map((l) => ({
        joinedAt: l.joinedAt ?? l.createdAt,
        leftAt: l.status === 'ARCHIVED' ? (l.archivedAt ?? now) : null,
      })),
      months,
      now,
    );

    // Aderência das últimas 4 semanas: treinos feitos ÷ (rotinas por semana × 4).
    const routinesPerStudent = new Map<string, number>();
    for (const r of routinesByStudent) {
      const id = r.program.studentLinkId!;
      routinesPerStudent.set(id, (routinesPerStudent.get(id) ?? 0) + 1);
    }
    const done = new Map(sessions28.map((s) => [s.studentLinkId, s]));
    const active = links.filter((l) => l.status === 'ACTIVE' || l.status === 'OVERDUE');
    const adherence = active.map((l) => {
      const planned = (routinesPerStudent.get(l.id) ?? 0) * 4;
      const completed = done.get(l.id)?._count._all ?? 0;
      return {
        studentLinkId: l.id,
        name: l.displayName,
        planned,
        completed,
        rate: adherenceRate(planned, completed),
      };
    });
    const rated = adherence.filter((a) => a.rate !== null);
    const avgAdherence = rated.length
      ? rated.reduce((s, a) => s + a.rate!, 0) / rated.length
      : null;

    // Receita por plano de consultoria e inadimplência.
    const byPlan = new Map<
      string,
      { planId: string | null; name: string; paidCents: number; netCents: number; invoices: number }
    >();
    let billed = 0;
    let overdue = 0;
    const overdueByStudent = new Map<string, number>();
    const revenueByMonth = new Map<string, number>();
    for (const i of invoices) {
      if (i.status === 'CANCELED') continue;
      billed += i.amountCents;
      if (i.status === 'OVERDUE') {
        overdue += i.amountCents;
        overdueByStudent.set(i.studentLinkId, (overdueByStudent.get(i.studentLinkId) ?? 0) + 1);
      }
      if (i.status !== 'PAID') continue;
      const plan = i.subscription?.consultingPlan;
      const key = plan?.id ?? 'avulso';
      const row = byPlan.get(key) ?? {
        planId: plan?.id ?? null,
        name: plan?.name ?? 'Cobranças avulsas',
        paidCents: 0,
        netCents: 0,
        invoices: 0,
      };
      row.paidCents += i.amountCents;
      row.netCents += i.netCents;
      row.invoices++;
      byPlan.set(key, row);
      const m = monthKey(i.paidAt ?? i.dueDate);
      revenueByMonth.set(m, (revenueByMonth.get(m) ?? 0) + i.amountCents);
    }

    // Alunos em risco de cancelar.
    const subByStudent = new Map(subs.map((s) => [s.studentLinkId, s]));
    const pain = new Map(recent.map((r) => [r.studentLinkId, r._count._all]));
    const atRisk = active
      .map((l) => {
        const sub = subByStudent.get(l.id);
        const adh = adherence.find((a) => a.studentLinkId === l.id)?.rate ?? null;
        const risk = churnRisk({
          daysSinceLastWorkout: l.lastWorkoutAt
            ? Math.floor((now.getTime() - l.lastWorkoutAt.getTime()) / DAY)
            : null,
          adherence4w: adh,
          overdueInvoices: overdueByStudent.get(l.id) ?? 0,
          avgRating: done.get(l.id)?._avg.rating ?? null,
          painReports: pain.get(l.id) ?? 0,
          planEndsInDays:
            sub?.endsAt && sub.paymentMode !== 'RECURRING'
              ? Math.floor((sub.endsAt.getTime() - now.getTime()) / DAY)
              : null,
        });
        return { studentLinkId: l.id, name: l.displayName, ...risk };
      })
      .filter((r) => r.level !== 'LOW')
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    // Exercícios mais prescritos.
    const exercises = await db.exercise.findMany({
      where: { id: { in: prescribed.map((p) => p.exerciseId) } },
      select: { id: true, name: true },
    });
    const names = new Map(exercises.map((e) => [e.id, e.name]));

    return {
      generatedAt: now.toISOString(),
      months,
      students: { active: active.length, total: links.length },
      retention: cohorts,
      adherence: {
        average: avgAdherence,
        students: adherence.sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2)).slice(0, 50),
      },
      revenue: {
        byPlan: [...byPlan.values()].sort((a, b) => b.paidCents - a.paidCents),
        byMonth: [...revenueByMonth.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, cents]) => ({ month, cents })),
      },
      delinquency: {
        billedCents: billed,
        overdueCents: overdue,
        rate: delinquencyRate(overdue, billed),
        students: overdueByStudent.size,
      },
      atRisk,
      topExercises: prescribed.map((p) => ({
        exerciseId: p.exerciseId,
        name: names.get(p.exerciseId) ?? '—',
        count: p._count._all,
      })),
    };
  }
}

@ApiTags('relatórios')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @Can('read', 'finance')
  @Roles('PERSONAL')
  @RequireFeature('finance.advanced_reports')
  overview(@CurrentTenant() t: TenantAccess, @Query() q: ReportsQueryDto) {
    return this.reports.overview(t, q.months);
  }
}
