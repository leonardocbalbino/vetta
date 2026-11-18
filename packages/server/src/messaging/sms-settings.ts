import type { PrismaClient } from '@vetta/db';
import { decryptSecret, encryptSecret } from '../crypto';
import {
  TextbeeSmsProvider,
  TwilioSmsProvider,
  UnconfiguredSmsProvider,
  type SmsMessage,
  type SmsProvider,
} from './messaging';

/**
 * SMS configurado no admin (tabela platform_integrations, kind "sms"): cada provedor tem
 * configuração, segredos cifrados, ligado/desligado e prioridade. O envio tenta na ordem
 * de prioridade e cai para o próximo se um falhar.
 */

export const SMS_PROVIDERS = ['textbee', 'twilio'] as const;
export type SmsProviderCode = (typeof SMS_PROVIDERS)[number];

export interface SmsProviderFields {
  textbee: { config: { deviceId?: string; baseUrl?: string }; secrets: { apiKey?: string } };
  twilio: { config: { accountSid?: string; from?: string }; secrets: { authToken?: string } };
}

type Row = {
  provider: string;
  enabled: boolean;
  priority: number;
  config: unknown;
  secretsEncrypted: string | null;
};

export function decryptSecrets(row: { secretsEncrypted: string | null }, key: string) {
  if (!row.secretsEncrypted) return {} as Record<string, string>;
  try {
    return JSON.parse(decryptSecret(row.secretsEncrypted, key)) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
}

export const encryptSecrets = (secrets: Record<string, string>, key: string) =>
  encryptSecret(JSON.stringify(secrets), key);

/** Monta o provedor a partir da linha; null se faltar credencial obrigatória. */
export function providerFromRow(row: Row, key: string): SmsProvider | null {
  const config = (row.config ?? {}) as Record<string, string | undefined>;
  const secrets = decryptSecrets(row, key);
  if (row.provider === 'textbee') {
    if (!secrets.apiKey) return null;
    return new TextbeeSmsProvider({
      apiKey: secrets.apiKey,
      deviceId: config.deviceId || undefined,
      baseUrl: config.baseUrl || undefined,
    });
  }
  if (row.provider === 'twilio') {
    if (!config.accountSid || !config.from || !secrets.authToken) return null;
    return new TwilioSmsProvider({
      accountSid: config.accountSid,
      authToken: secrets.authToken,
      from: config.from,
    });
  }
  return null;
}

/** Tenta cada provedor na ordem; só falha se todos falharem. */
export class FailoverSmsProvider implements SmsProvider {
  readonly name: string;
  constructor(private readonly providers: SmsProvider[]) {
    this.name = providers.map((p) => p.name).join('>') || 'unconfigured';
  }
  async send(m: SmsMessage): Promise<{ id: string }> {
    const errors: string[] = [];
    for (const p of this.providers) {
      try {
        const r = await p.send(m);
        return { id: `${p.name}:${r.id}` };
      } catch (e) {
        errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new Error(errors.length ? errors.join(' | ') : 'Nenhum provedor de SMS configurado');
  }
}

export async function loadSmsChain(db: PrismaClient, key: string): Promise<SmsProvider[]> {
  const rows = await db.platformIntegration.findMany({
    where: { kind: 'sms', enabled: true },
    orderBy: { priority: 'asc' },
  });
  return rows.map((r) => providerFromRow(r, key)).filter((p): p is SmsProvider => !!p);
}

/**
 * Provedor usado pelo worker: lê a configuração do admin (cache de 1 minuto). Sem nada
 * configurado no admin, usa o das variáveis de ambiente.
 */
export class AdminConfiguredSmsProvider implements SmsProvider {
  readonly name = 'admin';
  private cache: { at: number; chain: SmsProvider[] } | null = null;
  constructor(
    private readonly db: PrismaClient,
    private readonly encryptionKey: string,
    private readonly fallback: SmsProvider = new UnconfiguredSmsProvider(),
    private readonly ttlMs = 60_000,
  ) {}

  async send(m: SmsMessage): Promise<{ id: string }> {
    if (!this.cache || Date.now() - this.cache.at > this.ttlMs) {
      this.cache = { at: Date.now(), chain: await loadSmsChain(this.db, this.encryptionKey) };
    }
    const chain = this.cache.chain.length ? this.cache.chain : [this.fallback];
    return new FailoverSmsProvider(chain).send(m);
  }
}
