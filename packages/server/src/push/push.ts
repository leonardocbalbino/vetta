import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Deep link obrigatório (CLAUDE.md §10). */
  url: string;
  data?: Record<string, unknown>;
  badge?: number;
  category?: string;
}

export type PushTicket =
  { ok: true; ticketId: string } | { ok: false; error: string; invalidToken: boolean };
export type PushReceipt = { ok: true } | { ok: false; error: string; invalidToken: boolean };

export interface PushProvider {
  readonly name: string;
  isValidToken(token: string): boolean;
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  getReceipts(ticketIds: string[]): Promise<Record<string, PushReceipt>>;
}

/** Expo Push (iOS/Android via app Expo). */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly expo: Expo;
  constructor(accessToken?: string) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  isValidToken(token: string) {
    return Expo.isExpoPushToken(token);
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const out: PushTicket[] = [];
    const payload: ExpoPushMessage[] = messages.map((m) => ({
      to: m.token,
      title: m.title,
      body: m.body,
      sound: 'default',
      data: { ...m.data, url: m.url },
      ...(m.badge !== undefined ? { badge: m.badge } : {}),
      ...(m.category ? { categoryId: m.category } : {}),
    }));
    for (const chunk of this.expo.chunkPushNotifications(payload)) {
      const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      for (const t of tickets) {
        if (t.status === 'ok') out.push({ ok: true, ticketId: t.id });
        else
          out.push({
            ok: false,
            error: t.message,
            invalidToken: t.details?.error === 'DeviceNotRegistered',
          });
      }
    }
    return out;
  }

  async getReceipts(ticketIds: string[]) {
    const result: Record<string, PushReceipt> = {};
    for (const chunk of this.expo.chunkPushNotificationReceiptIds(ticketIds)) {
      const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
      for (const [id, r] of Object.entries(receipts)) {
        result[id] =
          r.status === 'ok'
            ? { ok: true }
            : {
                ok: false,
                error: r.message,
                invalidToken: r.details?.error === 'DeviceNotRegistered',
              };
      }
    }
    return result;
  }
}
