import type { FeedbackInput, SyncSessionInput } from '@vetta/contracts';

/** Formato do treino do dia / link público vindo da API (o que o player usa). */
export interface ApiSet {
  id: string;
  type: 'WARMUP' | 'WORK' | 'DROP' | 'FAILURE' | 'CARDIO';
  reps: string | null;
  targetLoadKg: string | number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  rpe: string | number | null;
  rir: number | null;
  cadence: string | null;
  notes: string | null;
}
export interface ApiItem {
  id: string;
  exerciseId: string;
  method: string;
  groupKey: string | null;
  restSeconds: number | null;
  notes: string | null;
  exercise: {
    id: string;
    name: string;
    instructions?: string | null;
    tips?: string | null;
    media?: {
      video: string | null;
      gif: string | null;
      thumbnail: string | null;
      image: string | null;
    } | null;
  };
  sets: ApiSet[];
  lastPerformance: { date: string; sets: { loadKg: number; reps: number }[] } | null;
  suggestion: { loadKg: number; reps: number; reason: string } | null;
}
export interface ApiRoutine {
  id: string;
  label: string;
  name: string | null;
  notes: string | null;
  exercises: ApiItem[];
}
export interface ApiProgram {
  id: string;
  name: string;
  isExtra?: boolean;
  routines: ApiRoutine[];
  nextRoutineId?: string | null;
}

export interface PlayerSet {
  setOrder: number;
  type: ApiSet['type'];
  targetReps: string | null;
  targetLoadKg: number | null;
  restSeconds: number;
  reps: number | null;
  loadKg: number | null;
  done: boolean;
  skipped: boolean;
}

export interface PlayerItem {
  itemId: string;
  /** Exercício executado (pode ter sido trocado por um equivalente). */
  exerciseId: string;
  originalExerciseId: string;
  name: string;
  method: string;
  groupKey: string | null;
  notes: string | null;
  note: string;
  media: ApiItem['exercise']['media'];
  sets: PlayerSet[];
}

const num = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? null : Number(v);

function repsTarget(r: string | null): number | null {
  const m = /^(\d+)(?:\s*[-–a]\s*(\d+))?$/.exec((r ?? '').trim());
  return m ? Number(m[2] ?? m[1]) : null;
}

/**
 * Monta as séries do player com carga e reps pré-preenchidas:
 * 1º a última execução; 2º a sugestão de progressão; 3º o prescrito.
 */
export function buildPlayer(routine: ApiRoutine, defaultRest = 60): PlayerItem[] {
  return routine.exercises.map((i) => ({
    itemId: i.id,
    exerciseId: i.exerciseId,
    originalExerciseId: i.exerciseId,
    name: i.exercise.name,
    method: i.method,
    groupKey: i.groupKey,
    notes: i.notes,
    note: '',
    media: i.exercise.media ?? null,
    sets: i.sets.map((s, idx) => {
      const last = i.lastPerformance?.sets[idx];
      const workLoad = s.type === 'WORK' ? i.suggestion?.loadKg : undefined;
      return {
        setOrder: idx,
        type: s.type,
        targetReps: s.reps,
        targetLoadKg: num(s.targetLoadKg),
        restSeconds: s.restSeconds ?? i.restSeconds ?? defaultRest,
        loadKg: last?.loadKg ?? (workLoad || null) ?? num(s.targetLoadKg),
        reps: last?.reps ?? repsTarget(s.reps),
        done: false,
        skipped: false,
      };
    }),
  }));
}

export interface Position {
  item: number;
  set: number;
}

/** Próxima série pendente. Em bi-set/circuito alterna entre os itens do grupo. */
export function nextPosition(items: PlayerItem[], from: Position): Position | null {
  const pending = (p: Position) => {
    const s = items[p.item]?.sets[p.set];
    return !!s && !s.done && !s.skipped;
  };
  const cur = items[from.item];
  if (cur?.groupKey) {
    const group = items
      .map((it, idx) => ({ it, idx }))
      .filter((x) => x.it.groupKey === cur.groupKey);
    const order = group.findIndex((g) => g.idx === from.item);
    for (let k = 1; k <= group.length; k++) {
      const g = group[(order + k) % group.length]!;
      const setIdx = g.it.sets.findIndex((s) => !s.done && !s.skipped);
      if (setIdx >= 0) return { item: g.idx, set: setIdx };
    }
  }
  for (let i = 0; i < items.length; i++) {
    const idx = (from.item + i) % items.length;
    const setIdx = items[idx]!.sets.findIndex((_, si) => pending({ item: idx, set: si }));
    if (setIdx >= 0) return { item: idx, set: setIdx };
  }
  return null;
}

export const isFinished = (items: PlayerItem[]) =>
  items.every((i) => i.sets.every((s) => s.done || s.skipped));

export function progress(items: PlayerItem[]) {
  const all = items.flatMap((i) => i.sets);
  return { done: all.filter((s) => s.done || s.skipped).length, total: all.length };
}

export function toSyncPayload(
  items: PlayerItem[],
  o: {
    clientSessionId: string;
    programId: string | null;
    routineId: string | null;
    startedAt: Date;
    finishedAt: Date;
    feedback: FeedbackInput;
  },
): SyncSessionInput {
  return {
    clientSessionId: o.clientSessionId,
    programId: o.programId,
    routineId: o.routineId,
    startedAt: o.startedAt.toISOString(),
    finishedAt: o.finishedAt.toISOString(),
    feedback: o.feedback,
    sets: items.flatMap((i) =>
      i.sets.map((s) => ({
        routineExerciseId: i.itemId,
        exerciseId: i.exerciseId,
        setOrder: s.setOrder,
        reps: s.reps,
        loadKg: s.loadKg,
        completed: s.done,
        skipped: s.skipped,
        notes: i.note || null,
      })),
    ),
  };
}

/** UUID v4 sem depender de crypto.randomUUID (Hermes antigo). */
export function newClientSessionId(): string {
  const g = globalThis.crypto;
  if (g?.randomUUID) return g.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
