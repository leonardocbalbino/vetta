import type {
  ApiError,
  AuthTokens,
  CreateUploadInput,
  CreateUploadResponse,
  EntitlementsResponse,
  InviteStudentInput,
  LoginResponse,
  MediaResponse,
  MeResponse,
  NotificationDto,
  NotificationPreferences,
  RegisterPersonalInput,
  SessionDto,
  UploadStatusResponse,
} from '@vetta/contracts';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message);
  }
  get code() {
    return this.body.code;
  }
  /** 402: feature/limite/cota fora do plano. */
  get isUpgradeRequired() {
    return this.status === 402;
  }
}

/** Onde o app guarda os tokens (web: memória + cookie httpOnly via BFF; mobile: SecureStore). */
export interface TokenStore {
  get(): Promise<AuthTokens | null> | AuthTokens | null;
  set(tokens: AuthTokens | null): Promise<void> | void;
}

export class MemoryTokenStore implements TokenStore {
  private tokens: AuthTokens | null = null;
  get() {
    return this.tokens;
  }
  set(t: AuthTokens | null) {
    this.tokens = t;
  }
}

export interface VettaClientOptions {
  baseUrl: string;
  tokens?: TokenStore;
  /** Vínculo ativo (X-Tenant-Id). */
  getTenantId?: () => string | null;
  /** Chamado quando a sessão expira de vez (refresh falhou). */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | undefined>;

/** Cliente HTTP tipado da API Vetta (web, admin e mobile). */
export class VettaClient {
  readonly tokens: TokenStore;
  private refreshing: Promise<AuthTokens | null> | null = null;
  private readonly fetcher: typeof fetch;

  constructor(private readonly o: VettaClientOptions) {
    this.tokens = o.tokens ?? new MemoryTokenStore();
    this.fetcher = o.fetch ?? ((...args) => fetch(...args));
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
    retry = true,
    /** Força o vínculo (ex.: sessão offline feita em outro tenant). */
    tenantOverride?: string,
  ): Promise<T> {
    const url = new URL(
      path.replace(/^\//, ''),
      this.o.baseUrl.endsWith('/') ? this.o.baseUrl : `${this.o.baseUrl}/`,
    );
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const tokens = await this.tokens.get();
    const tenantId = tenantOverride ?? this.o.getTenantId?.();
    const res = await this.fetcher(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
        ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 401 && retry && tokens?.refreshToken) {
      const fresh = await this.refresh();
      if (fresh) return this.request<T>(method, path, body, query, false, tenantOverride);
    }
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      throw new ApiRequestError(
        res.status,
        (json as ApiError) ?? { code: 'INTERNAL_ERROR', message: res.statusText },
      );
    }
    return json as T;
  }

