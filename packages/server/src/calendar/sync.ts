import type { PrismaClient } from '@vetta/db';
import { decryptSecret, encryptSecret, randomToken } from '../crypto';
import {
  CalendarAuthError,
  SyncTokenExpiredError,
  type CalendarEvent,
  type CalendarProvider,
} from './google';

/**
 * Sincronização bidirecional Vetta ⇄ Google Calendar (por membro da equipe):
 * - Vetta → Google: cada aula vira um evento (marcado com o id da aula); cancelar apaga.
 * - Google → Vetta: mudanças em eventos criados pela Vetta atualizam a aula (horário,
 *   local, cancelamento); os demais eventos ocupados viram bloqueios da agenda.
 * O `updated` do Google gravado na aula evita eco entre os dois lados.
 */

export interface CalendarSyncDeps {
  db: PrismaClient;
  calendar: CalendarProvider;
  encryptionKey: string;
  /** Endereço público do webhook (POST /v1/integrations/google/webhook). */
  webhookUrl: string;
  now?: () => Date;
}

type Integration = NonNullable<
  Awaited<ReturnType<PrismaClient['calendarIntegration']['findFirst']>>
>;

const CHANNEL_TTL_SECONDS = 7 * 86_400;

export async function accessTokenFor(deps: CalendarSyncDeps, integration: Integration) {
  const now = deps.now?.() ?? new Date();
  if (
    integration.accessTokenEncrypted &&
    integration.tokenExpiresAt &&
    integration.tokenExpiresAt.getTime() - now.getTime() > 60_000
  ) {
    return decryptSecret(integration.accessTokenEncrypted, deps.encryptionKey);
  }
  if (!integration.refreshTokenEncrypted)
    throw new CalendarAuthError('Reconecte o Google Calendar.');
  const t = await deps.calendar.refresh(
    decryptSecret(integration.refreshTokenEncrypted, deps.encryptionKey),
  );
  await deps.db.calendarIntegration.update({
    where: { id: integration.id },
    data: {
      accessTokenEncrypted: encryptSecret(t.accessToken, deps.encryptionKey),
      ...(t.refreshToken
        ? { refreshTokenEncrypted: encryptSecret(t.refreshToken, deps.encryptionKey) }
        : {}),
      tokenExpiresAt: t.expiresAt,
    },
  });
  return t.accessToken;
}

async function activeIntegration(db: PrismaClient, memberId: string) {
  return db.calendarIntegration.findFirst({
    where: {
      memberId,
      provider: 'GOOGLE',
      deletedAt: null,
      refreshTokenEncrypted: { not: null },
    },
  });
}

/** Envia (cria, atualiza ou apaga) a aula no Google do membro dono da aula. */
export async function pushAppointment(deps: CalendarSyncDeps, appointmentId: string) {
  const { db } = deps;
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { member: { include: { user: { select: { timezone: true } } } } },
  });
  if (!appt) return { skipped: 'not_found' as const };
  const integration = await activeIntegration(db, appt.memberId);
  if (!integration) return { skipped: 'not_connected' as const };
  const token = await accessTokenFor(deps, integration);
  const calendarId = integration.calendarId ?? 'primary';

  if (appt.deletedAt || appt.status === 'CANCELED') {
    if (appt.googleEventId) await deps.calendar.deleteEvent(token, calendarId, appt.googleEventId);
    await db.appointment.update({
      where: { id: appt.id },
      data: { googleEventId: null, googleUpdatedAt: null },
    });
    return { deleted: true as const };
  }
  const event = await deps.calendar.upsertEvent(token, calendarId, appt.googleEventId, {
    summary: appt.title,
    description: appt.notes,
    location: appt.location ?? appt.meetingUrl,
    start: appt.startsAt,
    end: appt.endsAt,
    timeZone: appt.member.user.timezone,
    vettaAppointmentId: appt.id,
  });
  await db.appointment.update({
    where: { id: appt.id },
    data: { googleEventId: event.id, googleUpdatedAt: event.updated },
  });
  return { eventId: event.id };
}

export interface PullResult {
  updated: number;
  canceled: number;
  blocks: number;
  removedBlocks: number;
}

