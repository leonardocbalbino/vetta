/**
 * Detecção do tipo real do arquivo pelos primeiros bytes (magic number).
 * Cobre apenas os formatos aceitos pelos purposes de upload. Ver ADR-005.
 */
export const MAGIC_BYTES_NEEDED = 512;

const startsWith = (b: Buffer, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString('latin1');

export function detectMime(b: Buffer): string | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(b, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(b, 0, 4) === 'OggS') return 'audio/ogg';
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';
  if (ascii(b, 0, 3) === 'ID3' || startsWith(b, [0xff, 0xfb]) || startsWith(b, [0xff, 0xf3]))
    return 'audio/mpeg';
  if (startsWith(b, [0xff, 0xf1]) || startsWith(b, [0xff, 0xf9])) return 'audio/aac';

  // ISO-BMFF: "ftyp" no offset 4; a marca define o formato.
  if (ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
    return 'video/mp4';
  }

  // EPUB = ZIP com "mimetypeapplication/epub+zip" logo no início.
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    return ascii(b, 30, 58) === 'mimetypeapplication/epub+zip'
      ? 'application/epub+zip'
      : 'application/zip';
  }

  const head = ascii(b, 0, Math.min(b.length, MAGIC_BYTES_NEEDED))
    .replace(String.fromCharCode(0xfeff), '')
    .trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head))
    return 'image/svg+xml';
  return null;
}

/** Tipos equivalentes (o declarado pelo cliente pode variar). */
const EQUIVALENT: Record<string, string[]> = {
  'image/heic': ['image/heif'],
  'image/heif': ['image/heic'],
  'video/mp4': ['video/quicktime', 'audio/mp4'],
  'video/quicktime': ['video/mp4'],
  'audio/mp4': ['video/mp4', 'audio/aac'],
  'audio/webm': ['video/webm'],
};

/** O tipo detectado é compatível com o declarado e permitido pelo purpose? */
export function isAcceptedMime(
  detected: string | null,
  declared: string,
  allowed: readonly string[],
): boolean {
  if (!detected) return false;
  const candidates = [detected, ...(EQUIVALENT[detected] ?? [])];
  return candidates.includes(declared) && candidates.some((c) => allowed.includes(c));
}