  /** Um único refresh por vez, mesmo com várias requisições falhando juntas. */
  refresh(): Promise<AuthTokens | null> {
    this.refreshing ??= (async () => {
      try {
        const current = await this.tokens.get();
        if (!current) return null;
        const next = await this.request<AuthTokens>(
          'POST',
          '/v1/auth/refresh',
          { refreshToken: current.refreshToken },
          undefined,
          false,
        );
        await this.tokens.set(next);
        return next;
      } catch {
        await this.tokens.set(null);
        this.o.onSessionExpired?.();
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async keep(r: LoginResponse): Promise<LoginResponse> {
    if ('accessToken' in r) await this.tokens.set(r);
    return r;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────
  auth = {
    register: async (input: RegisterPersonalInput) =>
      this.keep(await this.request<AuthTokens>('POST', '/v1/auth/register', input)),
    login: async (
      email: string,
      password: string,
      device?: { deviceName?: string; platform?: 'IOS' | 'ANDROID' | 'WEB' },
    ) =>
      this.keep(
        await this.request<LoginResponse>('POST', '/v1/auth/login', { email, password, ...device }),
      ),
    loginTwoFactor: async (challengeToken: string, code: string) =>
      this.keep(
        await this.request<AuthTokens>('POST', '/v1/auth/login/2fa', { challengeToken, code }),
      ),
    magicLink: (email: string) =>
      this.request<{ ok: true }>('POST', '/v1/auth/magic-link', { email }),
    verifyMagicLink: async (token: string) =>
      this.keep(await this.request<LoginResponse>('POST', '/v1/auth/magic-link/verify', { token })),
    oauth: async (
      provider: 'GOOGLE' | 'APPLE',
      idToken: string,
      extra?: { name?: string; acceptTerms?: boolean },
    ) =>
      this.keep(
        await this.request<LoginResponse>('POST', '/v1/auth/oauth', {
          provider,
          idToken,
          ...extra,
        }),
      ),
    forgotPassword: (email: string) =>
      this.request<{ ok: true }>('POST', '/v1/auth/password/forgot', { email }),
    resetPassword: (token: string, password: string) =>
      this.request<{ ok: true }>('POST', '/v1/auth/password/reset', { token, password }),
    verifyEmail: (token: string) =>
      this.request<{ ok: true }>('POST', '/v1/auth/verify-email', { token }),
    logout: async () => {
      await this.request('POST', '/v1/auth/logout').catch(() => undefined);
      await this.tokens.set(null);
    },
    sessions: () => this.request<SessionDto[]>('GET', '/v1/auth/sessions'),
    revokeSession: (id: string) => this.request<{ ok: true }>('DELETE', `/v1/auth/sessions/${id}`),
  };

  // ─── Conta e vínculo ──────────────────────────────────────────────────
  me = () => this.request<MeResponse>('GET', '/v1/me');
  entitlements = () => this.request<EntitlementsResponse>('GET', '/v1/me/entitlements');

  students = {
    list: () => this.request<{ items: unknown[] }>('GET', '/v1/students'),
    invite: (input: InviteStudentInput) =>
      this.request<{ studentLinkId: string; inviteUrl: string; expiresAt: string }>(
        'POST',
        '/v1/students/invites',
        input,
      ),
  };

  invites = {
    preview: (token: string) =>
      this.request<{
        tenantName: string;
        studentName: string;
        email: string | null;
        requiresPassword: boolean;
      }>('GET', `/v1/invites/${encodeURIComponent(token)}`),
    accept: async (input: {
      token: string;
      password?: string;
      email?: string;
      name?: string;
      acceptTerms: true;
      acceptHealthDataConsent: boolean;
    }) => this.keep(await this.request<AuthTokens>('POST', '/v1/invites/accept', input)),
  };

  // ─── Uploads ──────────────────────────────────────────────────────────
  uploads = {
    create: (input: CreateUploadInput) =>
      this.request<CreateUploadResponse>('POST', '/v1/uploads', input),
    status: (id: string) => this.request<UploadStatusResponse>('GET', `/v1/uploads/${id}`),
    complete: (id: string) =>
      this.request<UploadStatusResponse>('POST', `/v1/uploads/${id}/complete`),
    media: (id: string) => this.request<MediaResponse>('GET', `/v1/media/${id}`),
    remove: (id: string) => this.request<{ ok: true }>('DELETE', `/v1/media/${id}`),
  };

  // ─── Notificações ─────────────────────────────────────────────────────
  notifications = {
    list: (cursor?: string) =>
      this.request<{ items: NotificationDto[]; nextCursor: string | null }>(
        'GET',
        '/v1/notifications',
        undefined,
        { cursor },
      ),
    unreadCount: () => this.request<{ count: number }>('GET', '/v1/notifications/unread-count'),
    read: (id: string) => this.request<NotificationDto>('PATCH', `/v1/notifications/${id}/read`),
    readAll: () =>
      this.request<{ ok: true; updated: number }>('POST', '/v1/notifications/read-all'),
    preferences: () =>
      this.request<NotificationPreferences>('GET', '/v1/notifications/preferences'),
    updatePreferences: (p: NotificationPreferences) =>
      this.request<NotificationPreferences>('PUT', '/v1/notifications/preferences', p),
    registerDevice: (pushToken: string, platform: 'IOS' | 'ANDROID' | 'WEB', name?: string) =>
      this.request<{ id: string }>('POST', '/v1/devices', { pushToken, platform, name }),
  };
}

export function createVettaClient(o: VettaClientOptions) {
  return new VettaClient(o);
}
