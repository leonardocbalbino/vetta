/**
 * WhatsApp (API oficial da Meta, direto ou via BSP) e SMS (só segurança).
 * Sem credenciais, os providers "unconfigured" falham e o envio fica registrado como falha.
 */
export interface WhatsAppMessage {
  /** Telefone em E.164 (+5511999999999). */
  to: string;
  /** Template aprovado na Meta. */
  template: string;
  locale: string;
  variables: string[];
}

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(m: WhatsAppMessage): Promise<{ id: string }>;
}

export interface SmsMessage {
  to: string;
  body: string;
}

/** SMS é usado apenas para a categoria SEGURANÇA. */
export interface SmsProvider {
  readonly name: string;
  send(m: SmsMessage): Promise<{ id: string }>;
}

export class NotConfiguredError extends Error {
  constructor(channel: string) {
    super(`Canal ${channel} não configurado`);
  }
}

export class UnconfiguredWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'unconfigured';
  sendTemplate(): Promise<{ id: string }> {
    return Promise.reject(new NotConfiguredError('WhatsApp'));
  }
}

export class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = 'unconfigured';
  send(): Promise<{ id: string }> {
    return Promise.reject(new NotConfiguredError('SMS'));
  }
}

// ─── Fase 3: implementações reais ───────────────────────────────────────────

/**
 * Templates aprovados na Meta, por evento. O WhatsApp só envia eventos mapeados aqui
 * (cobrança, lembrete de treino e agenda); as variáveis seguem a ordem do template.
 */
export const WHATSAPP_TEMPLATES: Record<
  string,
  { name: string; variables: (vars: Record<string, unknown>) => string[] }
> = {
  'invoice.created': {
    name: 'vetta_cobranca_nova',
    variables: (v) => [str(v.name), str(v.tenantName), str(v.amount), str(v.dueDate)],
  },
  'invoice.reminder': {
    name: 'vetta_cobranca_lembrete',
    variables: (v) => [str(v.name), str(v.amount), str(v.dueDate)],
  },
  'invoice.overdue': {
    name: 'vetta_cobranca_atraso',
    variables: (v) => [str(v.name), str(v.amount), str(v.dueDate)],
  },
  'training.reminder': {
    name: 'vetta_lembrete_treino',
    variables: (v) => [str(v.name), str(v.tenantName)],
  },
  'appointment.reminder': {
    name: 'vetta_lembrete_aula',
    variables: (v) => [str(v.name), str(v.title), str(v.when)],
  },
};

const str = (v: unknown) => (v === undefined || v === null ? '-' : String(v)).slice(0, 200);

export interface MetaWhatsAppConfig {
  /** Graph API da Meta ou o endpoint compatível do BSP. */
  baseUrl: string;
  token: string;
  phoneNumberId: string;
  fetch?: typeof fetch;
}

/** API oficial do WhatsApp Business (Cloud API), direto ou via BSP compatível. */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta';
  constructor(private readonly config: MetaWhatsAppConfig) {}

  async sendTemplate(m: WhatsAppMessage): Promise<{ id: string }> {
    const f = this.config.fetch ?? fetch;
    const res = await f(
      `${this.config.baseUrl.replace(/\/$/, '')}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: m.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: m.template,
            language: { code: m.locale.replace('-', '_') },
            components: m.variables.length
              ? [
                  {
                    type: 'body',
                    parameters: m.variables.map((text) => ({ type: 'text', text })),
                  },
                ]
              : [],
          },
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok || !body.messages?.[0]?.id) {
      throw new Error(`WhatsApp ${res.status}: ${body.error?.message ?? 'falha no envio'}`);
    }
    return { id: body.messages[0].id };
  }
}

export interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  /** Número remetente ou Messaging Service SID (MG…). */
  from: string;
  fetch?: typeof fetch;
}

/** SMS via Twilio (só códigos e alertas de segurança). */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  constructor(private readonly config: TwilioSmsConfig) {}

  async send(m: SmsMessage): Promise<{ id: string }> {
    const f = this.config.fetch ?? fetch;
    const form = new URLSearchParams({ To: m.to, Body: m.body.slice(0, 600) });
    form.set(this.config.from.startsWith('MG') ? 'MessagingServiceSid' : 'From', this.config.from);
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
      'base64',
    );
    const res = await f(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok || !body.sid) throw new Error(`SMS ${res.status}: ${body.message ?? 'falha'}`);
    return { id: body.sid };
  }
}

export function createWhatsAppProvider(env: {
  WHATSAPP_BASE_URL: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
}): WhatsAppProvider {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID)
    return new UnconfiguredWhatsAppProvider();
  return new MetaWhatsAppProvider({
    baseUrl: env.WHATSAPP_BASE_URL,
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
  });
}

export function createSmsProvider(env: {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
}): SmsProvider {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM)
    return new UnconfiguredSmsProvider();
  return new TwilioSmsProvider({
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    from: env.TWILIO_FROM,
  });
}
