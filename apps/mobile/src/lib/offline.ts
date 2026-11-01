import type { SyncSessionInput } from '@vetta/contracts';
import { ApiRequestError } from '@vetta/sdk';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import { client } from './client';

/**
 * Offline-first do player:
 * - cache: último "treino do dia" baixado (abre sem internet);
 * - pending_sessions: sessões concluídas sem rede, reenviadas com o mesmo
 *   clientSessionId (a API é idempotente, então reenvio nunca duplica).
 */
let dbp: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
  dbp ??= (async () => {
    const d = await SQLite.openDatabaseAsync('vetta-offline.db');
    await d.execAsync(`
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pending_sessions (
        client_session_id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
      );`);
    return d;
  })();
  return dbp;
}

export async function cacheSet(key: string, value: unknown) {
  await (
    await db()
  ).runAsync(
    'INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?)',
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

export async function cacheGet<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
  const row = await (
    await db()
  ).getFirstAsync<{ value: string; updated_at: string }>(
    'SELECT value, updated_at FROM cache WHERE key = ?',
    key,
  );
  return row ? { value: JSON.parse(row.value) as T, updatedAt: row.updated_at } : null;
}

/** Busca na API; sem rede, devolve o último valor salvo. */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T; offline: boolean; updatedAt?: string }> {
  try {
    const data = await fetcher();
    await cacheSet(key, data);
    return { data, offline: false };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status < 500) throw err;
    const cached = await cacheGet<T>(key);
    if (!cached) throw err;
    return { data: cached.value, offline: true, updatedAt: cached.updatedAt };
  }
}

export async function enqueueSession(tenantId: string, s: SyncSessionInput) {
  await (
    await db()
  ).runAsync(
    'INSERT OR REPLACE INTO pending_sessions (client_session_id, tenant_id, payload, created_at) VALUES (?, ?, ?, ?)',
    s.clientSessionId,
    tenantId,
    JSON.stringify(s),
    new Date().toISOString(),
  );
}

export async function pendingCount(): Promise<number> {
  const r = await (
    await db()
  ).getFirstAsync<{ c: number }>('SELECT count(*) AS c FROM pending_sessions');
  return r?.c ?? 0;
}

let syncing = false;
/** Envia as sessões pendentes. Retorna quantas foram sincronizadas. */
export async function syncPending(): Promise<number> {
  if (syncing) return 0;
  const net = await Network.getNetworkStateAsync();
  if (!net.isConnected || net.isInternetReachable === false) return 0;
  syncing = true;
  let ok = 0;
  try {
    const d = await db();
    const rows = await d.getAllAsync<{
      client_session_id: string;
      tenant_id: string;
      payload: string;
      attempts: number;
    }>(
      'SELECT client_session_id, tenant_id, payload, attempts FROM pending_sessions ORDER BY created_at',
    );
    for (const r of rows) {
      try {
        await client.request(
          'POST',
          '/v1/training/sessions',
          JSON.parse(r.payload),
          undefined,
          true,
          r.tenant_id,
        );
        await d.runAsync(
          'DELETE FROM pending_sessions WHERE client_session_id = ?',
          r.client_session_id,
        );
        ok++;
      } catch (err) {
        // Erro de validação não se resolve sozinho: descarta após 5 tentativas.
        const permanent =
          err instanceof ApiRequestError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 401;
        await d.runAsync(
          'UPDATE pending_sessions SET attempts = attempts + 1, last_error = ? WHERE client_session_id = ?',
          (err as Error).message,
          r.client_session_id,
        );
        if (permanent && r.attempts + 1 >= 5)
          await d.runAsync(
            'DELETE FROM pending_sessions WHERE client_session_id = ?',
            r.client_session_id,
          );
        if (!permanent) break;
      }
    }
  } finally {
    syncing = false;
  }
  return ok;
}

/** Sincroniza sempre que a conexão volta. */
export function startAutoSync(onSynced?: (n: number) => void) {
  void syncPending().then((n) => n && onSynced?.(n));
  const sub = Network.addNetworkStateListener((s) => {
    if (s.isConnected) void syncPending().then((n) => n && onSynced?.(n));
  });
  return () => sub.remove();
}
