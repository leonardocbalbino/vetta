import {
  PENDING_UPLOAD_TTL_HOURS,
  SOFT_DELETE_RETENTION_DAYS,
  UPLOAD_PURPOSES,
  type UploadPurpose,
} from '@vetta/contracts';
import type { PrismaClient } from '@vetta/db';
import { releaseQuota } from '../media/quota';
import type { StorageProvider } from '../storage/storage';

/** Uploads pendentes órfãos (não concluídos em 24 h): aborta, apaga e libera a cota. */
export async function cleanupPendingUploads(
  db: PrismaClient,
  storage: StorageProvider,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_TTL_HOURS * 3_600_000);
  const stale = await db.media.findMany({
    where: {
      status: 'PENDING',
      OR: [{ uploadExpiresAt: { lt: now } }, { createdAt: { lt: cutoff } }],
    },
    take: 500,
  });
  for (const m of stale) {
    if (m.multipartUploadId)
      await storage.abortMultipart(m.storageKey, m.multipartUploadId).catch(() => undefined);
    await storage.delete(m.storageKey).catch(() => undefined);
    await db.media.update({
      where: { id: m.id },
      data: {
        status: 'DELETED',
        failureReason: 'Upload não concluído',
        deletedAt: now,
        purgedAt: now,
      },
    });
    if (m.tenantId && UPLOAD_PURPOSES[m.purpose as UploadPurpose].countsQuota) {
      await releaseQuota(db, m.tenantId, Number(m.size));
    }
  }
  return stale.length;
}

/** Exclusão física 30 dias após a exclusão lógica (original + variantes). */
export async function purgeDeletedMedia(
  db: PrismaClient,
  storage: StorageProvider,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_DAYS * 86_400_000);
  const items = await db.media.findMany({
    where: { deletedAt: { lt: cutoff }, purgedAt: null },
    take: 500,
  });
  for (const m of items) {
    const variants = Object.values((m.variants ?? {}) as Record<string, { key?: string }>);
    const keys = [
      m.storageKey,
      ...variants.map((v) => v.key).filter((k): k is string => !!k && !k.startsWith('http')),
    ];
    for (const k of keys) await storage.delete(k).catch(() => undefined);
    await db.media.update({ where: { id: m.id }, data: { purgedAt: now, status: 'DELETED' } });
  }
  return items.length;
}
