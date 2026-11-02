import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyAdjustment,
  InvalidProgressionError,
  isDeloadWeek,
  locateWeek,
  phaseCalendar,
  weekAdjustment,
  type ProgressionRule,
} from './periodization.js';

const base = { sets: 4, repsMin: 8, repsMax: 12, loadKg: 100 };

describe('weekAdjustment', () => {
  it('linear: +2,5% de carga e -1 rep por semana, acumulando', () => {
    const rule: ProgressionRule = { model: 'LINEAR', perWeek: { loadPct: 2.5, repsDelta: -1 } };
    expect(weekAdjustment(rule, 1)).toMatchObject({ loadFactor: 1, repsDelta: 0, deload: false });
    const w3 = weekAdjustment(rule, 3);
    expect(w3.loadFactor).toBeCloseTo(1.05);
    expect(w3.repsDelta).toBe(-2);
    expect(applyAdjustment(base, w3)).toEqual({ sets: 4, repsMin: 6, repsMax: 10, loadKg: 105 });
  });

  it('linear com séries: +1 série por semana', () => {
    const rule: ProgressionRule = { model: 'LINEAR', perWeek: { setsDelta: 1 } };
    expect(applyAdjustment(base, weekAdjustment(rule, 3)).sets).toBe(6);
  });

  it('deload a cada 4 semanas: -10% carga, -40% séries, e não conta para o acúmulo', () => {
    const rule: ProgressionRule = { model: 'LINEAR', perWeek: { loadPct: 5 }, deloadEvery: 4 };
    const w4 = weekAdjustment(rule, 4);
    expect(w4.deload).toBe(true);
    expect(w4.loadFactor).toBeCloseTo(1.1 * 0.9);
    expect(applyAdjustment(base, w4)).toMatchObject({ sets: 2, loadKg: 99 });
    // semana 5 retoma: semanas 2, 3 e 5 contam (4 foi deload) = +15%
    expect(weekAdjustment(rule, 5).loadFactor).toBeCloseTo(1.15);
  });

  it('deload explícito e percentuais próprios', () => {
    const rule: ProgressionRule = {
      model: 'BLOCK',
      deloadWeeks: [2],
      deloadLoadPct: 20,
      deloadVolumePct: 50,
    };
    expect(isDeloadWeek(rule, 2)).toBe(true);
    expect(isDeloadWeek(rule, 3)).toBe(false);
    expect(applyAdjustment(base, weekAdjustment(rule, 2))).toMatchObject({ sets: 2, loadKg: 80 });
  });

  it('ondulatória: as ondas se repetem em ciclo', () => {
    const rule: ProgressionRule = {
      model: 'UNDULATING',
      wave: [{ repsDelta: 2 }, { loadPct: 5 }, { loadPct: 10, repsDelta: -4, setsDelta: 1 }],
    };
    expect(weekAdjustment(rule, 1)).toMatchObject({ repsDelta: 2, loadFactor: 1 });
    expect(weekAdjustment(rule, 2).loadFactor).toBeCloseTo(1.05);
    expect(weekAdjustment(rule, 3)).toMatchObject({ repsDelta: -4, setsDelta: 1 });
    expect(weekAdjustment(rule, 4)).toMatchObject({ repsDelta: 2 });
  });

  it('blocos: ênfase fixa da fase somada ao incremento semanal', () => {
    const rule: ProgressionRule = {
      model: 'BLOCK',
      base: { loadPct: -10, repsDelta: 4, setsDelta: 1 },
      perWeek: { loadPct: 2 },
    };
    const w2 = weekAdjustment(rule, 2);
    expect(w2.loadFactor).toBeCloseTo(0.92);
    expect(applyAdjustment(base, w2)).toEqual({ sets: 5, repsMin: 12, repsMax: 16, loadKg: 92 });
  });

  it('sem regra de progressão: mantém o alvo', () => {
    expect(applyAdjustment(base, weekAdjustment({ model: 'LINEAR' }, 5))).toEqual(base);
  });

  it('rejeita configurações inválidas', () => {
    expect(() => weekAdjustment({ model: 'UNDULATING' }, 1)).toThrow(InvalidProgressionError);
    expect(() => weekAdjustment({ model: 'LINEAR', deloadEvery: 1 }, 1)).toThrow(/2 semanas/);
    expect(() => weekAdjustment({ model: 'LINEAR', deloadEvery: 2.5 }, 1)).toThrow();
    expect(() => weekAdjustment({ model: 'LINEAR' }, 0)).toThrow(/Semana/);
  });
});

describe('applyAdjustment', () => {
  it('arredonda a carga ao incremento, preserva nulos e nunca zera reps e séries', () => {
    const adj = weekAdjustment(
      { model: 'LINEAR', perWeek: { loadPct: 3, repsDelta: -20, setsDelta: -10 } },
      2,
    );
    expect(applyAdjustment({ sets: 3, repsMin: null, repsMax: 10, loadKg: 41 }, adj)).toEqual({
      sets: 1,
      repsMin: null,
      repsMax: 1,
      loadKg: 42,
    });
    expect(applyAdjustment({ ...base, loadKg: null }, adj).loadKg).toBeNull();
    expect(applyAdjustment({ ...base, loadKg: 41 }, adj, { loadIncrementKg: 2 }).loadKg).toBe(42);
  });

  it('carga nunca fica negativa', () => {
    const adj = weekAdjustment({ model: 'BLOCK', base: { loadPct: -150 } }, 1);
    expect(applyAdjustment(base, adj).loadKg).toBe(0);
  });
});

describe('calendário', () => {
  const phases = [{ weeks: 4 }, { weeks: 3 }, { weeks: 2 }];

  it('datas das fases em sequência', () => {
    expect(phaseCalendar('2026-01-05', phases)).toEqual([
      { index: 0, startsOn: '2026-01-05', endsOn: '2026-02-01', weeks: 4 },
      { index: 1, startsOn: '2026-02-02', endsOn: '2026-02-22', weeks: 3 },
      { index: 2, startsOn: '2026-02-23', endsOn: '2026-03-08', weeks: 2 },
    ]);
  });

  it('localiza fase e semana de uma data', () => {
    expect(locateWeek('2026-01-05', phases, '2026-01-04')).toBeNull();
    expect(locateWeek('2026-01-05', phases, '2026-01-05')).toEqual({
      phaseIndex: 0,
      week: 1,
      overallWeek: 1,
      phaseStartsOn: '2026-01-05',
    });
    expect(locateWeek('2026-01-05', phases, '2026-02-10')).toEqual({
      phaseIndex: 1,
      week: 2,
      overallWeek: 6,
      phaseStartsOn: '2026-02-02',
    });
    expect(locateWeek('2026-01-05', phases, '2026-03-08')).toMatchObject({
      phaseIndex: 2,
      week: 2,
    });
    expect(locateWeek('2026-01-05', phases, '2026-03-09')).toBeNull();
  });

  it('valida datas e semanas', () => {
    expect(() => phaseCalendar('05/01/2026', phases)).toThrow(/Data inválida/);
    expect(() => phaseCalendar('2026-01-05', [{ weeks: 0 }])).toThrow(/1 semana/);
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });
});
