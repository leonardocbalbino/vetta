/**
 * Periodização: regras de progressão por semana (linear, ondulatória ou em blocos),
 * semana de deload e calendário das fases. Datas são dias civis "YYYY-MM-DD".
 */

export type PeriodizationModel = 'LINEAR' | 'UNDULATING' | 'BLOCK';

export interface WeekStep {
  /** Variação de carga em % sobre a carga base (ex.: 2.5 = +2,5%). */
  loadPct?: number;
  /** Repetições a somar (pode ser negativo). */
  repsDelta?: number;
  /** Séries a somar (pode ser negativo). */
  setsDelta?: number;
}

export interface ProgressionRule {
  model: PeriodizationModel;
  /** Ajuste fixo da fase inteira (ênfase do bloco). */
  base?: WeekStep;
  /** LINEAR e BLOCK: incremento acumulado a cada semana a partir da 2ª. */
  perWeek?: WeekStep;
  /** UNDULATING: ondas repetidas em ciclo (semana 1 = onda 1). */
  wave?: WeekStep[];
  /** Deload a cada N semanas (ex.: 4 = semanas 4, 8...). */
  deloadEvery?: number;
  /** Semanas de deload explícitas (1 = primeira semana da fase). */
  deloadWeeks?: number[];
  /** Redução de carga no deload, em % (padrão 10). */
  deloadLoadPct?: number;
  /** Redução de séries no deload, em % (padrão 40). */
  deloadVolumePct?: number;
  /** Arredonda a carga para múltiplos deste valor (padrão 0,5 kg). */
  loadIncrementKg?: number;
}

export interface WeekAdjustment {
  week: number;
  loadFactor: number;
  repsDelta: number;
  setsDelta: number;
  setsFactor: number;
  deload: boolean;
}

export class InvalidProgressionError extends Error {}

function validate(rule: ProgressionRule) {
  if (rule.model === 'UNDULATING' && !rule.wave?.length)
    throw new InvalidProgressionError('A periodização ondulatória precisa de ao menos uma onda.');
  if (
    rule.deloadEvery !== undefined &&
    (!Number.isInteger(rule.deloadEvery) || rule.deloadEvery < 2)
  )
    throw new InvalidProgressionError('O deload precisa de um intervalo de 2 semanas ou mais.');
}

export function isDeloadWeek(rule: ProgressionRule, week: number): boolean {
  if (rule.deloadWeeks?.includes(week)) return true;
  return !!rule.deloadEvery && week % rule.deloadEvery === 0;
}

/** Ajuste da semana `week` (1 = primeira semana da fase). */
export function weekAdjustment(rule: ProgressionRule, week: number): WeekAdjustment {
  validate(rule);
  if (!Number.isInteger(week) || week < 1) throw new InvalidProgressionError('Semana inválida.');
  const base = rule.base ?? {};
  let loadPct = base.loadPct ?? 0;
  let repsDelta = base.repsDelta ?? 0;
  let setsDelta = base.setsDelta ?? 0;

  if (rule.model === 'UNDULATING') {
    const w = rule.wave![(week - 1) % rule.wave!.length]!;
    loadPct += w.loadPct ?? 0;
    repsDelta += w.repsDelta ?? 0;
    setsDelta += w.setsDelta ?? 0;
  } else if (rule.perWeek) {
    // Semanas de deload não contam para o acúmulo (a progressão retoma de onde parou).
    let steps = 0;
    for (let i = 2; i <= week; i++) if (!isDeloadWeek(rule, i)) steps++;
    loadPct += (rule.perWeek.loadPct ?? 0) * steps;
    repsDelta += (rule.perWeek.repsDelta ?? 0) * steps;
    setsDelta += (rule.perWeek.setsDelta ?? 0) * steps;
  }

  const deload = isDeloadWeek(rule, week);
  let loadFactor = 1 + loadPct / 100;
  let setsFactor = 1;
  if (deload) {
    loadFactor *= 1 - (rule.deloadLoadPct ?? 10) / 100;
    setsFactor = 1 - (rule.deloadVolumePct ?? 40) / 100;
  }
  return { week, loadFactor, repsDelta, setsDelta, setsFactor, deload };
}

export interface SetTarget {
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  loadKg: number | null;
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Aplica o ajuste da semana a um alvo da rotina (séries, reps e carga). */
export function applyAdjustment(
  target: SetTarget,
  adj: WeekAdjustment,
  rule: Pick<ProgressionRule, 'loadIncrementKg'> = {},
): SetTarget {
  const step = rule.loadIncrementKg ?? 0.5;
  const reps = (r: number | null) => (r === null ? null : Math.max(1, r + adj.repsDelta));
  return {
    sets: Math.max(1, Math.round((target.sets + adj.setsDelta) * adj.setsFactor)),
    repsMin: reps(target.repsMin),
    repsMax: reps(target.repsMax),
    loadKg:
      target.loadKg === null
        ? null
        : Math.max(0, Number(roundTo(target.loadKg * adj.loadFactor, step).toFixed(2))),
  };
}

// ─── Calendário ──────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const parse = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new InvalidProgressionError(`Data inválida: ${d}`);
  return Date.parse(`${d}T00:00:00Z`);
};
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return fmt(parse(date) + days * DAY);
}

export interface PhaseSpan {
  index: number;
  startsOn: string;
  /** Último dia da fase (inclusivo). */
  endsOn: string;
  weeks: number;
}

/** Datas de cada fase, em sequência, a partir do início da periodização. */
export function phaseCalendar(startsOn: string, phases: readonly { weeks: number }[]): PhaseSpan[] {
  let cursor = parse(startsOn);
  return phases.map((p, index) => {
    if (!Number.isInteger(p.weeks) || p.weeks < 1)
      throw new InvalidProgressionError('Cada fase precisa de ao menos 1 semana.');
    const span = {
      index,
      startsOn: fmt(cursor),
      endsOn: fmt(cursor + (p.weeks * 7 - 1) * DAY),
      weeks: p.weeks,
    };
    cursor += p.weeks * 7 * DAY;
    return span;
  });
}

export interface WeekLocation {
  phaseIndex: number;
  /** Semana dentro da fase (1-based). */
  week: number;
  /** Semana desde o início da periodização (1-based). */
  overallWeek: number;
  /** Primeiro dia da fase: data da troca de rotina. */
  phaseStartsOn: string;
}

/** Em que fase e semana cai a data. Null antes do início ou depois do fim. */
export function locateWeek(
  startsOn: string,
  phases: readonly { weeks: number }[],
  date: string,
): WeekLocation | null {
  const days = Math.floor((parse(date) - parse(startsOn)) / DAY);
  if (days < 0) return null;
  let weeksBefore = 0;
  for (const span of phaseCalendar(startsOn, phases)) {
    const offset = days - weeksBefore * 7;
    if (offset < span.weeks * 7) {
      const week = Math.floor(offset / 7) + 1;
      return {
        phaseIndex: span.index,
        week,
        overallWeek: weeksBefore + week,
        phaseStartsOn: span.startsOn,
      };
    }
    weeksBefore += span.weeks;
  }
  return null;
}