/** Aplica um evento do Google na Vetta (função de regra, testável sem rede). */
export async function applyGoogleEvent(
  db: PrismaClient,
  integration: { tenantId: string; memberId: string },
  e: CalendarEvent,
  result: PullResult,
) {
  if (e.vettaAppointmentId) {
    const appt = await db.appointment.findFirst({
      where: {
        id: e.vettaAppointmentId,
        tenantId: integration.tenantId,
        memberId: integration.memberId,
        deletedAt: null,
      },
    });
    if (!appt) return;
    // Eco da própria escrita (ou mudança mais antiga): ignora.
    if (appt.googleUpdatedAt && e.updated.getTime() <= appt.googleUpdatedAt.getTime()) return;
    if (e.status === 'cancelled') {
      if (appt.status !== 'CANCELED') {
        await db.appointment.update({
          where: { id: appt.id },
          data: { status: 'CANCELED', googleUpdatedAt: e.updated },
        });
        result.canceled++;
      }
      return;
    }
    if (!e.start || !e.end || e.allDay) return;
    await db.appointment.update({
      where: { id: appt.id },
      data: {
        startsAt: e.start,
        endsAt: e.end,
        ...(e.summary ? { title: e.summary.slice(0, 200) } : {}),
        ...(e.location !== null ? { location: e.location } : {}),
        googleUpdatedAt: e.updated,
      },
    });
    result.updated++;
    return;
  }

  // Evento externo: ocupado → bloqueio; cancelado/livre → remove o bloqueio.
  const key = { memberId_googleEventId: { memberId: integration.memberId, googleEventId: e.id } };
  if (e.status === 'cancelled' || e.transparent || !e.start || !e.end) {
    const existing = await db.scheduleBlock.findUnique({ where: key });
    if (existing && !existing.deletedAt) {
      await db.scheduleBlock.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      result.removedBlocks++;
    }
    return;
  }
  await db.scheduleBlock.upsert({
    where: key,
    create: {
      tenantId: integration.tenantId,
      memberId: integration.memberId,
      googleEventId: e.id,
      startsAt: e.start,
      endsAt: e.end,
      reason: 'Google Calendar',
    },
    update: { startsAt: e.start, endsAt: e.end, deletedAt: null },
  });
  result.blocks++;
}

/** Puxa as mudanças do Google (incremental por syncToken; refaz a carga se expirar). */
export async function pullChanges(deps: CalendarSyncDeps, integrationId: string) {
  const { db } = deps;
  const integration = await db.calendarIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.deletedAt) return null;
  const token = await accessTokenFor(deps, integration);
  const calendarId = integration.calendarId ?? 'primary';
  let page;
  try {
    page = await deps.calendar.listChanges(token, calendarId, integration.syncToken);
  } catch (e) {
    if (!(e instanceof SyncTokenExpiredError)) throw e;
    page = await deps.calendar.listChanges(token, calendarId, null);
  }
  const result: PullResult = { updated: 0, canceled: 0, blocks: 0, removedBlocks: 0 };
  for (const e of page.events) await applyGoogleEvent(db, integration, e, result);
  await db.calendarIntegration.update({
    where: { id: integration.id },
    data: {
      syncToken: page.nextSyncToken || integration.syncToken,
      lastSyncedAt: deps.now?.() ?? new Date(),
      lastError: null,
    },
  });
  return result;
}

/** Abre (ou renova) o canal de notificações de mudança do calendário. */
export async function ensureWatchChannel(deps: CalendarSyncDeps, integrationId: string) {
  const { db } = deps;
  const integration = await db.calendarIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.deletedAt) return null;
  const now = deps.now?.() ?? new Date();
  if (
    integration.channelId &&
    integration.channelExpiresAt &&
    integration.channelExpiresAt.getTime() - now.getTime() > 86_400_000
  ) {
    return { renewed: false };
  }
  const token = await accessTokenFor(deps, integration);
  if (integration.channelId && integration.channelResourceId) {
    await deps.calendar.stop(token, integration.channelId, integration.channelResourceId);
  }
  const channel = { id: crypto.randomUUID(), token: randomToken(24) };
  const r = await deps.calendar.watch(token, integration.calendarId ?? 'primary', {
    ...channel,
    address: deps.webhookUrl,
    ttlSeconds: CHANNEL_TTL_SECONDS,
  });
  await db.calendarIntegration.update({
    where: { id: integration.id },
    data: {
      channelId: channel.id,
      channelToken: channel.token,
      channelResourceId: r.resourceId,
      channelExpiresAt: r.expiresAt,
    },
  });
  return { renewed: true };
}
