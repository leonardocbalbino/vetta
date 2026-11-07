import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { StorageProvider } from '../storage/storage';
import { variantKey } from '../storage/storage';

export interface VideoVariant {
  key: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface VideoResult {
  providerAssetId: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** hls (playlist master), thumbnail, preview_gif e offline_mp4 (360p para baixar no app). */
  variants: Record<string, VideoVariant>;
}

/** Abstração de processamento de vídeo (HLS 360p/720p, thumbnail, GIF de prévia). */
export interface VideoProvider {
  readonly name: string;
  process(input: { mediaId: string; storageKey: string }): Promise<VideoResult>;
}

const RENDITIONS = [
  { name: '360p', height: 360, bitrate: '800k' },
  { name: '720p', height: 720, bitrate: '2500k' },
] as const;

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0
        ? resolve(out + err)
        : reject(
            Object.assign(new Error(`ffmpeg saiu com ${code}: ${err.slice(-500)}`), {
              output: out + err,
            }),
          ),
    );
  });
}

/**
 * Desenvolvimento/self-hosted: transcodifica localmente com ffmpeg e grava as
 * variantes no próprio storage.
 */
export class LocalFfmpegVideoProvider implements VideoProvider {
  readonly name = 'local-ffmpeg';
  constructor(
    private readonly storage: StorageProvider,
    private readonly ffmpegPath: string,
  ) {}

  async process({ storageKey }: { mediaId: string; storageKey: string }): Promise<VideoResult> {
    const dir = await mkdtemp(path.join(tmpdir(), 'vetta-video-'));
    try {
      const src = path.join(dir, 'source');
      await pipeline(await this.storage.getStream(storageKey), createWriteStream(src));

      // Sem saída o ffmpeg termina com erro; o que interessa é o log completo da entrada.
      const probe = await run(this.ffmpegPath, ['-hide_banner', '-i', src]).catch(
        (e: Error & { output?: string }) => e.output ?? e.message,
      );
      const dur = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(probe);
      const durationSeconds = dur
        ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
        : null;
      const dim = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(probe);
      const width = dim ? Number(dim[1]) : null;
      const height = dim ? Number(dim[2]) : null;

      const hlsDir = path.join(dir, 'hls');
      await mkdir(hlsDir);
      const master = ['#EXTM3U', '#EXT-X-VERSION:3'];
      for (const r of RENDITIONS) {
        await run(this.ffmpegPath, [
          '-y',
          '-i',
          src,
          '-vf',
          `scale=-2:${r.height}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-b:v',
          r.bitrate,
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-ac',
          '2',
          '-hls_time',
          '6',
          '-hls_playlist_type',
          'vod',
          '-hls_segment_filename',
          path.join(hlsDir, `${r.name}_%03d.ts`),
          path.join(hlsDir, `${r.name}.m3u8`),
        ]);
        const bw = Number.parseInt(r.bitrate, 10) * 1000;
        master.push(
          `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${Math.round((r.height * 16) / 9)}x${r.height}`,
          `${r.name}.m3u8`,
        );
      }
      await writeFile(path.join(hlsDir, 'master.m3u8'), master.join('\n') + '\n');

      const thumb = path.join(dir, 'thumbnail.jpg');
      await run(this.ffmpegPath, [
        '-y',
        '-ss',
        '1',
        '-i',
        src,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-2',
        thumb,
      ]).catch(() =>
        run(this.ffmpegPath, ['-y', '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', thumb]),
      );
      const gif = path.join(dir, 'preview.gif');
      await run(this.ffmpegPath, [
        '-y',
        '-t',
        '3',
        '-i',
        src,
        '-vf',
        'fps=10,scale=320:-2:flags=lanczos',
        '-loop',
        '0',
        gif,
      ]);

      // Cópia leve para o app baixar e tocar sem internet: 360p, sem áudio, até 90 s.
      const offline = path.join(dir, 'offline.mp4');
      await run(this.ffmpegPath, [
        '-y',
        '-i',
        src,
        '-t',
        '90',
        '-vf',
        'scale=-2:360',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        offline,
      ]);

      const variants: Record<string, VideoVariant> = {};
      const hlsPrefix = variantKey(storageKey, 'hls');
      for (const f of await readdir(hlsDir)) {
        const body = await readFile(path.join(hlsDir, f));
        const mime = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
        await this.storage.put(`${hlsPrefix}/${f}`, body, mime, body.length);
      }
      variants.hls = { key: `${hlsPrefix}/master.m3u8`, mimeType: 'application/vnd.apple.mpegurl' };
      for (const [name, file, mime] of [
        ['thumbnail', thumb, 'image/jpeg'],
        ['preview_gif', gif, 'image/gif'],
        ['offline_mp4', offline, 'video/mp4'],
      ] as const) {
        const body = await readFile(file);
        const key = variantKey(storageKey, path.basename(file));
        await this.storage.put(key, body, mime, body.length);
        variants[name] = { key, mimeType: mime, size: (await stat(file)).size };
      }
      return { providerAssetId: null, durationSeconds, width, height, variants };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/**
 * Produção (opção 1): Cloudflare Stream importa o vídeo pela URL assinada do R2.
 * As variantes são servidas pelo próprio Stream (HLS adaptativo).
 */
export class CloudflareStreamVideoProvider implements VideoProvider {
  readonly name = 'cloudflare-stream';
  constructor(
    private readonly storage: StorageProvider,
    private readonly o: { accountId: string; apiToken: string; customerSubdomain: string },
  ) {}

  async process({
    mediaId,
    storageKey,
  }: {
    mediaId: string;
    storageKey: string;
  }): Promise<VideoResult> {
    const url = await this.storage.presignGet(storageKey, 3600);
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.o.accountId}/stream/copy`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.o.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, meta: { mediaId }, requireSignedURLs: true }),
      },
    );
    const json = (await res.json()) as {
      success: boolean;
      result?: { uid: string; duration?: number };
      errors?: unknown;
    };
    if (!json.success || !json.result)
      throw new Error(`Cloudflare Stream: ${JSON.stringify(json.errors)}`);
    const uid = json.result.uid;
    const base = `https://${this.o.customerSubdomain}/${uid}`;
    return {
      providerAssetId: uid,
      durationSeconds: json.result.duration ?? null,
      width: null,
      height: null,
      variants: {
        hls: { key: `${base}/manifest/video.m3u8`, mimeType: 'application/vnd.apple.mpegurl' },
        thumbnail: { key: `${base}/thumbnails/thumbnail.jpg`, mimeType: 'image/jpeg' },
        preview_gif: { key: `${base}/thumbnails/thumbnail.gif?duration=3s`, mimeType: 'image/gif' },
      },
    };
  }
}

