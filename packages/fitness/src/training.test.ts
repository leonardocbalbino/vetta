import { describe, expect, it } from 'vitest';
import {
  bestsOf,
  detectRecords,
  mergeBests,
  parseReps,
  suggestNext,
  weeklyVolume,
} from './training.js';

describe('parseReps', () => {
  it.each([
    ['10', { min: 10, max: 10 }],
    ['8-12', { min: 8, max: 12 }],
    ['8 – 12', { min: 8, max: 12 }],
    ['8 a 12', { min: 8, max: 12 }],
    [12, { min: 12, max: 12 }],
    ['até a falha', null],
    ['12-8', null],
    ['0', null],
    [0, null],
    [2.5, null],
    ['', null],
    [null, null],
    [undefined, null],
  ] as const)('%s', (input, expected) => {
    expect(parseReps(input)).toEqual(expected);
  });
});

describe('recordes pessoais', () => {
  const sets = [
    { loadKg: 60, reps: 10 },
    { loadKg: 70, reps: 6 },
    { loadKg: 0, reps: 10 },
    { loadKg: 40, reps: 20 },
  ];

  it('melhores marcas da sessão (1RM só até 12 reps)', () => {
    expect(bestsOf(sets)).toEqual({ maxLoadKg: 70, bestOneRmKg: 84, maxSessionVolumeKg: 1820 });
  });

  it('primeira vez = todos os recordes', () => {
    expect(detectRecords(null, sets).map((r) => r.type)).toEqual([
      'MAX_LOAD',
      'ONE_RM',
      'MAX_VOLUME',
    ]);
  });

  it('só o que superou o histórico', () => {
    const prev = { maxLoadKg: 75, bestOneRmKg: 80, maxSessionVolumeKg: 5000 };
    expect(detectRecords(prev, sets)).toEqual([{ type: 'ONE_RM', value: 84, previous: 80 }]);
    expect(
      detectRecords({ maxLoadKg: 100, bestOneRmKg: 100, maxSessionVolumeKg: 9999 }, sets),
    ).toEqual([]);
  });

  it('combina históricos', () => {
    const a = { maxLoadKg: 50, bestOneRmKg: 90, maxSessionVolumeKg: 100 };
    expect(mergeBests(a, { maxLoadKg: 60, bestOneRmKg: 80, maxSessionVolumeKg: 200 })).toEqual({
      maxLoadKg: 60,
      bestOneRmKg: 90,
      maxSessionVolumeKg: 200,
    });
    expect(mergeBests(null, a)).toBe(a);
  });
});

describe('dupla progressão', () => {
  const target = { min: 8, max: 12 };
  it('todas no topo da faixa → sobe a carga', () => {
    expect(
      suggestNext({
        lastSets: [
          { loadKg: 40, reps: 12 },
          { loadKg: 40, reps: 12 },
        ],
        target,
      }),
    ).toEqual({
      loadKg: 42.5,
      reps: 8,
      reason: 'progress',
    });
  });
  it('alguma abaixo do mínimo → reduz ~5%', () => {
    expect(
      suggestNext({
        lastSets: [
          { loadKg: 50, reps: 9 },
          { loadKg: 50, reps: 6 },
        ],
        target,
        incrementKg: 2,
      }),
    ).toEqual({
      loadKg: 48,
      reps: 8,
      reason: 'deload',
    });
  });
  it('dentro da faixa → repete a carga buscando +1 rep', () => {
    expect(
      suggestNext({
        lastSets: [
          { loadKg: 40, reps: 10 },
          { loadKg: 40, reps: 9 },
        ],
        target,
      }),
    ).toEqual({
      loadKg: 40,
      reps: 11,
      reason: 'repeat',
    });
  });
  it('sem histórico', () => {
    expect(suggestNext({ lastSets: [{ loadKg: 0, reps: 0 }], target })).toEqual({
      loadKg: 0,
      reps: 8,
      reason: 'no_history',
    });
  });
});

describe('volume semanal', () => {
  it('agrupa por semana ISO (segunda-feira)', () => {
    const r = weeklyVolume([
      { date: new Date('2026-11-02T10:00:00Z'), loadKg: 50, reps: 10 }, // segunda
      { date: new Date('2026-11-08T10:00:00Z'), loadKg: 50, reps: 10 }, // domingo, mesma semana
      { date: new Date('2026-11-09T10:00:00Z'), loadKg: 20, reps: -3 }, // próxima semana
      { date: new Date('2026-10-28T10:00:00Z'), loadKg: 10, reps: 10 },
    ]);
    expect(r).toEqual([
      { weekStart: '2026-10-26', volumeKg: 100 },
      { weekStart: '2026-11-02', volumeKg: 1000 },
      { weekStart: '2026-11-09', volumeKg: 0 },
    ]);
  });
});
