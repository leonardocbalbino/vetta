/**
 * Domínio próprio do personal (white label). O personal cria um CNAME para o alvo da
 * Vetta; o provider registra o hostname e emite o certificado (Cloudflare for SaaS).
 */

export type HostnameStatus = 'pending' | 'active' | 'failed';

export interface HostnameState {
  id: string;
  hostname: string;
  status: HostnameStatus;
  /** Certificado TLS emitido. */
  sslActive: boolean;
  /** Erros de verificação para mostrar ao personal. */
  errors: string[];
}

export interface CustomDomainProvider {
  readonly name: string;
  readonly target: string;
  create(hostname: string): Promise<HostnameState>;
  get(id: string): Promise<HostnameState>;
  remove(id: string): Promise<void>;
}

export class CustomDomainNotConfiguredError extends Error {
  constructor() {
    super('Domínio próprio não configurado (Cloudflare for SaaS).');
  }
}

export class UnconfiguredCustomDomainProvider implements CustomDomainProvider {
  readonly name = 'unconfigured';
  constructor(readonly target: string) {}
  create(): Promise<HostnameState> {
    return Promise.reject(new CustomDomainNotConfiguredError());
  }
  get(): Promise<HostnameState> {
    return Promise.reject(new CustomDomainNotConfiguredError());
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

interface CfHostname {
  id: string;
  hostname: string;
  status: string;
  ssl?: { status?: string; validation_errors?: { message: string }[] };
  verification_errors?: string[];
}

export interface CloudflareConfig {
  zoneId: string;
  token: string;
  target: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Cloudflare for SaaS: POST/GET/DELETE /zones/:zone/custom_hostnames. */
export class CloudflareCustomDomainProvider implements CustomDomainProvider {
  readonly name = 'cloudflare';
  readonly target: string;
  constructor(private readonly config: CloudflareConfig) {
    this.target = config.target;
  }

  create(hostname: string): Promise<HostnameState> {
    return this.call('POST', '', {
      hostname,
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    });
  }

  get(id: string): Promise<HostnameState> {
    return this.call('GET', `/${id}`);
  }

  async remove(id: string): Promise<void> {
    await this.call('DELETE', `/${id}`).catch((e: unknown) => {
      if (!(e instanceof Error && e.message.includes('404'))) throw e;
    });
  }

  private async call(method: string, path: string, body?: unknown): Promise<HostnameState> {
    const f = this.config.fetch ?? fetch;
    const base = this.config.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    const res = await f(`${base}/zones/${this.config.zoneId}/custom_hostnames${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.token}`,
        'content-type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: CfHostname;
      errors?: { message: string }[];
    };
    if (!res.ok || json.success === false) {
      throw new Error(
        `Cloudflare ${res.status}: ${json.errors?.map((e) => e.message).join('; ') || 'erro'}`,
      );
    }
    return method === 'DELETE' || !json.result
      ? { id: path.slice(1), hostname: '', status: 'failed', sslActive: false, errors: [] }
      : toState(json.result);
  }
}

export function toState(h: CfHostname): HostnameState {
  const ssl = h.ssl?.status ?? 'pending';
  const errors = [
    ...(h.verification_errors ?? []),
    ...(h.ssl?.validation_errors ?? []).map((e) => e.message),
  ];
  const failed = ['blocked', 'moved', 'deleted'].includes(h.status) || ssl.includes('timed_out');
  return {
    id: h.id,
    hostname: h.hostname,
    status: failed ? 'failed' : h.status === 'active' && ssl === 'active' ? 'active' : 'pending',
    sslActive: ssl === 'active',
    errors,
  };
}

export function createCustomDomainProvider(env: {
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_SAAS_TOKEN?: string;
  CUSTOM_DOMAIN_TARGET: string;
}): CustomDomainProvider {
  if (!env.CLOUDFLARE_ZONE_ID || !env.CLOUDFLARE_SAAS_TOKEN)
    return new UnconfiguredCustomDomainProvider(env.CUSTOM_DOMAIN_TARGET);
  return new CloudflareCustomDomainProvider({
    zoneId: env.CLOUDFLARE_ZONE_ID,
    token: env.CLOUDFLARE_SAAS_TOKEN,
    target: env.CUSTOM_DOMAIN_TARGET,
  });
}

/** Dublê em memória (testes e desenvolvimento local): ativa na N-ésima consulta. */
export class MemoryCustomDomainProvider implements CustomDomainProvider {
  readonly name = 'memory';
  readonly hosts = new Map<string, { hostname: string; checks: number }>();
  constructor(
    readonly target = 'custom.vettafit.dev',
    private readonly activateAfter = 1,
  ) {}
  create(hostname: string): Promise<HostnameState> {
    const id = `cf_${hostname}`;
    this.hosts.set(id, { hostname, checks: 0 });
    return Promise.resolve({ id, hostname, status: 'pending', sslActive: false, errors: [] });
  }
  get(id: string): Promise<HostnameState> {
    const h = this.hosts.get(id);
    if (!h) return Promise.reject(new Error('Cloudflare 404'));
    h.checks++;
    const active = h.checks >= this.activateAfter;
    return Promise.resolve({
      id,
      hostname: h.hostname,
      status: active ? 'active' : 'pending',
      sslActive: active,
      errors: active ? [] : ['CNAME ainda não encontrado.'],
    });
  }
  remove(id: string): Promise<void> {
    this.hosts.delete(id);
    return Promise.resolve();
  }
}
