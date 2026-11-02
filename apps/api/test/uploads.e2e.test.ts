import { cleanupPendingUploads, purgeDeletedMedia } from '@vetta/server';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminToken,
  as,
  createTestContext,
  lastEvent,
  login,
  runMediaJob,
  seedWorld,
  type TestContext,
} from './harness';

let ctx: TestContext;
let personal: string;
let student: string;
let tenantId: string;
let studentLinkId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  const w = await seedWorld(ctx, 'PRO', 2);
  tenantId = w.tenantId;
  studentLinkId = w.studentLinkIds[0]!;
  personal = await login(ctx, w.ownerEmail);
  student = await login(ctx, w.studentEmails[0]!);
});
afterAll(async () => ctx?.close());

/** JPEG com EXIF (inclusive GPS) para provar que os metadados são removidos. */
async function jpegWithExif() {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: '#C6F432' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Vetta', Model: 'TestCam', Copyright: 'privado' },
      IFD3: { GPSLatitudeRef: 'S', GPSLongitudeRef: 'W' },
    })
    .toBuffer();
}

async function putSigned(target: { url: string; headers?: Record<string, string> }, body: Buffer) {
  const res = await fetch(target.url, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: target.headers ?? {},
  });
  if (!res.ok) throw new Error(`PUT falhou: ${res.status} ${await res.text()}`);
  return res;
}

const usage = () => ctx.db.tenantStorageUsage.findUniqueOrThrow({ where: { tenantId } });

