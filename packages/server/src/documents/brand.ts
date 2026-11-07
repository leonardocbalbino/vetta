import { BRAND_CONTRAST, HEX_RE, mix, nearestAccessible, palette } from '@vetta/tokens';
import type { PrismaClient } from '@vetta/db';
import type { StorageProvider } from '../storage/storage';

const WHITE = '#FFFFFF';

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

/** Cores do PDF: as da marca do personal (white label) ou as da Vetta. */
export interface PdfTheme {
  /** Título e cabeçalhos de seção (contraste ≥ 4,5:1 sobre o branco). */
  heading: string;
  /** Faixa sob o cabeçalho e símbolo (contraste ≥ 3:1, elemento gráfico). */
  accent: string;
  /** Fundo dos blocos (treino, seções). */
  panel: string;
  /** Linhas das tabelas. */
  rule: string;
}

const VETTA_PDF: PdfTheme = {
  heading: palette.tinta,
  accent: palette.tinta,
  panel: palette.nevoa,
  rule: palette.linha,
};

/**
 * Tema do PDF a partir da cor principal da marca. A cor é escurecida só o necessário para
 * ficar legível no papel branco; os fundos usam um tom bem claro dela.
 */
export function pdfTheme(colors?: { primaryColor?: string | null } | null): PdfTheme {
  const primary = colors?.primaryColor;
  if (!primary || !HEX_RE.test(primary)) return VETTA_PDF;
  const heading = nearestAccessible(primary, WHITE, BRAND_CONTRAST.text) ?? palette.tinta;
  const accent = nearestAccessible(primary, WHITE, BRAND_CONTRAST.graphic) ?? heading;
  return {
    heading,
    accent,
    panel: mix(primary, WHITE, 0.92),
    // A partir da cor já ajustada: com uma cor clara, a linha ainda aparece.
    rule: mix(accent, WHITE, 0.75),
  };
}

/** Logo e cores do personal para PDFs com a feature de marca; sem ela, a Vetta. */
export async function loadPdfBrand(
  db: PrismaClient,
  storage: StorageProvider,
  tenantId: string,
  branded: boolean,
): Promise<{ logo: PdfLogo | null; theme: PdfTheme }> {
  if (!branded) return { logo: null, theme: VETTA_PDF };
  const brand = await db.tenantBrand.findUnique({ where: { tenantId } });
  return { logo: await loadTenantLogo(db, storage, tenantId), theme: pdfTheme(brand) };
}