/** Produção (opção 2): Mux, com entrada pela URL assinada do R2. */
export class MuxVideoProvider implements VideoProvider {
  readonly name = 'mux';
  constructor(
    private readonly storage: StorageProvider,
    private readonly o: { tokenId: string; tokenSecret: string },
  ) {}

  async process({
    mediaId,
    storageKey,
  }: {
    mediaId: string;
    storageKey: string;
  }): Promise<VideoResult> {
    const url = await this.storage.presignGet(storageKey, 3600);
    const res = await fetch('https://api.mux.com/video/v1/assets', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.o.tokenId}:${this.o.tokenSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [{ url }],
        playback_policy: ['signed'],
        passthrough: mediaId,
        video_quality: 'basic',
      }),
    });
    const json = (await res.json()) as {
      data?: { id: string; playback_ids?: { id: string }[] };
      error?: unknown;
    };
    if (!res.ok || !json.data) throw new Error(`Mux: ${JSON.stringify(json.error)}`);
    const playback = json.data.playback_ids?.[0]?.id;
    return {
      providerAssetId: json.data.id,
      durationSeconds: null,
      width: null,
      height: null,
      variants: playback
        ? {
            hls: {
              key: `https://stream.mux.com/${playback}.m3u8`,
              mimeType: 'application/vnd.apple.mpegurl',
            },
            thumbnail: {
              key: `https://image.mux.com/${playback}/thumbnail.jpg`,
              mimeType: 'image/jpeg',
            },
            preview_gif: {
              key: `https://image.mux.com/${playback}/animated.gif?end=3`,
              mimeType: 'image/gif',
            },
          }
        : {},
    };
  }
}
