import type { UploadPurpose } from '@vetta/contracts';
import { uploadFile, xhrPut } from '@vetta/sdk';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from './client';

/**
 * Fila de upload offline-first: o arquivo entra numa fila em SQLite e sobe
 * quando há conexão, com retomada (mediaId salvo) e tentativas com backoff.
 */
export interface QueuedUpload {
  id: number;
  uri: string;
  name: string;
  mime: string;
  purpose: UploadPurpose;
  studentLinkId: string | null;
  mediaId: string | null;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  attempts: number;
  error: string | null;
}

const MAX_ATTEMPTS = 5;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db() {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('vetta-uploads.db');
    await d.execAsync(`CREATE TABLE IF NOT EXISTS upload_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, purpose TEXT NOT NULL,
      studentLinkId TEXT, mediaId TEXT, status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    // Uploads interrompidos pelo fechamento do app voltam para a fila.
    await d.runAsync(`UPDATE upload_queue SET status = 'queued' WHERE status = 'uploading'`);
    return d;
  })();
  return dbPromise;
}

export function useUpload() {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const running = useRef(false);

  const refresh = useCallback(async () => {
    const d = await db();
    setItems(
      await d.getAllAsync<QueuedUpload>(
        `SELECT * FROM upload_queue WHERE status != 'done' ORDER BY id`,
      ),
    );
  }, []);

  const processQueue = useCallback(async () => {
    if (running.current) return;
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || net.isInternetReachable === false) return;
    running.current = true;
    try {
      const d = await db();
      for (;;) {
        const next = await d.getFirstAsync<QueuedUpload>(
          `SELECT * FROM upload_queue WHERE status = 'queued' AND attempts < ? ORDER BY id LIMIT 1`,
          MAX_ATTEMPTS,
        );
        if (!next) break;
        await d.runAsync(`UPDATE upload_queue SET status = 'uploading' WHERE id = ?`, next.id);
        await refresh();
        try {
          const blob = await (await fetch(next.uri)).blob();
          const file = Object.assign(blob, { name: next.name });
          Object.defineProperty(file, 'type', { value: next.mime });
          const mediaId = await uploadFile(client, file, {
            purpose: next.purpose,
            ...(next.studentLinkId ? { studentLinkId: next.studentLinkId } : {}),
            ...(next.mediaId ? { resumeMediaId: next.mediaId } : {}),
            put: xhrPut,
            onCreated: (id) =>
              void d.runAsync(`UPDATE upload_queue SET mediaId = ? WHERE id = ?`, id, next.id),
            onProgress: (p) => setProgress((s) => ({ ...s, [next.id]: p.ratio })),
          });
          await d.runAsync(
            `UPDATE upload_queue SET status = 'done', mediaId = ? WHERE id = ?`,
            mediaId,
            next.id,
          );
        } catch (err) {
          const attempts = next.attempts + 1;
          await d.runAsync(
            `UPDATE upload_queue SET status = ?, attempts = ?, error = ? WHERE id = ?`,
            attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
            attempts,
            (err as Error).message,
            next.id,
          );
          // Sem rede de novo: para e espera a próxima reconexão.
          break;
        }
      }
    } finally {
      running.current = false;
      await refresh();
    }
  }, [refresh]);

  const enqueue = useCallback(
    async (f: {
      uri: string;
      name: string;
      mime: string;
      purpose: UploadPurpose;
      studentLinkId?: string;
    }) => {
      const d = await db();
      await d.runAsync(
        `INSERT INTO upload_queue (uri, name, mime, purpose, studentLinkId) VALUES (?, ?, ?, ?, ?)`,
        f.uri,
        f.name,
        f.mime,
        f.purpose,
        f.studentLinkId ?? null,
      );
      await refresh();
      void processQueue();
    },
    [refresh, processQueue],
  );

  const retry = useCallback(
    async (id: number) => {
      const d = await db();
      await d.runAsync(
        `UPDATE upload_queue SET status = 'queued', attempts = 0, error = NULL WHERE id = ?`,
        id,
      );
      void processQueue();
    },
    [processQueue],
  );

  useEffect(() => {
    void refresh().then(processQueue);
    const sub = Network.addNetworkStateListener((s) => {
      if (s.isConnected) void processQueue();
    });
    return () => sub.remove();
  }, [refresh, processQueue]);

  return { items, progress, enqueue, retry, processQueue };
}
