import { z } from 'zod';
import { MediaStatus, type Role } from './enums.js';
import type { FeatureKey } from './features.js';

const MB = 1024 * 1024;

export const UploadPurpose = [
  'exercise_video',
  'exercise_image',
  'progress_photo',
  'posture_photo',
  'document',
  'chat_media',
  'avatar',
  'brand_logo',
  'kyc_document',
  'academy_content',
] as const;
export type UploadPurpose = (typeof UploadPurpose)[number];

export type MediaKind = 'video' | 'image' | 'document' | 'audio' | 'any';

export interface PurposeRule {
  maxBytes: number;
  mimeTypes: readonly string[];
  roles: readonly Role[];
  /** Feature exigida para tenants (admin da plataforma não passa por plano). */
  feature?: FeatureKey;
  /** Conta na cota de armazenamento do tenant. */
  countsQuota: boolean;
  /** Mídia pertence à plataforma (sem tenant). */
  platformOwned?: boolean;
  /** Mídia do usuário, independente de tenant (ex.: avatar). */
  userOwned?: boolean;
  /** Apenas papéis listados em readRoles podem ler (ex.: KYC). */
  readRoles?: readonly Role[];
  /** Processamento no worker. */
  processing: {
    stripExif?: boolean;
    webp?: boolean;
    thumbnail?: boolean;
    transcode?: boolean;
    previewGif?: boolean;
    antivirus?: boolean;
    sanitizeSvg?: boolean;
    pdfPreview?: boolean;
  };
}

const TENANT_STAFF: Role[] = ['PERSONAL', 'PERSONAL_ASSISTENTE'];
const TENANT_ALL: Role[] = ['PERSONAL', 'PERSONAL_ASSISTENTE', 'ALUNO'];
const PLATFORM: Role[] = ['SUPER_ADMIN', 'ADMIN_OPERADOR'];

const IMAGES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'] as const;

/** Regras por purpose (CLAUDE.md §9). */
export const UPLOAD_PURPOSES: Record<UploadPurpose, PurposeRule> = {
  exercise_video: {
    maxBytes: 500 * MB,
    mimeTypes: ['video/mp4', 'video/quicktime'],
    roles: [...TENANT_STAFF, ...PLATFORM],
    feature: 'library.custom_videos',
    countsQuota: true,
    processing: { transcode: true, thumbnail: true, previewGif: true },
  },
  exercise_image: {
    maxBytes: 10 * MB,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    roles: [...TENANT_STAFF, ...PLATFORM],
    feature: 'library.custom',
    countsQuota: true,
    processing: { stripExif: true, webp: true, thumbnail: true },
  },
  progress_photo: {
    maxBytes: 15 * MB,
    mimeTypes: IMAGES,
    roles: TENANT_ALL,
    feature: 'progress.photos',
    countsQuota: true,
    processing: { stripExif: true, webp: true, thumbnail: true },
  },
  posture_photo: {
    maxBytes: 15 * MB,
    mimeTypes: IMAGES,
    roles: TENANT_STAFF,
    feature: 'assessment.posture',
    countsQuota: true,
    processing: { stripExif: true, webp: true, thumbnail: true },
  },
  document: {
    maxBytes: 20 * MB,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    roles: TENANT_ALL,
    feature: 'docs.student_folder',
    countsQuota: true,
    processing: { antivirus: true, pdfPreview: true, stripExif: true, thumbnail: true },
  },
  chat_media: {
    maxBytes: 100 * MB,
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'video/mp4',
      'video/quicktime',
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
    ],
    roles: TENANT_ALL,
    feature: 'comms.chat_media',
    countsQuota: true,
    processing: { stripExif: true, thumbnail: true },
  },
  avatar: {
    maxBytes: 5 * MB,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    roles: [...TENANT_ALL, ...PLATFORM],
    countsQuota: false,
    userOwned: true,
    processing: { stripExif: true, webp: true, thumbnail: true },
  },
  brand_logo: {
    maxBytes: 5 * MB,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    roles: ['PERSONAL'],
    countsQuota: false,
    processing: { sanitizeSvg: true, webp: true },
  },
  kyc_document: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    roles: ['PERSONAL'],
    countsQuota: false,
    readRoles: ['SUPER_ADMIN'],
    processing: { antivirus: true },
  },
  academy_content: {
    maxBytes: 2048 * MB,
    mimeTypes: ['application/pdf', 'application/epub+zip', 'video/mp4', 'image/jpeg', 'image/png'],
    roles: PLATFORM,
    countsQuota: false,
    platformOwned: true,
    processing: { thumbnail: true },
  },
};

/** Acima deste tamanho o upload é multipart. */
export const MULTIPART_THRESHOLD = 20 * MB;
export const MULTIPART_PART_SIZE = 10 * MB;
export const SIGNED_URL_TTL_SECONDS = 15 * 60;
export const QUOTA_WARNING_RATIO = 0.8;
export const PENDING_UPLOAD_TTL_HOURS = 24;
export const SOFT_DELETE_RETENTION_DAYS = 30;

export const CreateUploadSchema = z.object({
  purpose: z.enum(UploadPurpose),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(127),
  size: z.number().int().positive(),
  /** Aluno ao qual a mídia se refere (fotos, documentos). */
  studentLinkId: z.uuid().optional(),
});
export type CreateUploadInput = z.infer<typeof CreateUploadSchema>;

export const UploadTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    url: z.url(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
  }),
  z.object({
    type: z.literal('multipart'),
    partSize: z.number().int(),
    parts: z.array(z.object({ partNumber: z.number().int(), url: z.url() })),
  }),
]);

export const CreateUploadResponseSchema = z.object({
  mediaId: z.uuid(),
  expiresAt: z.iso.datetime(),
  target: UploadTargetSchema,
});
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;

export const UploadStatusResponseSchema = z.object({
  mediaId: z.uuid(),
  status: z.enum(MediaStatus),
  /** Partes já recebidas pelo storage (retomada de multipart). */
  uploadedParts: z.array(z.object({ partNumber: z.number().int(), size: z.number() })),
  target: UploadTargetSchema.optional(),
});
export type UploadStatusResponse = z.infer<typeof UploadStatusResponseSchema>;

export const MediaVariantSchema = z.object({
  name: z.string(),
  key: z.string(),
  mimeType: z.string(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const MediaResponseSchema = z.object({
  id: z.uuid(),
  purpose: z.enum(UploadPurpose),
  status: z.enum(MediaStatus),
  mimeType: z.string(),
  size: z.number(),
  fileName: z.string(),
  url: z.url().nullable(),
  variants: z.record(z.string(), z.url()),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type MediaResponse = z.infer<typeof MediaResponseSchema>;
