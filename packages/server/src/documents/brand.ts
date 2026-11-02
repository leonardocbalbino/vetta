import type { PrismaClient } from '@vetta/db';
import type { StorageProvider } from '../storage/storage';

export interface PdfLogo {
  data: Buffer;
  format: 'png' | 'jpg';
}

/** Logo do personal para os PDFs (PNG/JPG; SVG e WEBP não são suportados pelo react-pdf). */
export async function loadTenantLogo(
  db: PrismaClient,
  storage: StorageProvider,
  tenantId: string,
): Promise<PdfLogo | null> {
  const brand = await db.tenantBrand.findUnique({ where: { tenantId } });
  if (!brand?.logoMediaId) return null;
  const m = await db.media.findUnique({ where: { id: brand.logoMediaId } });
  if (!m || m.status !== 'READY' || m.deletedAt) return null;
  const mime = m.detectedMimeType ?? m.mimeType;
  const format = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : null;
  if (!format) return null;
  const chunks: Buffer[] = [];
  for await (const c of await storage.getStream(m.storageKey))
    chunks.push(Buffer.from(c as Uint8Array));
  return { data: Buffer.concat(chunks), format };
}
