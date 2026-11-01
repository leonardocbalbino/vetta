import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export interface UploadedPart {
  partNumber: number;
  size: number;
  etag: string;
}

/** Abstração de storage de objetos (Cloudflare R2 em produção; SeaweedFS/S3 local). */
export interface StorageProvider {
  readonly bucket: string;
  presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn: number,
  ): Promise<string>;
  presignGet(key: string, expiresIn: number, downloadName?: string): Promise<string>;
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number,
  ): Promise<string>;
  listParts(key: string, uploadId: string): Promise<UploadedPart[]>;
  completeMultipart(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  /** Lê um intervalo de bytes (magic number). */
  readRange(key: string, start: number, end: number): Promise<Buffer>;
  getStream(key: string): Promise<Readable>;
  put(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface S3StorageOptions {
  endpoint?: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class S3StorageProvider implements StorageProvider {
  readonly bucket: string;
  private readonly client: S3Client;
  /** Cliente usado só para assinar URLs com o host público. */
  private readonly signer: S3Client;

  constructor(o: S3StorageOptions) {
    this.bucket = o.bucket;
    const base = {
      region: o.region,
      credentials: { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey },
      forcePathStyle: o.forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client({ ...base, ...(o.endpoint ? { endpoint: o.endpoint } : {}) });
    const pub = o.publicEndpoint ?? o.endpoint;
    this.signer = new S3Client({ ...base, ...(pub ? { endpoint: pub } : {}) });
  }

  presignPut(key: string, contentType: string, contentLength: number, expiresIn: number) {
    return getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn, signableHeaders: new Set(['content-type']) },
    );
  }

  presignGet(key: string, expiresIn: number, downloadName?: string) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadName
          ? {
              ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
            }
          : {}),
      }),
      { expiresIn },
    );
  }

  async createMultipart(key: string, contentType: string) {
    const r = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    if (!r.UploadId) throw new Error('Storage não retornou UploadId');
    return r.UploadId;
  }

  presignPart(key: string, uploadId: string, partNumber: number, expiresIn: number) {
    return getSignedUrl(
      this.signer,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn },
    );
  }

  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    do {
      const r = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const p of r.Parts ?? []) {
        if (p.PartNumber && p.ETag)
          parts.push({ partNumber: p.PartNumber, size: p.Size ?? 0, etag: p.ETag });
      }
      marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
    } while (marker);
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(key: string, uploadId: string, parts: UploadedPart[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: Number(r.ContentLength ?? 0),
        ...(r.ContentType ? { contentType: r.ContentType } : {}),
      };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async readRange(key: string, start: number, end: number) {
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${end}` }),
    );
    const bytes = await r.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async getStream(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return r.Body as Readable;
  }

  async put(key: string, body: Buffer | Readable, contentType: string, contentLength?: number) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
      }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Chave no storage: t/{tenant}/{purpose}/{mediaId}/original.{ext} (ou p/ e u/ sem tenant). */
export function buildStorageKey(o: {
  tenantId: string | null;
  ownerUserId?: string | null;
  purpose: string;
  mediaId: string;
  fileName: string;
}): string {
  const ext =
    (o.fileName.split('.').pop() ?? 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8) || 'bin';
  const scope = o.tenantId ? `t/${o.tenantId}` : o.ownerUserId ? `u/${o.ownerUserId}` : 'p';
  return `${scope}/${o.purpose}/${o.mediaId}/original.${ext}`;
}

export const variantKey = (originalKey: string, name: string) =>
  originalKey.replace(/\/original\.[^/]+$/, `/${name}`);
