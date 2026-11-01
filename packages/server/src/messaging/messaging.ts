/**
 * WhatsApp (API oficial da Meta) e SMS. Implementação real na Fase 3;
 * por ora as interfaces e um provider que só registra o envio em log.
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
    super(`Canal ${channel} ainda não configurado (previsto para a Fase 3)`);
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
