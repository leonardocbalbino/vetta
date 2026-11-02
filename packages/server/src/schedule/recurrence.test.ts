import { describe, expect, it } from 'vitest';
import {
  expandWeekly,
  formatRRule,
  freeSlots,
  InvalidRecurrenceError,
  parseRRule,
  withinPolicy,
  zonedParts,
  zonedToUtc,
} from './recurrence';

describe('RRULE semanal', () => {
  it('lê e escreve', () => {
    const r = parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
    expect(r).toEqual({ interval: 2, byDay: ['MO', 'WE'], count: 6 });
    expect(formatRRule(r)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
    expect(parseRRule('FREQ=WEEKLY;BYDAY=FR;UNTIL=20260331T235959Z')).toEqual({
      interval: 1,
      byDay: ['FR'],
      until: '2026-03-31',
    });
    expect(formatRRule({ interval: 1, byDay: ['FR'], until: '2026-03-31' })).toContain(
      'UNTIL=20260331',
    );
  });

  it('rejeita regras fora do suportado', () => {
    expect(() => parseRRule('FREQ=DAILY;BYDAY=MO')).toThrow(InvalidRecurrenceError);
    expect(() => parseRRule('FREQ=WEEKLY')).toThrow(/BYDAY/);
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=XX')).toThrow(/BYDAY/);
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=MO;INTERVAL=0')).toThrow(/Intervalo/);
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=MO;COUNT=0')).toThrow(/COUNT/);
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=MO;UNTIL=amanha')).toThrow(/UNTIL/);
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=MO;COUNT=2;UNTIL=20260101')).toThrow(/ambos/);
  });

  it('expande ocorrências por COUNT, UNTIL e horizonte', () => {
    // 2026-03-02 é segunda-feira
    expect(expandWeekly('2026-03-02', { interval: 1, byDay: ['MO', 'WE'], count: 4 })).toEqual([
      '2026-03-02',
      '2026-03-04',
      '2026-03-09',
      '2026-03-11',
    ]);
    expect(
      expandWeekly('2026-03-04', { interval: 2, byDay: ['MO', 'WE'], until: '2026-03-30' }),
    ).toEqual(['2026-03-04', '2026-03-16', '2026-03-18', '2026-03-30']);
    expect(
      expandWeekly('2026-03-02', { interval: 1, byDay: ['FR'] }, { horizon: '2026-03-20' }),
    ).toEqual(['2026-03-06', '2026-03-13', '2026-03-20']);
    expect(
      expandWeekly('2026-03-02', { interval: 1, byDay: ['TU'] }, { maxOccurrences: 2 }),
    ).toHaveLength(2);
    expect(expandWeekly('2026-03-02', { interval: 1, byDay: ['SU'], until: '2026-03-03' })).toEqual(
      [],
    );
  });
});

describe('fuso', () => {
  it('converte horário local para UTC e de volta', () => {
    const at = zonedToUtc('2026-03-10', '07:30', 'America/Sao_Paulo');
    expect(at.toISOString()).toBe('2026-03-10T10:30:00.000Z');
    expect(zonedParts(at, 'America/Sao_Paulo')).toEqual({
      date: '2026-03-10',
      weekday: 2,
      minutes: 450,
    });
    // fuso com horário de verão
    expect(zonedToUtc('2026-07-01', '09:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
  });
});

describe('slots livres', () => {
  const tz = 'America/Sao_Paulo';
  const windows = [{ weekday: 2, startMinute: 7 * 60, endMinute: 9 * 60 + 30, slotMinutes: 60 }];

  it('quebra a janela em slots, tira ocupados e respeita a antecedência', () => {
    const slots = freeSlots({
      windows,
      busy: [
        {
          startsAt: zonedToUtc('2026-03-10', '08:00', tz),
          endsAt: zonedToUtc('2026-03-10', '08:30', tz),
        },
      ],
      from: '2026-03-09',
      to: '2026-03-17',
      timeZone: tz,
      notBefore: zonedToUtc('2026-03-10', '06:00', tz),
    });
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-03-10T10:00:00.000Z',
      '2026-03-17T10:00:00.000Z',
      '2026-03-17T11:00:00.000Z',
    ]);
    const late = freeSlots({
      windows,
      busy: [],
      from: '2026-03-10',
      to: '2026-03-10',
      timeZone: tz,
      notBefore: zonedToUtc('2026-03-10', '07:30', tz),
    });
    expect(late).toHaveLength(1);
  });

  it('política de antecedência', () => {
    const now = new Date('2026-03-10T10:00:00Z');
    expect(withinPolicy(new Date('2026-03-11T10:00:00Z'), now, 24)).toBe(true);
    expect(withinPolicy(new Date('2026-03-11T09:59:00Z'), now, 24)).toBe(false);
  });
});
