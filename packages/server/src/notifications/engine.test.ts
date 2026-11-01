import { describe, expect, it } from 'vitest';
import {
  decideDelivery,
  defaultPreference,
  minutesUntilQuietEnds,
  type RecipientContext,
} from './engine';
import { assertRulesConsistent, NOTIFICATION_RULES } from './rules';
import { localeFallbacks, renderTemplate } from './template';

const TZ = 'America/Sao_Paulo'; // UTC-3, sem horário de verão
const at = (localHHMM: string) => {
  const [h, m] = localHHMM.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 2, (h! + 3) % 24, m!, 0));
};
const recipient = (over: Partial<RecipientContext> = {}): RecipientContext => ({
  timezone: TZ,
  quietHours: { enabled: true, start: '22:00', end: '07:00' },
  preferences: new Map(),
  hasEmail: true,
  hasPhone: true,
  pushDevices: 1,
  ...over,
});
const base = { tenantFeatures: { whatsapp: false } };

describe('horário de silêncio', () => {
  it.each([
    ['21:59', 0],
    ['22:00', 540],
    ['23:30', 450],
    ['03:00', 240],
    ['06:59', 1],
    ['07:00', 0],
    ['12:00', 0],
  ])('às %s faltam %i min', (time, expected) => {
    expect(
      minutesUntilQuietEnds(at(time), TZ, { enabled: true, start: '22:00', end: '07:00' }),
    ).toBe(expected);
  });

  it('respeita o fuso do usuário', () => {
    // 01:00 UTC = 22:00 em São Paulo, mas 02:00 em Lisboa (fora da janela 22–07? não: dentro)
    const now = new Date(Date.UTC(2026, 10, 2, 1, 0));
    expect(
      minutesUntilQuietEnds(now, 'America/Sao_Paulo', {
        enabled: true,
        start: '22:00',
        end: '07:00',
      }),
    ).toBe(540);
    expect(
      minutesUntilQuietEnds(now, 'Asia/Tokyo', { enabled: true, start: '22:00', end: '07:00' }),
    ).toBe(0);
  });

  it('desligado não adia', () => {
    expect(
      minutesUntilQuietEnds(at('23:00'), TZ, { enabled: false, start: '22:00', end: '07:00' }),
    ).toBe(0);
  });

  it('push às 23h é adiado para as 7h', () => {
    const d = decideDelivery({
      ...base,
      category: 'TRAINING',
      channel: 'PUSH',
      now: at('23:00'),
      recipient: recipient(),
    });
    expect(d).toMatchObject({ send: true, deferredByQuietHours: true });
    // 23:00 de 01/11 em SP = 02:00Z de 02/11; o fim do silêncio é 07:00 local = 10:00Z
    if (d.send) expect(d.at.toISOString()).toBe('2026-11-02T10:00:00.000Z');
  });

  it('in-app é sempre imediato', () => {
    const now = at('23:00');
    const d = decideDelivery({
      ...base,
      category: 'TRAINING',
      channel: 'IN_APP',
      now,
      recipient: recipient(),
    });
    expect(d).toEqual({ send: true, at: now, deferredByQuietHours: false });
  });

  it('segurança ignora o horário de silêncio', () => {
    const now = at('02:00');
    const d = decideDelivery({
      ...base,
      category: 'SECURITY',
      channel: 'EMAIL',
      now,
      recipient: recipient(),
    });
    expect(d).toEqual({ send: true, at: now, deferredByQuietHours: false });
  });

  it('eventos transacionais (immediate) ignoram o silêncio', () => {
    const now = at('23:00');
    const d = decideDelivery({
      ...base,
      category: 'SYSTEM',
      channel: 'EMAIL',
      immediate: true,
      now,
      recipient: recipient(),
    });
    expect(d).toMatchObject({ send: true, deferredByQuietHours: false });
  });
});

describe('preferências', () => {
  it('canal desligado pelo usuário não envia', () => {
    const d = decideDelivery({
      ...base,
      category: 'TRAINING',
      channel: 'PUSH',
      now: at('12:00'),
      recipient: recipient({ preferences: new Map([['TRAINING:PUSH', false]]) }),
    });
    expect(d).toEqual({ send: false, reason: 'preference' });
  });

  it('segurança não pode ser desligada', () => {
    const d = decideDelivery({
      ...base,
      category: 'SECURITY',
      channel: 'EMAIL',
      now: at('12:00'),
      recipient: recipient({ preferences: new Map([['SECURITY:EMAIL', false]]) }),
    });
    expect(d.send).toBe(true);
  });

  it('marketing é opt-in', () => {
    expect(defaultPreference('MARKETING', 'EMAIL')).toBe(false);
    expect(defaultPreference('MARKETING', 'IN_APP')).toBe(true);
    const d = decideDelivery({
      ...base,
      category: 'MARKETING',
      channel: 'EMAIL',
      now: at('12:00'),
      recipient: recipient(),
    });
    expect(d).toEqual({ send: false, reason: 'preference' });
  });
});

describe('plano e endereços', () => {
  it('WhatsApp só com a feature do plano', () => {
    const r = recipient();
    expect(
      decideDelivery({
        ...base,
        category: 'FINANCE',
        channel: 'WHATSAPP',
        now: at('12:00'),
        recipient: r,
      }),
    ).toEqual({
      send: false,
      reason: 'plan',
    });
    expect(
      decideDelivery({
        category: 'FINANCE',
        channel: 'WHATSAPP',
        now: at('12:00'),
        recipient: r,
        tenantFeatures: { whatsapp: true },
      }).send,
    ).toBe(true);
  });

  it('SMS só para segurança', () => {
    expect(
      decideDelivery({
        ...base,
        category: 'FINANCE',
        channel: 'SMS',
        now: at('12:00'),
        recipient: recipient(),
      }),
    ).toEqual({
      send: false,
      reason: 'channel_not_allowed',
    });
  });

  it('sem dispositivo não há push', () => {
    expect(
      decideDelivery({
        ...base,
        category: 'TRAINING',
        channel: 'PUSH',
        now: at('12:00'),
        recipient: recipient({ pushDevices: 0 }),
      }),
    ).toEqual({ send: false, reason: 'no_address' });
  });
});

describe('regras e templates', () => {
  it('regras coerentes com o catálogo de eventos', () => {
    expect(() => assertRulesConsistent()).not.toThrow();
    expect(Object.keys(NOTIFICATION_RULES).length).toBeGreaterThan(10);
  });

  it('toda regra gera deep link', () => {
    for (const rule of Object.values(NOTIFICATION_RULES)) {
      const link = rule!.deepLink({
        id: 'e',
        name: rule!.event,
        tenantId: 't',
        actorId: null,
        occurredAt: '',
        payload: { token: 'abc', mediaId: 'm' },
      });
      expect(link.startsWith('/')).toBe(true);
    }
  });

  it('renderiza variáveis e ignora ausentes', () => {
    expect(
      renderTemplate('Olá, {{name}}! {{ missing }}{{a.b}}', { name: 'Ana', a: { b: 1 } }),
    ).toBe('Olá, Ana! 1');
  });

  it('fallback de idioma', () => {
    expect(localeFallbacks('en-US')).toEqual(['en-US', 'en', 'pt-BR']);
    expect(localeFallbacks('pt-BR')).toEqual(['pt-BR', 'pt']);
  });
});
