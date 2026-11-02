import { UNLIMITED } from '@vetta/contracts';
import type { PrismaClient } from '@vetta/db';

const MB = 1024 * 1024;

export interface QuotaState {
  usedBytes: number;
  reservedBytes: number;
  limitBytes: number | null;
}

/**
 * Reserva espaço de forma atômica para um upload pendente. Retorna false se a
 * cota estouraria (bloqueio em 100%). limitMb = -1 → ilimitado.
 */
export async function reserveQuota(
  db: PrismaClient,
  tenantId: string,
  bytes: number,
  limitMb: number,
): Promise<boolean> {
  await db.tenantStorageUsage.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
  const limitBytes = limitMb === UNLIMITED ? null : BigInt(Math.max(0, limitMb)) * BigInt(MB);
  const updated = await db.$executeRaw`
    UPDATE tenant_storage_usage
       SET bytes_reserved = bytes_reserved + ${BigInt(bytes)}, updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid
       AND (${limitBytes}::bigint IS NULL OR bytes_used + bytes_reserved + ${BigInt(bytes)} <= ${limitBytes}::bigint)`;
  return updated === 1;
}

/** Libera uma reserva (upload falhou/expirou). */
export async function releaseQuota(db: PrismaClient, tenantId: string, bytes: number) {
  await db.$executeRaw`
    UPDATE tenant_storage_usage
       SET bytes_reserved = GREATEST(0, bytes_reserved - ${BigInt(bytes)}), updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid`;
}

/** Converte a reserva em uso definitivo (upload processado). */
export async function commitQuota(
  db: PrismaClient,
  tenantId: string,
  reservedBytes: number,
  finalBytes: number,
) {
  await db.$executeRaw`
    UPDATE tenant_storage_usage
       SET bytes_reserved = GREATEST(0, bytes_reserved - ${BigInt(reservedBytes)}),
           bytes_used = bytes_used + ${BigInt(finalBytes)},
           updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid`;
}

/** Devolve espaço ao excluir uma mídia. */
export async function freeQuota(db: PrismaClient, tenantId: string, bytes: number) {
  await db.$executeRaw`
    UPDATE tenant_storage_usage
       SET bytes_used = GREATEST(0, bytes_used - ${BigInt(bytes)}), updated_at = now()
     WHERE tenant_id = ${tenantId}::uuid`;
}

export async function quotaState(
  db: PrismaClient,
  tenantId: string,
  limitMb: number,
): Promise<QuotaState> {
  const u = await db.tenantStorageUsage.findUnique({ where: { tenantId } });
  return {
    usedBytes: Number(u?.bytesUsed ?? 0),
    reservedBytes: Number(u?.bytesReserved ?? 0),
    limitBytes: limitMb === UNLIMITED ? null : limitMb * MB,
  };
}

export const formatBytes = (n: number) =>
  n >= 1024 * MB
    ? `${(n / (1024 * MB)).toFixed(1).replace('.', ',')} GB`
    : `${Math.round(n / MB)} MB`;
