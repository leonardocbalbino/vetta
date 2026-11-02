/**
 * Google Calendar (REST v3) para a sincronização bidirecional da agenda do personal.
 * OAuth 2.0 com acesso offline; notificações de mudança por canal (events.watch).
 */

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
];

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  email: string | null;
}

export interface CalendarEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary: string | null;
  description: string | null;
  location: string | null;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  updated: Date;
  /** Transparente = não bloqueia a agenda ("disponível"). */
  transparent: boolean;
  /** Id da aula na Vetta quando o evento foi criado por nós. */
  vettaAppointmentId: string | null;
}

export interface CalendarEventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  timeZone: string;
  vettaAppointmentId: string;
}

export interface CalendarProvider {
  readonly name: string;
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  /** Mudanças desde o syncToken (null = carga inicial). Lança SyncTokenExpiredError (410). */
  listChanges(
    accessToken: string,
    calendarId: string,
    syncToken: string | null,
  ): Promise<{ events: CalendarEvent[]; nextSyncToken: string }>;
  upsertEvent(
    accessToken: string,
    calendarId: string,
    eventId: string | null,
    input: CalendarEventInput,
  ): Promise<CalendarEvent>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  watch(
    accessToken: string,
    calendarId: string,
    channel: { id: string; token: string; address: string; ttlSeconds: number },
  ): Promise<{ resourceId: string; expiresAt: Date }>;
  stop(accessToken: string, channelId: string, resourceId: string): Promise<void>;
}

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super('Google Calendar não configurado (GOOGLE_OAUTH_CLIENT_ID).');
  }
}

export class SyncTokenExpiredError extends Error {
  constructor() {
    super('syncToken expirado: refazer a carga inicial.');
  }
}

export class CalendarAuthError extends Error {}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
  transparency?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export function parseGoogleEvent(e: GEvent): CalendarEvent {
  const when = (t?: { dateTime?: string; date?: string }) =>
    t?.dateTime ? new Date(t.dateTime) : t?.date ? new Date(`${t.date}T00:00:00Z`) : null;
  return {
    id: e.id,
    status:
      e.status === 'cancelled' ? 'cancelled' : e.status === 'tentative' ? 'tentative' : 'confirmed',
    summary: e.summary ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    start: when(e.start),
    end: when(e.end),
    allDay: !!e.start?.date && !e.start.dateTime,
    updated: e.updated ? new Date(e.updated) : new Date(0),
    transparent: e.transparency === 'transparent',
    vettaAppointmentId: e.extendedProperties?.private?.vettaAppointmentId ?? null,
  };
}

function decodeJwtEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString()) as {
      email?: string;
    };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google';
  constructor(private readonly config: GoogleCalendarConfig) {}

  private get f() {
    return this.config.fetch ?? fetch;
  }

  authUrl(state: string, redirectUri: string): string {
    const q = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const t = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  }

  private async token(params: Record<string, string>): Promise<OAuthTokens> {
    const res = await this.f('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...params,
      }).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      error?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new CalendarAuthError(`Google OAuth: ${body.error ?? res.status}`);
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
      email: decodeJwtEmail(body.id_token),
    };
  }

  private async api<T>(
    accessToken: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.f(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 410) throw new SyncTokenExpiredError();
    if (res.status === 401) throw new CalendarAuthError('Google Calendar: token inválido');
    if (res.status === 204 || (method === 'DELETE' && res.ok)) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${json.error?.message ?? ''}`);
    return json;
  }

  async listChanges(accessToken: string, calendarId: string, syncToken: string | null) {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken = '';
    const cal = encodeURIComponent(calendarId);
    do {
      const q = new URLSearchParams({
        maxResults: '250',
        showDeleted: 'true',
        singleEvents: 'true',
      });
      if (syncToken) q.set('syncToken', syncToken);
      else q.set('timeMin', new Date(Date.now() - 7 * 86_400_000).toISOString());
      if (pageToken) q.set('pageToken', pageToken);
      const page = await this.api<{
        items?: GEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>(accessToken, 'GET', `/calendars/${cal}/events?${q}`);
      events.push(...(page.items ?? []).map(parseGoogleEvent));
      pageToken = page.nextPageToken;
      if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken };
  }

  async upsertEvent(
    accessToken: string,
    calendarId: string,
    eventId: string | null,
    input: CalendarEventInput,
  ): Promise<CalendarEvent> {
    const cal = encodeURIComponent(calendarId);
    const body = {
      summary: input.summary,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
      extendedProperties: { private: { vettaAppointmentId: input.vettaAppointmentId } },
    };
    const e = eventId
      ? await this.api<GEvent>(accessToken, 'PATCH', `/calendars/${cal}/events/${eventId}`, body)
      : await this.api<GEvent>(accessToken, 'POST', `/calendars/${cal}/events`, body);
    return parseGoogleEvent(e);
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    await this.api(
      accessToken,
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    ).catch((e: unknown) => {
      // Já removido no Google.
      if (!(e instanceof Error && /\b(404|410)\b/.test(e.message))) throw e;
    });
  }

  async watch(
    accessToken: string,
    calendarId: string,
    channel: { id: string; token: string; address: string; ttlSeconds: number },
  ) {
    const r = await this.api<{ resourceId: string; expiration?: string }>(
      accessToken,
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        id: channel.id,
        type: 'web_hook',
        address: channel.address,
        token: channel.token,
        params: { ttl: String(channel.ttlSeconds) },
      },
    );
    return {
      resourceId: r.resourceId,
      expiresAt: new Date(Number(r.expiration ?? Date.now() + channel.ttlSeconds * 1000)),
    };
  }

  async stop(accessToken: string, channelId: string, resourceId: string): Promise<void> {
    await this.api(accessToken, 'POST', '/channels/stop', { id: channelId, resourceId }).catch(
      () => undefined,
    );
  }
}

export class UnconfiguredCalendarProvider implements CalendarProvider {
  readonly name = 'unconfigured';
  private fail(): never {
    throw new CalendarNotConfiguredError();
  }
  authUrl(): string {
    return this.fail();
  }
  exchangeCode(): Promise<OAuthTokens> {
    return Promise.reject(new CalendarNotConfiguredError());
  }
  refresh(): Promise<OAuthTokens> {
    return Promise.reject(new CalendarNotConfiguredError());
  }
  listChanges(): Promise<{ events: CalendarEvent[]; nextSyncToken: string }> {
    return Promise.reject(new CalendarNotConfiguredError());
  }
  upsertEvent(): Promise<CalendarEvent> {
    return Promise.reject(new CalendarNotConfiguredError());
  }
  deleteEvent(): Promise<void> {
    return Promise.reject(new CalendarNotConfiguredError());
  }
  watch(): Promise<{ resourceId: string; expiresAt: Date }> {
    return Promise.reject(new CalendarNotConfiguredError());
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
}

export function createCalendarProvider(env: {
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
}): CalendarProvider {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET)
    return new UnconfiguredCalendarProvider();
  return new GoogleCalendarProvider({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  });
}