describe('fluxo completo de upload', () => {
  it('foto de progresso: URL assinada → storage → complete → worker remove EXIF e gera WEBP/thumbnail', async () => {
    const file = await jpegWithExif();
    expect((await sharp(file).metadata()).exif).toBeDefined();
    const before = await usage();

    const created = await as(ctx, student, tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'frente.jpg',
      mimeType: 'image/jpeg',
      size: file.length,
    });
    expect(created.status).toBe(201);
    expect(created.body.target.type).toBe('single');
    expect((await usage()).bytesReserved - before.bytesReserved).toBe(BigInt(file.length));

    await putSigned(created.body.target, file);
    const done = await as(ctx, student, tenantId).post(
      `/v1/uploads/${created.body.mediaId}/complete`,
    );
    expect(done.body.status).toBe('UPLOADED');

    const media = await runMediaJob(ctx, created.body.mediaId);
    expect(media.status).toBe('READY');
    expect(media.studentLinkId).toBe(studentLinkId);

    const got = await as(ctx, student, tenantId).get(`/v1/media/${media.id}`);
    expect(got.status).toBe(200);
    expect(Object.keys(got.body.variants).sort()).toEqual(['thumbnail', 'webp']);
    const original = Buffer.from(await (await fetch(got.body.url)).arrayBuffer());
    const meta = await sharp(original).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(1200);
    const webp = await sharp(
      Buffer.from(await (await fetch(got.body.variants.webp)).arrayBuffer()),
    ).metadata();
    expect(webp.format).toBe('webp');

    const after = await usage();
    expect(after.bytesReserved).toBe(before.bytesReserved);
    expect(after.bytesUsed).toBeGreaterThan(before.bytesUsed);
    expect(lastEvent(ctx, 'media.ready').payload).toMatchObject({ mediaId: media.id });
  });

  it('extensão falsa: PDF enviado como .jpg é recusado pelo magic number e a cota é liberada', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n');
    const before = await usage();
    const created = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'foto.jpg',
      mimeType: 'image/jpeg',
      size: pdf.length,
      studentLinkId,
    });
    await putSigned(created.body.target, pdf);
    await as(ctx, personal, tenantId).post(`/v1/uploads/${created.body.mediaId}/complete`);
    const media = await runMediaJob(ctx, created.body.mediaId);
    expect(media.status).toBe('FAILED');
    expect(media.failureReason).toMatch(/não corresponde/);
    expect(await ctx.storage.head(media.storageKey)).toBeNull();
    const after = await usage();
    expect(after.bytesReserved).toBe(before.bytesReserved);
    expect(after.bytesUsed).toBe(before.bytesUsed);
    expect(lastEvent(ctx, 'media.failed').payload).toMatchObject({ mediaId: media.id });
  });

  it('validações antes de assinar: tipo, tamanho e tamanho real divergente', async () => {
    const wrongType = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      size: 100,
    });
    expect(wrongType.body.code).toBe('UPLOAD_INVALID');
    const tooBig = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'x.jpg',
      mimeType: 'image/jpeg',
      size: 16 * 1024 * 1024,
    });
    expect(tooBig.body).toMatchObject({
      code: 'UPLOAD_INVALID',
      details: { maxBytes: 15 * 1024 * 1024 },
    });

    const file = await jpegWithExif();
    const created = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'x.jpg',
      mimeType: 'image/jpeg',
      size: file.length + 10,
    });
    // a URL assinada fixa o Content-Length: enviar tamanho diferente é recusado no storage ou no complete
    const put = await fetch(created.body.target.url, {
      method: 'PUT',
      body: new Uint8Array(file),
      headers: created.body.target.headers,
    });
    const done = await as(ctx, personal, tenantId).post(
      `/v1/uploads/${created.body.mediaId}/complete`,
    );
    if (put.ok) expect(done.body.code).toBe('UPLOAD_INVALID');
    else expect(done.status).toBe(400);
  });

  it('aluno não envia para outro aluno; aluno não lê mídia de outro aluno', async () => {
    const w = await seedWorld(ctx, 'PRO', 2);
    const s0 = await login(ctx, w.studentEmails[0]!);
    const s1 = await login(ctx, w.studentEmails[1]!);
    const forbidden = await as(ctx, s0, w.tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'x.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      studentLinkId: w.studentLinkIds[1],
    });
    expect(forbidden.status).toBe(403);
    const mine = await as(ctx, s0, w.tenantId).post('/v1/uploads', {
      purpose: 'progress_photo',
      fileName: 'x.jpg',
      mimeType: 'image/jpeg',
      size: 100,
    });
    expect((await as(ctx, s1, w.tenantId).get(`/v1/media/${mine.body.mediaId}`)).status).toBe(404);
    // outro tenant
    expect((await as(ctx, personal, tenantId).get(`/v1/media/${mine.body.mediaId}`)).status).toBe(
      404,
    );
  });

  it('documento KYC só é lido pelo super admin', async () => {
    const created = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'kyc_document',
      fileName: 'rg.pdf',
      mimeType: 'application/pdf',
      size: 100,
    });
    expect(created.status).toBe(201);
    expect(
      (await as(ctx, personal, tenantId).get(`/v1/media/${created.body.mediaId}`)).status,
    ).toBe(403);
    const admin = await adminToken(ctx, 'SUPER_ADMIN');
    expect((await as(ctx, admin.token).get(`/v1/media/${created.body.mediaId}`)).status).toBe(200);
    const op = await adminToken(ctx, 'ADMIN_OPERADOR');
    expect((await as(ctx, op.token).get(`/v1/media/${created.body.mediaId}`)).status).toBe(403);
  });
});

describe('cota de armazenamento', () => {
  it('bloqueia em 100% com 402 QUOTA_EXCEEDED, inclusive com uploads paralelos', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const t = await login(ctx, w.ownerEmail);
    await ctx.db.tenantStorageUsage.update({
      where: { tenantId: w.tenantId },
      data: { bytesUsed: 0n },
    });
    await ctx.db.tenantFeatureOverride.create({
      data: { tenantId: w.tenantId, featureKey: 'storage.quota_mb', value: 1, reason: 'teste' },
    });
    await ctx.cache.invalidateTenant(w.tenantId);

    const big = await as(ctx, t, w.tenantId).post('/v1/uploads', {
      purpose: 'exercise_image',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 2 * 1024 * 1024,
    });
    expect(big.status).toBe(402);
    expect(big.body).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      details: { feature: 'storage.quota_mb', max: 1 },
    });

    const body = {
      purpose: 'exercise_image',
      fileName: 'b.png',
      mimeType: 'image/png',
      size: 600 * 1024,
    };
    const [r1, r2] = await Promise.all([
      as(ctx, t, w.tenantId).post('/v1/uploads', body),
      as(ctx, t, w.tenantId).post('/v1/uploads', body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 402]);
  });
});

