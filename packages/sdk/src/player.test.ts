import { describe, expect, it } from 'vitest';
import {
  buildPlayer,
  isFinished,
  nextPosition,
  progress,
  toSyncPayload,
  type ApiRoutine,
} from './player.js';

const set = (o: Partial<ApiRoutine['exercises'][number]['sets'][number]> = {}) => ({
  id: 's',
  type: 'WORK' as const,
  reps: '8-12',
  targetLoadKg: '40',
  durationSeconds: null,
  restSeconds: null,
  rpe: null,
  rir: null,
  cadence: null,
  notes: null,
  ...o,
});
const item = (
  id: string,
  group: string | null,
  o: Partial<ApiRoutine['exercises'][number]> = {},
) => ({
  id,
  exerciseId: `ex-${id}`,
  method: group ? 'BI_SET' : 'STANDARD',
  groupKey: group,
  restSeconds: 90,
  notes: null,
  exercise: { id: `ex-${id}`, name: `Exercício ${id}` },
  sets: [set(), set()],
  lastPerformance: null,
  suggestion: null,
  ...o,
});

describe('player', () => {
  it('pré-preenche pela última execução, depois sugestão, depois prescrição', () => {
    const r: ApiRoutine = {
      id: 'r',
      label: 'A',
      name: null,
      notes: null,
      exercises: [
        item('1', null, { lastPerformance: { date: '', sets: [{ loadKg: 50, reps: 10 }] } }),
        item('2', null, { suggestion: { loadKg: 42.5, reps: 8, reason: 'progress' } }),
      ],
    };
    const p = buildPlayer(r);
    expect(p[0]!.sets.map((s) => [s.loadKg, s.reps])).toEqual([
      [50, 10],
      [40, 12],
    ]);
    expect(p[1]!.sets[0]).toMatchObject({ loadKg: 42.5, reps: 12, restSeconds: 90 });
  });

  it('bi-set alterna entre os exercícios do grupo', () => {
    const p = buildPlayer({
      id: 'r',
      label: 'A',
      name: null,
      notes: null,
      exercises: [item('1', 'g'), item('2', 'g'), item('3', null)],
    });
    p[0]!.sets[0]!.done = true;
    expect(nextPosition(p, { item: 0, set: 0 })).toEqual({ item: 1, set: 0 });
    p[1]!.sets[0]!.done = true;
    expect(nextPosition(p, { item: 1, set: 0 })).toEqual({ item: 0, set: 1 });
    p[0]!.sets[1]!.done = true;
    p[1]!.sets[1]!.skipped = true;
    expect(nextPosition(p, { item: 0, set: 1 })).toEqual({ item: 2, set: 0 });
    for (const s of p[2]!.sets) s.done = true;
    expect(nextPosition(p, { item: 2, set: 1 })).toBeNull();
    expect(isFinished(p)).toBe(true);
    expect(progress(p)).toEqual({ done: 6, total: 6 });
  });

  it('gera o payload de sincronização com séries puladas e trocas', () => {
    const p = buildPlayer({
      id: 'r',
      label: 'A',
      name: null,
      notes: null,
      exercises: [item('1', null)],
    });
    p[0]!.exerciseId = 'ex-substituto';
    p[0]!.sets[0]!.done = true;
    p[0]!.sets[1]!.skipped = true;
    p[0]!.note = 'banco ocupado';
    const s = toSyncPayload(p, {
      clientSessionId: 'abcdefgh',
      programId: 'p',
      routineId: 'r',
      startedAt: new Date('2026-11-01T10:00:00Z'),
      finishedAt: new Date('2026-11-01T11:00:00Z'),
      feedback: { rating: 4, perceivedEffort: 7, hasPain: false },
    });
    expect(s.sets).toEqual([
      expect.objectContaining({
        exerciseId: 'ex-substituto',
        routineExerciseId: '1',
        completed: true,
        skipped: false,
        notes: 'banco ocupado',
      }),
      expect.objectContaining({ completed: false, skipped: true }),
    ]);
  });
});
