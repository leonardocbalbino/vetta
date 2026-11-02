import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarProvider, parseGoogleEvent, SyncTokenExpiredError } from './calendar/google';
import {
  CloudflareCustomDomainProvider,
  MemoryCustomDomainProvider,
  toState,
} from './domains/custom-domain';
import { MetaWhatsAppProvider, TwilioSmsProvider, WHATSAPP_TEMPLATES } from './messaging/messaging';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = [string, { body: string }];
const call = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i] as Call;

describe('WhatsApp (Cloud API)', () => {
  it('envia template aprovado com as variáveis na ordem', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { messages: [{ id: 'wamid.1' }] }));
    const wa = new MetaWhatsAppProvider({
      baseUrl: 'https://bsp.example/v21.0/',
      token: 't',
      phoneNumberId: '123',
      fetch,
    });
    const r = await wa.sendTemplate({
      to: '+5511999990000',
      template: 'vetta_cobranca_atraso',
      locale: 'pt-BR',
      variables: ['Ana', 'R$ 199,00'],
    });
    expect(r.id).toBe('wamid.1');
    const [url, init] = call(fetch);
    expect(url).toBe('https://bsp.example/v21.0/123/messages');
    const body = JSON.parse(init.body) as {
      template: { language: { code: string }; components: { parameters: { text: string }[] }[] };
    };
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5511999990000',
      type: 'template',
    });
    expect(body.template.language.code).toBe('pt_BR');
    expect(body.template.components[0]!.parameters.map((p) => p.text)).toEqual([
      'Ana',
      'R$ 199,00',
    ]);
  });

  it('falha com a mensagem da Meta', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(400, { error: { message: 'Template não aprovado' } }));
    const wa = new MetaWhatsAppProvider({
      baseUrl: 'https://x',
      token: 't',
      phoneNumberId: '1',
      fetch,
    });
    await expect(
      wa.sendTemplate({ to: '+55', template: 'x', locale: 'pt-BR', variables: [] }),
    ).rejects.toThrow('Template não aprovado');
  });

  it('mapeia só cobrança, treino e agenda', () => {
    expect(Object.keys(WHATSAPP_TEMPLATES).sort()).toEqual([
      'appointment.reminder',
      'invoice.created',
      'invoice.overdue',
      'invoice.reminder',
      'training.reminder',
    ]);
    expect(
      WHATSAPP_TEMPLATES['invoice.overdue']!.variables({
        name: 'Ana',
        amount: 'R$ 1',
        dueDate: null,
      }),
    ).toEqual(['Ana', 'R$ 1', '-']);
  });
});

describe('SMS (Twilio)', () => {
  it('usa Messaging Service quando o remetente começa com MG', async () => {
    const fetch = vi.fn().mockResolvedValue(json(201, { sid: 'SM1' }));
    const sms = new TwilioSmsProvider({ accountSid: 'AC1', authToken: 'x', from: 'MG123', fetch });
    expect((await sms.send({ to: '+5511', body: 'Código 123456' })).id).toBe('SM1');
    const body = new URLSearchParams(call(fetch)[1].body);
    expect(body.get('MessagingServiceSid')).toBe('MG123');
    expect(body.get('Body')).toBe('Código 123456');
  });
});

describe('domínio próprio (Cloudflare for SaaS)', () => {
  it('traduz o estado do custom hostname', () => {
    expect(
      toState({ id: '1', hostname: 'a.b.com', status: 'active', ssl: { status: 'active' } }).status,
    ).toBe('active');
    expect(
      toState({
        id: '1',
        hostname: 'a.b.com',
        status: 'pending',
        ssl: { status: 'pending_validation' },
      }).status,
    ).toBe('pending');
    const failed = toState({
      id: '1',
      hostname: 'a',
      status: 'blocked',
      verification_errors: ['CNAME errado'],
    });
    expect(failed).toMatchObject({ status: 'failed', errors: ['CNAME errado'] });
  });

  it('cria o hostname com validação DV por HTTP', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(200, {
        success: true,
        result: {
          id: 'h1',
          hostname: 'app.ana.com.br',
          status: 'pending',
          ssl: { status: 'initializing' },
        },
      }),
    );
    const cf = new CloudflareCustomDomainProvider({
      zoneId: 'z',
      token: 't',
      target: 'custom.vettafit.com.br',
      fetch,
    });
    expect(await cf.create('app.ana.com.br')).toMatchObject({ id: 'h1', status: 'pending' });
    const [url, init] = call(fetch);
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/custom_hostnames');
    expect((JSON.parse(init.body) as { ssl: unknown }).ssl).toMatchObject({
      method: 'http',
      type: 'dv',
    });
  });

  it('dublê em memória ativa após as consultas', async () => {
    const m = new MemoryCustomDomainProvider('t', 2);
    const h = await m.create('x.com');
    expect((await m.get(h.id)).status).toBe('pending');
    expect((await m.get(h.id)).status).toBe('active');
  });
});

describe('Google Calendar', () => {
  it('lê eventos da Vetta, externos, de dia inteiro e cancelados', () => {
    const e = parseGoogleEvent({
      id: 'g1',
      status: 'confirmed',
      summary: 'Treino',
      updated: '2026-11-02T10:00:00Z',
      start: { dateTime: '2026-11-03T10:00:00-03:00' },
      end: { dateTime: '2026-11-03T11:00:00-03:00' },
      extendedProperties: { private: { vettaAppointmentId: 'a1' } },
    });
    expect(e).toMatchObject({ vettaAppointmentId: 'a1', allDay: false, transparent: false });
    expect(e.start?.toISOString()).toBe('2026-11-03T13:00:00.000Z');
    expect(
      parseGoogleEvent({ id: 'g2', start: { date: '2026-11-04' }, end: { date: '2026-11-05' } })
        .allDay,
    ).toBe(true);
    expect(parseGoogleEvent({ id: 'g3', status: 'cancelled' }).status).toBe('cancelled');
  });

  it('pagina as mudanças e sinaliza syncToken expirado (410)', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, { items: [{ id: 'a' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json(200, { items: [{ id: 'b' }], nextSyncToken: 's2' }))
      .mockResolvedValueOnce(json(410, {}));
    const g = new GoogleCalendarProvider({ clientId: 'c', clientSecret: 's', fetch });
    const r = await g.listChanges('tok', 'primary', 's1');
    expect(r.events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(r.nextSyncToken).toBe('s2');
    expect(call(fetch, 1)[0]).toContain('pageToken=p2');
    await expect(g.listChanges('tok', 'primary', 'velho')).rejects.toBeInstanceOf(
      SyncTokenExpiredError,
    );
  });

  it('URL de autorização pede acesso offline ao calendário', () => {
    const url = new URL(
      new GoogleCalendarProvider({ clientId: 'c', clientSecret: 's' }).authUrl(
        'st',
        'https://api/cb',
      ),
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('calendar.events');
    expect(url.searchParams.get('state')).toBe('st');
  });
});
