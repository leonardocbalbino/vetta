import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Produção: Resend. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly client: Resend;
  constructor(
    apiKey: string,
    private readonly defaultFrom: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(m: EmailMessage) {
    const { data, error } = await this.client.emails.send({
      from: m.from ?? this.defaultFrom,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
      ...(m.tags ? { tags: Object.entries(m.tags).map(([name, value]) => ({ name, value })) } : {}),
    });
    if (error || !data) throw new Error(`Resend: ${error?.message ?? 'sem resposta'}`);
    return { id: data.id };
  }
}

/** Desenvolvimento: SMTP (Mailpit em localhost:1025, UI em localhost:8025). */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transport: nodemailer.Transporter;
  constructor(
    url: string,
    private readonly defaultFrom: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(m: EmailMessage) {
    const info = await this.transport.sendMail({
      from: m.from ?? this.defaultFrom,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
    });
    return { id: String(info.messageId) };
  }
}

export function createEmailProvider(env: {
  EMAIL_PROVIDER: 'smtp' | 'resend';
  EMAIL_FROM: string;
  SMTP_URL: string;
  RESEND_API_KEY?: string | undefined;
}): EmailProvider {
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY)
      throw new Error('RESEND_API_KEY é obrigatória com EMAIL_PROVIDER=resend');
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new SmtpEmailProvider(env.SMTP_URL, env.EMAIL_FROM);
}