describe('multipart com retomada', () => {
  it('vídeo de 21 MB: partes assinadas, retomada das que faltam e complete', async () => {
    const size = 21 * 1024 * 1024;
    const file = Buffer.alloc(size, 7);
    Buffer.from([0, 0, 0, 0x18, ...Buffer.from('ftypisom')]).copy(file, 0);
    const created = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'exercise_video',
      fileName: 'remada.mp4',
      mimeType: 'video/mp4',
      size,
    });
    expect(created.status).toBe(201);
    const { target } = created.body;
    expect(target.type).toBe('multipart');
    expect(target.parts).toHaveLength(3);
    const chunk = (n: number) => file.subarray((n - 1) * target.partSize, n * target.partSize);

    // envia só as duas primeiras partes e "cai a conexão"
    for (const p of target.parts.slice(0, 2)) await putSigned(p, chunk(p.partNumber));
    const early = await as(ctx, personal, tenantId).post(
      `/v1/uploads/${created.body.mediaId}/complete`,
    );
    expect(early.body).toMatchObject({
      code: 'UPLOAD_INVALID',
      details: { receivedParts: 2, expectedParts: 3 },
    });

    const status = await as(ctx, personal, tenantId).get(`/v1/uploads/${created.body.mediaId}`);
    expect(status.body.uploadedParts.map((p: { partNumber: number }) => p.partNumber)).toEqual([
      1, 2,
    ]);
    expect(status.body.target.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([3]);

    await putSigned(status.body.target.parts[0], chunk(3));
    const done = await as(ctx, personal, tenantId).post(
      `/v1/uploads/${created.body.mediaId}/complete`,
    );
    expect(done.body.status).toBe('UPLOADED');
    expect(
      (
        await ctx.storage.head(
          (await ctx.db.media.findUniqueOrThrow({ where: { id: created.body.mediaId } }))
            .storageKey,
        )
      )?.size,
    ).toBe(size);
  });
});

describe('exclusão e limpeza', () => {
  it('exclusão lógica libera a cota; física após 30 dias; pendentes órfãos somem em 24 h', async () => {
    const file = await jpegWithExif();
    const created = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'exercise_image',
      fileName: 'img.jpg',
      mimeType: 'image/jpeg',
      size: file.length,
    });
    await putSigned(created.body.target, file);
    await as(ctx, personal, tenantId).post(`/v1/uploads/${created.body.mediaId}/complete`);
    await runMediaJob(ctx, created.body.mediaId);
    const used = (await usage()).bytesUsed;
    expect(
      (await as(ctx, personal, tenantId).delete(`/v1/media/${created.body.mediaId}`)).status,
    ).toBe(200);
    expect((await usage()).bytesUsed).toBeLessThan(used);
    expect(
      (await as(ctx, personal, tenantId).get(`/v1/media/${created.body.mediaId}`)).status,
    ).toBe(404);

    const m = await ctx.db.media.findUniqueOrThrow({ where: { id: created.body.mediaId } });
    expect(await ctx.storage.head(m.storageKey)).not.toBeNull();
    await purgeDeletedMedia(ctx.db, ctx.storage, new Date(Date.now() + 31 * 86_400_000));
    expect(await ctx.storage.head(m.storageKey)).toBeNull();
    expect((await ctx.db.media.findUniqueOrThrow({ where: { id: m.id } })).purgedAt).not.toBeNull();

    const pending = await as(ctx, personal, tenantId).post('/v1/uploads', {
      purpose: 'exercise_image',
      fileName: 'p.jpg',
      mimeType: 'image/jpeg',
      size: 5000,
    });
    const reserved = (await usage()).bytesReserved;
    const pendingCounted = await ctx.db.media.findMany({
      where: { tenantId, status: 'PENDING', purpose: { not: 'kyc_document' } },
      select: { size: true },
    });
    const pendingBytes = pendingCounted.reduce((a, m) => a + m.size, 0n);
    expect(pendingBytes).toBeGreaterThanOrEqual(5000n);
    await cleanupPendingUploads(ctx.db, ctx.storage, new Date(Date.now() + 25 * 3_600_000));
    expect(
      (await ctx.db.media.findUniqueOrThrow({ where: { id: pending.body.mediaId } })).status,
    ).toBe('DELETED');
    expect((await usage()).bytesReserved).toBe(reserved - pendingBytes);
  });
});
