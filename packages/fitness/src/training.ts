import { oneRepMax, type PerformedSet } from './basics.js';

export interface RepRange {
  min: number;
  max: number;
}

/** "10" → 10–10; "8-12" ou "8 a 12" → 8–12; texto livre (ex.: "até a falha") → null. */
export function parseReps(reps: string | number | null | undefined): RepRange | null {
  if (typeof reps === 'number')
    return Number.isInteger(reps) && reps > 0 ? { min: reps, max: reps } : null;
  if (!reps) return null;
  const m = /^\s*(\d+)\s*(?:[-–a]\s*(\d+))?\s*$/i.exec(reps);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return a > 0 && b >= a ? { min: a, max: b } : null;
}

export interface ExerciseBests {
  maxLoadKg: number;
  bestOneRmKg: number;
  maxSessionVolumeKg: number;
}

export type RecordType = 'MAX_LOAD' | 'ONE_RM' | 'MAX_VOLUME';

export interface NewRecord {
  type: RecordType;
  value: number;
  previous: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Melhores marcas de uma lista de séries (uma sessão). */
export function bestsOf(sets: readonly PerformedSet[]): ExerciseBests {
  const valid = sets.filter((s) => s.loadKg > 0 && s.reps > 0);
  return {
    maxLoadKg: valid.reduce((m, s) => Math.max(m, s.loadKg), 0),
    bestOneRmKg: valid.reduce(
      (m, s) => Math.max(m, s.reps <= 12 ? oneRepMax(s.loadKg, s.reps) : 0),
      0,
    ),
    maxSessionVolumeKg: round1(valid.reduce((a, s) => a + s.loadKg * s.reps, 0)),
  };
}

/** Recordes pessoais batidos nesta sessão em relação ao histórico. */
export function detectRecords(
  previous: ExerciseBests | null,
  sessionSets: readonly PerformedSet[],
): NewRecord[] {
  const now = bestsOf(sessionSets);
  const prev = previous ?? { maxLoadKg: 0, bestOneRmKg: 0, maxSessionVolumeKg: 0 };
  const out: NewRecord[] = [];
  if (now.maxLoadKg > prev.maxLoadKg)
    out.push({ type: 'MAX_LOAD', value: now.maxLoadKg, previous: prev.maxLoadKg });
  if (now.bestOneRmKg > prev.bestOneRmKg)
    out.push({ type: 'ONE_RM', value: now.bestOneRmKg, previous: prev.bestOneRmKg });
  if (now.maxSessionVolumeKg > prev.maxSessionVolumeKg) {
    out.push({
      type: 'MAX_VOLUME',
      value: now.maxSessionVolumeKg,
      previous: prev.maxSessionVolumeKg,
    });
  }
  return out;
}

/** Junta as melhores marcas históricas com as de uma sessão nova. */
export function mergeBests(a: ExerciseBests | null, b: ExerciseBests): ExerciseBests {
  if (!a) return b;
  return {
    maxLoadKg: Math.max(a.maxLoadKg, b.maxLoadKg),
    bestOneRmKg: Math.max(a.bestOneRmKg, b.bestOneRmKg),
    maxSessionVolumeKg: Math.max(a.maxSessionVolumeKg, b.maxSessionVolumeKg),
  };
}

export interface ProgressionInput {
  /** Séries da última execução do exercício. */
  lastSets: readonly PerformedSet[];
  /** Faixa prescrita (ex.: 8–12). */
  target: RepRange;
  /** Incremento em kg (padrão 2,5). */
  incrementKg?: number;
}

export interface Suggestion {
  loadKg: number;
  reps: number;
  reason: 'progress' | 'repeat' | 'deload' | 'no_history';
}

/**
 * Dupla progressão: se todas as séries atingiram o topo da faixa, sobe a carga;
 * se alguma ficou abaixo do mínimo, reduz ~5%; senão repete a carga buscando mais reps.
 */
export function suggestNext(i: ProgressionInput): Suggestion {
  const sets = i.lastSets.filter((s) => s.reps > 0);
  if (!sets.length) return { loadKg: 0, reps: i.target.min, reason: 'no_history' };
  const load = Math.max(...sets.map((s) => s.loadKg));
  const step = i.incrementKg ?? 2.5;
  if (sets.every((s) => s.reps >= i.target.max))
    return { loadKg: round1(load + step), reps: i.target.min, reason: 'progress' };
  if (sets.some((s) => s.reps < i.target.min)) {
    return {
      loadKg: Math.max(0, Math.round((load * 0.95) / step) * step),
      reps: i.target.min,
      reason: 'deload',
    };
  }
  const bestReps = Math.max(...sets.filter((s) => s.loadKg === load).map((s) => s.reps));
  return { loadKg: load, reps: Math.min(i.target.max, bestReps + 1), reason: 'repeat' };
}

/** Volume semanal (kg) agrupado pela segunda-feira da semana ISO, em UTC. */
export function weeklyVolume(
  entries: readonly { date: Date; loadKg: number; reps: number }[],
): { weekStart: string; volumeKg: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(
      Date.UTC(e.date.getUTCFullYear(), e.date.getUTCMonth(), e.date.getUTCDate()),
    );
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + Math.max(0, e.loadKg) * Math.max(0, e.reps));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, v]) => ({ weekStart, volumeKg: round1(v) }));
}
