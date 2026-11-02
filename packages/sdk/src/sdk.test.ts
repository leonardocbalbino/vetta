import type { EntitlementsResponse } from '@vetta/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, VettaClient } from './client.js';
import { featureState } from './entitlements.js';
import { uploadFile, type PutFn } from './upload.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('VettaClient', () => {
  it('envia token e X-Tenant-Id; renova o token uma vez ao receber 401', async () => {
    const calls: { url: string; auth: string | null; tenant: string | null }[] = [];
    let refreshed = 0;
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      calls.push({ url: String(url), auth: h.get('Authorization'), tenant: h.get('X-Tenant-Id') });
      if (String(url).endsWith('/v1/auth/refresh')) {
        refreshed++;
        return json(200, {
          accessToken: 'novo',
          refreshToken: 'r2',
          expiresIn: 900,
          sessionId: 's',
        });
      }
      return h.get('Authorization') === 'Bearer novo'
        ? json(200, { ok: true })
        : json(401, { code: 'TOKEN_INVALID', message: 'x' });
    });
    const client = new VettaClient({
      baseUrl: 'https://api.vettafit.com.br',
      fetch: fetchMock as typeof fetch,
      getTenantId: () => 't1',
    });
    await client.tokens.set({
      accessToken: 'velho',
      refreshToken: 'r1',
      expiresIn: 900,
      sessionId: 's',
    });
    await Promise.all([client.me(), client.me()]);
    expect(refreshed).toBe(1);
    expect(calls.at(-1)).toMatchObject({ auth: 'Bearer novo', tenant: 't1' });
  });

  it('erros viram ApiRequestError com code', async () => {
    const client = new VettaClient({
      baseUrl: 'http://x',
      fetch: (async () =>
        json(402, {
          code: 'FEATURE_LOCKED',
          message: 'm',
          details: { requiredPlan: 'PRO' },
        })) as typeof fetch,
    });
    const err = await client.entitlements().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).isUpgradeRequired).toBe(true);
    expect((err as ApiRequestError).code).toBe('FEATURE_LOCKED');
  });
});

describe('featureState', () => {
  const ent: EntitlementsResponse = {
    plan: { code: 'FREE', name: 'Free', status: 'ACTIVE', trialEndsAt: null },
    features: { 'library.custom_videos': false, 'students.max': 2, 'comms.chat': true },
    limits: { 'students.max': { used: 2, max: 2 } },
  };
  it('feature desligada fica com cadeado', () => {
    expect(featureState(ent, 'library.custom_videos')).toMatchObject({
      enabled: false,
      locked: true,
    });
  });
  it('limite cheio fica com cadeado mesmo habilitado', () => {
    expect(featureState(ent, 'students.max')).toMatchObject({
      enabled: true,
      hasRoom: false,
      locked: true,
      used: 2,
      max: 2,
    });
  });
  it('liberada sem limite', () => {
    expect(featureState(ent, 'comms.chat')).toMatchObject({ enabled: true, locked: false });
  });
});

describe('uploadFile', () => {
  it('multipart: envia todas as partes e retoma só as que faltam', async () => {
    const puts: string[] = [];
    let failOnce = true;
    const put: PutFn = async (url) => {
      if (url === 'p2' && failOnce) {
        failOnce = false;
        throw new Error('rede');
      }
      puts.push(url);
    };
    const client = {
      uploads: {
        create: async () => ({
          mediaId: 'm1',
          expiresAt: '',
          target: {
            type: 'multipart',
            partSize: 4,
            parts: [1, 2, 3].map((n) => ({ partNumber: n, url: `p${n}` })),
          },
        }),
        complete: vi.fn(async () => ({ mediaId: 'm1', status: 'UPLOADED', uploadedParts: [] })),
      },
    } as unknown as VettaClient;
    const progress: number[] = [];
    const file = Object.assign(new Blob(['0123456789']), { name: 'v.mp4' });
    Object.defineProperty(file, 'type', { value: 'video/mp4' });
    const id = await uploadFile(client, file, {
      purpose: 'exercise_video',
      put,
      retries: 2,
      onProgress: (p) => progress.push(p.ratio),
    });
    expect(id).toBe('m1');
    expect(puts).toEqual(['p1', 'p2', 'p3']);
    expect(progress.at(-1)).toBe(1);
    expect(client.uploads.complete).toHaveBeenCalledWith('m1');
  }, 10_000);
});
