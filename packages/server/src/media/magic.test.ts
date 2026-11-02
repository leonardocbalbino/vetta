import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskRecipient, randomToken, sha256 } from '../crypto';
import { detectMime, isAcceptedMime } from './magic';
import { sanitizeSvg } from './svg';

const ftyp = (brand: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.alloc(16)]);

describe('detectMime', () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'image/jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'image/png'],
    [Buffer.from('GIF89a....'), 'image/gif'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 'image/webp'],
    [Buffer.from('%PDF-1.7\n'), 'application/pdf'],
    [ftyp('heic'), 'image/heic'],
    [ftyp('mif1'), 'image/heif'],
    [ftyp('qt  '), 'video/quicktime'],
    [ftyp('isom'), 'video/mp4'],
    [ftyp('M4A '), 'audio/mp4'],
    [Buffer.from('OggS\0'), 'audio/ogg'],
    [Buffer.from('ID3\x03'), 'audio/mpeg'],
    [
      Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      'image/svg+xml',
    ],
    [Buffer.from('MZ\x90\x00'), null],
    [Buffer.from('texto qualquer'), null],
  ])('%#', (buf, expected) => {
    expect(detectMime(buf)).toBe(expected);
  });
});

describe('isAcceptedMime', () => {
  it('aceita quando declarado = detectado e permitido', () => {
    expect(isAcceptedMime('image/jpeg', 'image/jpeg', ['image/jpeg'])).toBe(true);
  });
  it('recusa extensão falsa (PDF declarado como imagem)', () => {
    expect(isAcceptedMime('application/pdf', 'image/jpeg', ['image/jpeg'])).toBe(false);
  });
  it('recusa executável', () => {
    expect(isAcceptedMime(null, 'video/mp4', ['video/mp4'])).toBe(false);
  });
  it('trata HEIC/HEIF e MP4/MOV como equivalentes', () => {
    expect(isAcceptedMime('image/heif', 'image/heic', ['image/heic'])).toBe(true);
    expect(isAcceptedMime('video/mp4', 'video/quicktime', ['video/quicktime'])).toBe(true);
  });
});

describe('sanitizeSvg', () => {
  it('remove scripts, handlers e links externos', () => {
    const out = sanitizeSvg(
      '<svg onload="alert(1)"><script>alert(1)</script><a href="https://evil"><rect onclick="x()" fill="url(https://x)"/></a><use href="#ok"/></svg>',
    );
    expect(out).not.toMatch(/script|onload|onclick|evil|https:/);
  });
  it('rejeita o que não é SVG', () => {
    expect(() => sanitizeSvg('<html></html>')).toThrow();
  });
});

describe('crypto', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  it('cifra e decifra', () => {
    const enc = encryptSecret('segredo', key);
    expect(enc).not.toContain('segredo');
    expect(decryptSecret(enc, key)).toBe('segredo');
  });
  it('detecta adulteração', () => {
    const enc = encryptSecret('segredo', key).split('.');
    enc[3] = Buffer.from('outro').toString('base64url');
    expect(() => decryptSecret(enc.join('.'), key)).toThrow();
  });
  it('tokens aleatórios e hash estável', () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(sha256('a')).toBe(sha256('a'));
    expect(maskRecipient('ana@vettafit.com.br')).toBe('an***@vettafit.com.br');
  });
});
