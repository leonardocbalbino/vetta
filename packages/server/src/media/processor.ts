import { QUOTA_WARNING_RATIO, UPLOAD_PURPOSES, type UploadPurpose } from '@vetta/contracts';
import type { Media, Prisma, PrismaClient } from '@vetta/db';
import heicConvert from 'heic-convert';
import sharp from 'sharp';
import type { Readable } from 'node:stream';
import { resolveEntitlements } from '../entitlements';
import type { EventPublisher } from '../events';
import { buildStorageKey, variantKey, type StorageProvider } from '../storage/storage';
import type { VideoProvider } from '../video/video';
import { scanStream } from './clamav';
import { detectMime, isAcceptedMime, MAGIC_BYTES_NEEDED } from './magic';
import { commitQuota, formatBytes, quotaState, releaseQuota } from './quota';
import { sanitizeSvg } from './svg';

export interface MediaProcessorDeps {
  db: PrismaClient;
  storage: StorageProvider;
  video: VideoProvider;
  publisher: EventPublisher;
  /** null = antivírus desativado (apenas dev/test). */
  clamav: { host: string; port: number } | null;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export class MediaRejectedError extends Error {}

interface Variant {
  key: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
}

async function toBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks);
}

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/svg+xml',
]);

/**
 * Pipeline do worker de mídia:
 * magic number → antivírus → EXIF/WEBP/thumbnail (imagens) ou HLS/thumbnail/GIF (vídeo) → cota → evento.
 */
export async function processMedia(deps: MediaProcessorDeps, mediaId: string): Promise<Media> {
  const { db, storage } = deps;
  const media = await db.media.findUniqueOrThrow({ where: { id: mediaId } });
  if (media.status !== 'UPLOADED' && media.status !== 'PROCESSING') return media;
  await db.media.update({ where: { id: media.id }, data: { status: 'PROCESSING' } });
  const rule = UPLOAD_PURPOSES[media.purpose as UploadPurpose];

  try {
    // 1. Tipo real pelos bytes
    const head = await storage.readRange(media.storageKey, 0, MAGIC_BYTES_NEEDED - 1);
    const detected = detectMime(head);
    if (!isAcceptedMime(detected, media.mimeType, rule.mimeTypes)) {
      throw new MediaRejectedError('O conteúdo do arquivo não corresponde ao tipo informado.');
    }

    // 2. Antivírus
    if (rule.processing.antivirus) {
      if (deps.clamav) {
        const result = await scanStream(await storage.getStream(media.storageKey), deps.clamav);
        if (!result.clean)
          throw new MediaRejectedError(`Arquivo bloqueado pelo antivírus (${result.signature}).`);
      } else {
        deps.log?.('antivírus desativado: documento não verificado', { mediaId });
      }
    }

    let storageKey = media.storageKey;
    let mimeType = detected!;
    let finalSize = Number(media.size);
    const variants: Record<string, Variant> = {};
    let width: number | null = null;
    let height: number | null = null;
    let durationSeconds: number | null = null;
    let providerAssetId: string | null = null;

    // 3a. Imagens: remove EXIF/GPS, WEBP e thumbnail
    if (
      IMAGE_MIMES.has(mimeType) &&
      (rule.processing.stripExif ||
        rule.processing.webp ||
        rule.processing.thumbnail ||
        rule.processing.sanitizeSvg)
    ) {
      let input = await toBuffer(await storage.getStream(storageKey));
      if (mimeType === 'image/heic' || mimeType === 'image/heif') {
        input = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 }));
        mimeType = 'image/jpeg';
      }
      if (mimeType === 'image/svg+xml') {
        input = Buffer.from(sanitizeSvg(input.toString('utf8')), 'utf8');
      }

      let original = input;
      if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
        // rotate() aplica a orientação do EXIF; o sharp não copia metadados para a saída.
        const pipeline = sharp(input, { failOn: 'error' }).rotate();
        original =
          mimeType === 'image/jpeg'
            ? await pipeline.jpeg({ quality: 90 }).toBuffer()
            : mimeType === 'image/png'
              ? await pipeline.png().toBuffer()
              : await pipeline.webp({ quality: 90 }).toBuffer();
      }
      const newKey =
        mimeType === media.mimeType ||
        (media.mimeType === 'image/heif' && mimeType === 'image/heic')
          ? storageKey
          : buildStorageKey({
              tenantId: media.tenantId,
              ownerUserId: media.ownerUserId,
              purpose: media.purpose,
              mediaId: media.id,
              fileName: 'x.jpg',
            });
      await storage.put(newKey, original, mimeType, original.length);
      if (newKey !== storageKey) {
        await storage.delete(storageKey);
        storageKey = newKey;
      }
      finalSize = original.length;

      const meta = await sharp(original).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      if (rule.processing.webp) {
        const webp = await sharp(original)
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        const key = variantKey(storageKey, 'display.webp');
        await storage.put(key, webp.data, 'image/webp', webp.data.length);
        variants.webp = {
          key,
          mimeType: 'image/webp',
          size: webp.data.length,
          width: webp.info.width,
          height: webp.info.height,
        };
      }
      if (rule.processing.thumbnail) {
        const thumb = await sharp(original)
          .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75 })
          .toBuffer({ resolveWithObject: true });
        const key = variantKey(storageKey, 'thumbnail.webp');
        await storage.put(key, thumb.data, 'image/webp', thumb.data.length);
        variants.thumbnail = {
          key,
          mimeType: 'image/webp',
          size: thumb.data.length,
          width: thumb.info.width,
          height: thumb.info.height,
        };
      }
    }

    // 3b. Vídeo: HLS 360p/720p, thumbnail e GIF de prévia
    const isVideo = mimeType === 'video/mp4' || mimeType === 'video/quicktime';
    if (isVideo && (rule.processing.transcode || media.purpose === 'academy_content')) {
      const r = await deps.video.process({ mediaId: media.id, storageKey });
      Object.assign(variants, r.variants);
      width = r.width;
      height = r.height;
      durationSeconds = r.durationSeconds;
      providerAssetId = r.providerAssetId;
    }

    const variantBytes = Object.values(variants).reduce((acc, v) => acc + (v.size ?? 0), 0);
    const updated = await db.media.update({
      where: { id: media.id },
      data: {
        status: 'READY',
        storageKey,
        detectedMimeType: mimeType,
        size: BigInt(finalSize),
        variants: variants as unknown as Prisma.InputJsonValue,
        width,
        height,
        durationSeconds,
        providerAssetId,
        processedAt: new Date(),
        failureReason: null,
      },
    });

    if (media.tenantId && rule.countsQuota) {
      await commitQuota(db, media.tenantId, Number(media.size), finalSize + variantBytes);
      await checkQuotaThresholds(deps, media.tenantId);
    }
    if (media.ownerUserId) {
      await deps.publisher.publish('media.ready', {
        tenantId: media.tenantId,
        payload: {
          userId: media.ownerUserId,
          mediaId: media.id,
          fileName: media.fileName,
          purpose: media.purpose,
        },
      });
    }
    return updated;
  } catch (err) {
    if (err instanceof MediaRejectedError) return failMedia(deps, media, err.message);
    throw err;
  }
}

