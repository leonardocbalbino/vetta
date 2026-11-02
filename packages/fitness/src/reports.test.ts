import { describe, expect, it } from 'vitest';
import {
  addMonths,
  adherenceRate,
  churnRisk,
  cohortRetention,
  delinquencyRate,
  monthEnd,
  monthKey,
} from './reports.js';

const sp = (iso: string) => new Date(`${iso}-03:00`);

describe('meses no fuso de São Paulo', () => {
  it('usa o mês local, não o UTC', () => {
    expect(monthKey(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
    expect(monthKey(sp('2026-11-01T00:00:00'))).toBe('2026-11');
  });

  it('soma meses e calcula o fim do mês', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthEnd('2026-12').toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(monthEnd('2026-02').toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });
});

describe('retenção por coorte', () => {
  const now = sp('2026-11-15T12:00:00');
  const members = [
    { joinedAt: sp('2026-09-05T10:00:00'), leftAt: null },
    { joinedAt: sp('2026-09-20T10:00:00'), leftAt: sp('2026-10-10T10:00:00') },
    { joinedAt: sp('2026-10-01T10:00:00'), leftAt: null },
    { joinedAt: null, leftAt: null },
  ];

  it('acompanha cada coorte até o mês atual', () => {
    const rows = cohortRetention(members, 3, now);
    expect(rows.map((r) => r.cohort)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(rows[0]).toEqual({ cohort: '2026-09', size: 2, retention: [100, 50, 50] });
    expect(rows[1]).toEqual({ cohort: '2026-10', size: 1, retention: [100, 100] });
    expect(rows[2]).toEqual({ cohort: '2026-11', size: 0, retention: [0] });
  });

  it('saída no mês atual conta até agora', () => {
    const r = cohortRetention(
      [{ joinedAt: sp('2026-11-01T10:00:00'), leftAt: sp('2026-11-20T00:00:00') }],
      1,
      now,
    );
    expect(r[0]!.retention).toEqual([100]);
  });
});

describe('aderência e inadimplência', () => {
  it('limita entre 0 e 1', () => {
    expect(adherenceRate(0, 3)).toBeNull();
    expect(adherenceRate(4, 2)).toBe(0.5);
    expect(adherenceRate(4, 9)).toBe(1);
    expect(adherenceRate(4, -1)).toBe(0);
    expect(delinquencyRate(500, 0)).toBe(0);
    expect(delinquencyRate(500, 2000)).toBe(0.25);
    expect(delinquencyRate(5000, 2000)).toBe(1);
  });
});

describe('risco de cancelar', () => {
  const base = {
    daysSinceLastWorkout: 2,
    adherence4w: 0.9,
    overdueInvoices: 0,
    avgRating: 4.5,
    painReports: 0,
    planEndsInDays: null,
  };

  it('aluno engajado tem risco baixo', () => {
    expect(churnRisk(base)).toEqual({ score: 0, level: 'LOW', reasons: [] });
  });

  it('soma os sinais e explica os motivos', () => {
    const r = churnRisk({
      daysSinceLastWorkout: 25,
      adherence4w: 0.2,
      overdueInvoices: 3,
      avgRating: 2,
      painReports: 2,
      planEndsInDays: 5,
    });
    expect(r.score).toBe(100);
    expect(r.level).toBe('HIGH');
    expect(r.reasons).toEqual([
      'Sem treinar há 25 dias',
      'Aderência de 20% no mês',
      '3 cobranças em atraso',
      'Notas baixas nos treinos',
      'Relatou dor em vários treinos',
      'Plano termina em 5 dias',
    ]);
  });

  it('níveis intermediários', () => {
    expect(churnRisk({ ...base, daysSinceLastWorkout: 12, adherence4w: 0.6 })).toMatchObject({
      score: 30,
      level: 'MEDIUM',
    });
    expect(churnRisk({ ...base, daysSinceLastWorkout: null, overdueInvoices: 1 })).toMatchObject({
      score: 45,
      reasons: ['Ainda não treinou', '1 cobrança em atraso'],
    });
    expect(
      churnRisk({ ...base, adherence4w: null, avgRating: null, planEndsInDays: 30 }).score,
    ).toBe(0);
    expect(churnRisk({ ...base, planEndsInDays: -2 }).score).toBe(0);
  });
});
