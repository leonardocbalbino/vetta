/**
 * Agenda: recorrência semanal (subconjunto do RFC 5545) e slots de disponibilidade.
 * Horários são locais do fuso do personal e convertidos para UTC na gravação.
 */

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type Weekday = (typeof DAYS)[number];

export interface WeeklyRule {
  interval: number;
  byDay: Weekday[];
  count?: number;
  /** Data civil limite (inclusiva). */
  until?: string;
}

export class InvalidRecurrenceError extends Error {}

/** Lê "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=10" (ou UNTIL=20260131). */
export function parseRRule(rrule: string): WeeklyRule {
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, '')
      .split(';')
      .filter(Boolean)
      .map((p) => {
        const [k, v] = p.split('=');
        return [k!.toUpperCase(), (v ?? '').toUpperCase()];
      }),
  );
  if (parts.FREQ !== 'WEEKLY') throw new InvalidRecurrenceError('Só há recorrência semanal.');
  const byDay = (parts.BYDAY ?? '').split(',').filter(Boolean) as Weekday[];
  if (!byDay.length || byDay.some((d) => !DAYS.includes(d)))
    throw new InvalidRecurrenceError('Informe os dias da semana (BYDAY).');
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 8)
    throw new InvalidRecurrenceError('Intervalo deve ser de 1 a 8 semanas.');
  const rule: WeeklyRule = { interval, byDay };
  if (parts.COUNT) {
    const count = Number(parts.COUNT);
    if (!Number.isInteger(count) || count < 1) throw new InvalidRecurrenceError('COUNT inválido.');
    rule.count = count;
  }
  if (parts.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL);
    if (!m) throw new InvalidRecurrenceError('UNTIL inválido.');
    rule.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (rule.count && rule.until) throw new InvalidRecurrenceError('Use COUNT ou UNTIL, não ambos.');
  return rule;
}

export function formatRRule(r: WeeklyRule): string {
  const parts = [`FREQ=WEEKLY`, `INTERVAL=${r.interval}`, `BYDAY=${r.byDay.join(',')}`];
  if (r.count) parts.push(`COUNT=${r.count}`);
  if (r.until) parts.push(`UNTIL=${r.until.replaceAll('-', '')}`);
  return parts.join(';');
}

const DAY = 86_400_000;
const parseDate = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Datas civis das ocorrências a partir de `start` (inclusive), até `maxOccurrences`
 * ou `horizon` (data civil). A data inicial conta como 1ª ocorrência se cair num BYDAY.
 */
export function expandWeekly(
  start: string,
  rule: WeeklyRule,
  opts: { maxOccurrences?: number; horizon?: string } = {},
): string[] {
  const out: string[] = [];
  const startMs = parseDate(start);
  const startDow = new Date(startMs).getUTCDay();
  const weekStart = startMs - startDow * DAY; // domingo da semana inicial
  const limit = Math.min(rule.count ?? Infinity, opts.maxOccurrences ?? 500);
  const end = Math.min(
    rule.until ? parseDate(rule.until) : Infinity,
    opts.horizon ? parseDate(opts.horizon) : Infinity,
  );
  const days = rule.byDay.map((d) => DAYS.indexOf(d)).sort((a, b) => a - b);
  for (let w = 0; out.length < limit; w += rule.interval) {
    for (const dow of days) {
      const ms = weekStart + (w * 7 + dow) * DAY;
      if (ms < startMs) continue;
      if (ms > end || out.length >= limit) return out;
      out.push(fmt(ms));
    }
    if (weekStart + w * 7 * DAY > end) return out;
  }
  return out;
}

// ─── Fuso ────────────────────────────────────────────────────────────────────

/** Deslocamento (min) do fuso no instante dado: horário local = UTC + offset. */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-03-10" + "07:30" no fuso → instante UTC. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [h, m] = time.split(':').map(Number);
  const guess = Date.parse(`${date}T00:00:00Z`) + (h! * 60 + m!) * 60_000;
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  const first = guess - offset * 60_000;
  // Ajuste se o deslocamento mudou entre o palpite e o resultado (horário de verão).
  const offset2 = tzOffsetMinutes(new Date(first), timeZone);
  return new Date(guess - offset2 * 60_000);
}

/** Dia da semana (0 = domingo) e minutos do dia no fuso. */
export function zonedParts(
  at: Date,
  timeZone: string,
): { date: string; weekday: number; minutes: number } {
  const local = new Date(at.getTime() + tzOffsetMinutes(at, timeZone) * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    weekday: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

// ─── Disponibilidade ─────────────────────────────────────────────────────────

export interface AvailabilityWindow {
  weekday: number;
  /** Minutos desde 00:00 locais. */
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}

export interface Busy {
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

const overlaps = (a: Busy, b: Busy) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * Horários livres entre `from` e `to` (datas civis inclusivas): janelas semanais
 * menos bloqueios e compromissos; nada antes de `notBefore` (antecedência mínima).
 */
export function freeSlots(input: {
  windows: readonly AvailabilityWindow[];
  busy: readonly Busy[];
  from: string;
  to: string;
  timeZone: string;
  notBefore: Date;
}): Slot[] {
  const out: Slot[] = [];
  for (let ms = parseDate(input.from); ms <= parseDate(input.to); ms += DAY) {
    const date = fmt(ms);
    const weekday = new Date(ms).getUTCDay();
    for (const w of input.windows.filter((x) => x.weekday === weekday)) {
      for (let m = w.startMinute; m + w.slotMinutes <= w.endMinute; m += w.slotMinutes) {
        const hhmm = (v: number) =>
          `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
        const slot = {
          startsAt: zonedToUtc(date, hhmm(m), input.timeZone),
          endsAt: zonedToUtc(date, hhmm(m + w.slotMinutes), input.timeZone),
        };
        if (slot.startsAt < input.notBefore) continue;
        if (input.busy.some((b) => overlaps(b, slot))) continue;
        out.push(slot);
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Política de antecedência: pode agendar/cancelar até `hours` antes do início. */
export const withinPolicy = (startsAt: Date, now: Date, hours: number) =>
  startsAt.getTime() - now.getTime() >= hours * 3_600_000;
