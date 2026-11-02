import type { NotificationCategory, NotificationChannel } from '@vetta/contracts';
import { MANDATORY_CATEGORIES } from '@vetta/contracts';

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" no fuso do usuário. */
  start: string;
  end: string;
}

export interface RecipientContext {
  timezone: string;
  quietHours: QuietHours;
  /** Preferências explícitas "CATEGORIA:CANAL" → enabled. Ausente = padrão. */
  preferences: ReadonlyMap<string, boolean>;
  hasEmail: boolean;
  hasPhone: boolean;
  pushDevices: number;
  /** Opt-in de WhatsApp registrado (consents, tipo WHATSAPP). */
  whatsappOptIn?: boolean;
}

export interface DecisionInput {
  category: NotificationCategory;
  channel: NotificationChannel;
  immediate?: boolean;
  delaySeconds?: number;
  now: Date;
  recipient: RecipientContext;
  /** Features do tenant de origem (WhatsApp só no Pro Plus). */
  tenantFeatures: { whatsapp: boolean };
  /** Existe template aprovado na Meta para o evento (só WhatsApp). */
  hasWhatsAppTemplate?: boolean;
}

export type Decision =
  | { send: true; at: Date; deferredByQuietHours: boolean }
  | {
      send: false;
      reason:
        'preference' | 'plan' | 'no_address' | 'channel_not_allowed' | 'no_opt_in' | 'no_template';
    };

/** Canais que respeitam horário de silêncio (o in-app é silencioso e sempre imediato). */
const QUIET_CHANNELS: ReadonlySet<NotificationChannel> = new Set([
  'PUSH',
  'EMAIL',
  'WHATSAPP',
  'SMS',
]);

/** Preferência padrão quando o usuário nunca escolheu. Marketing é opt-in (LGPD). */
export function defaultPreference(
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  if (category === 'MARKETING') return channel === 'IN_APP';
  if (channel === 'SMS') return category === 'SECURITY';
  return true;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Hora local (minutos desde 00:00) no fuso informado. */
export function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/**
 * Se `now` está dentro do horário de silêncio, retorna quantos minutos faltam
 * para o fim; senão 0. Suporta janelas que atravessam a meia-noite (22:00–07:00).
 */
export function minutesUntilQuietEnds(now: Date, timezone: string, q: QuietHours): number {
  if (!q.enabled) return 0;
  const start = toMinutes(q.start);
  const end = toMinutes(q.end);
  if (start === end) return 0;
  const t = localMinutes(now, timezone);
  const inside = start < end ? t >= start && t < end : t >= start || t < end;
  if (!inside) return 0;
  return (end - t + 1440) % 1440;
}

/** Decide se e quando uma notificação é entregue num canal. Função pura. */
export function decideDelivery(i: DecisionInput): Decision {
  const security = MANDATORY_CATEGORIES.includes(i.category);

  if (i.channel === 'SMS' && !security) return { send: false, reason: 'channel_not_allowed' };
  if (i.channel === 'WHATSAPP') {
    if (!i.tenantFeatures.whatsapp) return { send: false, reason: 'plan' };
    // WhatsApp só com template aprovado e opt-in registrado do destinatário.
    if (!i.hasWhatsAppTemplate) return { send: false, reason: 'no_template' };
    if (!i.recipient.whatsappOptIn) return { send: false, reason: 'no_opt_in' };
  }

  if (!security) {
    const pref = i.recipient.preferences.get(`${i.category}:${i.channel}`);
    if (!(pref ?? defaultPreference(i.category, i.channel)))
      return { send: false, reason: 'preference' };
  }

  if (i.channel === 'EMAIL' && !i.recipient.hasEmail) return { send: false, reason: 'no_address' };
  if ((i.channel === 'WHATSAPP' || i.channel === 'SMS') && !i.recipient.hasPhone) {
    return { send: false, reason: 'no_address' };
  }
  if (i.channel === 'PUSH' && i.recipient.pushDevices === 0)
    return { send: false, reason: 'no_address' };

  let at = new Date(i.now.getTime() + (i.delaySeconds ?? 0) * 1000);
  let deferred = false;
  // "immediate" pula o silêncio no push e no e-mail, nunca no WhatsApp.
  const quiet = !i.immediate || i.channel === 'WHATSAPP';
  if (!security && quiet && QUIET_CHANNELS.has(i.channel)) {
    const wait = minutesUntilQuietEnds(at, i.recipient.timezone, i.recipient.quietHours);
    if (wait > 0) {
      const target = new Date(at.getTime() + wait * 60_000);
      target.setUTCSeconds(0, 0);
      at = target;
      deferred = true;
    }
  }
  return { send: true, at, deferredByQuietHours: deferred };
}
