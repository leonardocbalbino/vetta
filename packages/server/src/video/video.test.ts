import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import ffmpegPath from 'ffmpeg-static';
import { afterAll, describe, expect, it } from 'vitest';
import type { StorageProvider } from '../storage/storage';
import { LocalFfmpegVideoProvider } from './video';

/** Storage em memória: só o que o provider usa (ler o original e gravar as variantes). */
function memoryStorage(files: Map<string, Buffer>) {
  return {
    bucket: 'test',
    getStream: (key: string) => Promise.resolve(Readable.from(files.get(key)!)),
    put: (key: string, body: Buffer) => {
      files.set(key, Buffer.from(body));
      return Promise.resolve();
    },
  } as unknown as StorageProvider;
}

// Mesmo formato das chaves reais: as variantes ficam ao lado do original.
const KEY = 't/t1/exercise_video/m1/original.mp4';

describe('vídeo de exercício (ffmpeg local)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vetta-video-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('gera HLS, capa, GIF e o MP4 leve para assistir sem internet', async () => {
    // Vídeo sintético de 2 s em 1280×720 com áudio.
    const src = path.join(dir, 'src.mp4');
    execFileSync(ffmpegPath!, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=1280x720:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=2',
      '-shortest',
      '-pix_fmt',
      'yuv420p',
      src,
    ]);
    const original = readFileSync(src);
    const files = new Map([[KEY, original]]);
    const r = await new LocalFfmpegVideoProvider(memoryStorage(files), ffmpegPath!).process({
      mediaId: 'm1',
      storageKey: KEY,
    });

    expect(r).toMatchObject({ width: 1280, height: 720 });
    expect(Object.keys(r.variants).sort()).toEqual([
      'hls',
      'offline_mp4',
      'preview_gif',
      'thumbnail',
    ]);
    const offline = files.get(r.variants.offline_mp4!.key)!;
    expect(r.variants.offline_mp4!.mimeType).toBe('video/mp4');
    // MP4 válido (caixa ftyp), menor que o original e em 360p sem áudio.
    expect(offline.subarray(4, 8).toString()).toBe('ftyp');
    expect(offline.length).toBeLessThan(original.length);
    const probe = (() => {
      try {
        execFileSync(ffmpegPath!, ['-hide_banner', '-i', '-'], { input: offline, stdio: 'pipe' });
        return '';
      } catch (e) {
        return String((e as { stderr?: Buffer }).stderr ?? '');
      }
    })();
    expect(probe).toMatch(/Video:.*x360/);
    expect(probe).not.toMatch(/Audio:/);
  }, 120_000);
});
