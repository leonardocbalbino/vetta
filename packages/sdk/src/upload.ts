import type { CreateUploadInput, MediaResponse } from '@vetta/contracts';
import type { VettaClient } from './client.js';

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0–1 */
  ratio: number;
}

/** Envio de bytes para uma URL assinada. Web usa XHR (progresso); mobile usa expo-file-system. */
export type PutFn = (
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
) => Promise<void>;

/** PUT com progresso via XMLHttpRequest (navegador). */
export const xhrPut: PutFn = (url, body, headers, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Falha no envio (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Falha de rede no envio'));
    xhr.onabort = () => reject(new DOMException('Envio cancelado', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(body);
  });

export interface UploadOptions {
  purpose: CreateUploadInput['purpose'];
  studentLinkId?: string;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
  put?: PutFn;
  /** Tentativas por parte antes de desistir (retomada automática). */
  retries?: number;
  /** Recebe o id assim que o upload é criado (para persistir e retomar depois). */
  onCreated?: (mediaId: string) => void;
  /** Retomar um upload já criado (ex.: após fechar a aba). */
  resumeMediaId?: string;
}

/**
 * Fluxo completo: POST /uploads → PUT direto no storage (multipart com retomada)
 * → POST /uploads/:id/complete. Retorna o id da mídia (processamento continua no worker).
 */
export async function uploadFile(
  client: VettaClient,
  file: Blob & { name?: string; type: string },
  o: UploadOptions,
): Promise<string> {
  const put = o.put ?? xhrPut;
  const total = file.size;
  const retries = o.retries ?? 3;
  let target;
  let mediaId: string;
  const doneParts = new Map<number, number>();

  if (o.resumeMediaId) {
    const status = await client.uploads.status(o.resumeMediaId);
    mediaId = status.mediaId;
    if (status.status !== 'PENDING') return mediaId;
    for (const p of status.uploadedParts) doneParts.set(p.partNumber, p.size);
    target = status.target!;
  } else {
    const created = await client.uploads.create({
      purpose: o.purpose,
      fileName: file.name ?? 'arquivo',
      mimeType: file.type,
      size: total,
      ...(o.studentLinkId ? { studentLinkId: o.studentLinkId } : {}),
    });
    mediaId = created.mediaId;
    target = created.target;
    o.onCreated?.(mediaId);
  }

  const report = (inFlight = 0) => {
    const loaded = [...doneParts.values()].reduce((a, b) => a + b, 0) + inFlight;
    o.onProgress?.({ loaded, total, ratio: total ? Math.min(1, loaded / total) : 1 });
  };
  const withRetry = async (fn: () => Promise<void>) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if ((err as Error).name === 'AbortError' || attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  };

  if (target.type === 'single') {
    await withRetry(() => put(target.url, file, target.headers, (l) => report(l), o.signal));
    doneParts.set(1, total);
  } else {
    for (const part of target.parts) {
      const start = (part.partNumber - 1) * target.partSize;
      const chunk = file.slice(start, Math.min(total, start + target.partSize));
      await withRetry(() => put(part.url, chunk, {}, (l) => report(l), o.signal));
      doneParts.set(part.partNumber, chunk.size);
      report();
    }
  }
  report();
  await client.uploads.complete(mediaId);
  return mediaId;
}

/** Aguarda o worker terminar o processamento (READY ou FAILED). */
export async function waitForMedia(
  client: VettaClient,
  mediaId: string,
  timeoutMs = 120_000,
): Promise<MediaResponse> {
  const start = Date.now();
  for (let delay = 500; ; delay = Math.min(delay * 1.5, 5000)) {
    const m = await client.uploads.media(mediaId);
    if (m.status === 'READY' || m.status === 'FAILED') return m;
    if (Date.now() - start > timeoutMs) return m;
    await new Promise((r) => setTimeout(r, delay));
  }
}