/** Marca como falha, remove o objeto e libera a reserva de cota. */
export async function failMedia(
  deps: MediaProcessorDeps,
  media: Media,
  reason: string,
): Promise<Media> {
  const rule = UPLOAD_PURPOSES[media.purpose as UploadPurpose];
  await deps.storage.delete(media.storageKey).catch(() => undefined);
  const updated = await deps.db.media.update({
    where: { id: media.id },
    data: { status: 'FAILED', failureReason: reason, processedAt: new Date() },
  });
  if (media.tenantId && rule.countsQuota)
    await releaseQuota(deps.db, media.tenantId, Number(media.size));
  if (media.ownerUserId) {
    await deps.publisher.publish('media.failed', {
      tenantId: media.tenantId,
      payload: { userId: media.ownerUserId, mediaId: media.id, fileName: media.fileName, reason },
    });
  }
  return updated;
}

/** Aviso em 80% (uma vez até baixar de novo) e alerta em 100%. */
export async function checkQuotaThresholds(
  deps: Pick<MediaProcessorDeps, 'db' | 'publisher'>,
  tenantId: string,
) {
  const ent = await resolveEntitlements(deps.db, tenantId);
  const limitMb = Number(ent.features['storage.quota_mb'] ?? 0);
  const q = await quotaState(deps.db, tenantId, limitMb);
  if (q.limitBytes === null || q.limitBytes === 0) return;
  const ratio = q.usedBytes / q.limitBytes;
  const usage = await deps.db.tenantStorageUsage.findUniqueOrThrow({ where: { tenantId } });
  const payload = {
    percent: Math.min(100, Math.round(ratio * 100)),
    used: formatBytes(q.usedBytes),
    max: formatBytes(q.limitBytes),
  };
  if (ratio >= 1) {
    await deps.publisher.publish('storage.quota_exceeded', { tenantId, payload });
  } else if (ratio >= QUOTA_WARNING_RATIO && !usage.warnedAt) {
    await deps.db.tenantStorageUsage.update({
      where: { tenantId },
      data: { warnedAt: new Date() },
    });
    await deps.publisher.publish('storage.quota_warning', { tenantId, payload });
  } else if (ratio < QUOTA_WARNING_RATIO && usage.warnedAt) {
    await deps.db.tenantStorageUsage.update({ where: { tenantId }, data: { warnedAt: null } });
  }
}
