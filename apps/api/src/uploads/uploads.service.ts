import { Inject, Injectable } from '@nestjs/common';
import {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  PENDING_UPLOAD_TTL_HOURS,
  SIGNED_URL_TTL_SECONDS,
  UPLOAD_PURPOSES,
  type CreateUploadInput,
  type CreateUploadResponse,
  type MediaResponse,
  type Role,
  type UploadPurpose,
  type UploadStatusResponse,
} from '@vetta/contracts';
import type { Media } from '@vetta/db';
import {
  buildStorageKey,
  freeQuota,
  requiredPlanFor,
  reserveQuota,
  type StorageProvider,
} from '@vetta/server';
import type { Queue } from 'bullmq';
import { uuidv7 } from 'uuidv7';
import { badRequest, forbidden, notFound, upgradeRequired } from '../common/errors';
import type { Principal, TenantAccess } from '../common/request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MEDIA_QUEUE, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

type UploadTarget = CreateUploadResponse['target'];

/**
 * Upload direto ao storage (CLAUDE.md §9): a API só valida e assina URLs;
 * os bytes nunca passam por aqui.
 */
@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(MEDIA_QUEUE) private readonly mediaQueue: Queue,
  ) {}

  private roleOf(p: Principal, t: TenantAccess | undefined): Role | null {
    return p.kind === 'admin' ? p.role : (t?.role ?? null);
  }

  async create(
    p: Principal,
    t: TenantAccess | undefined,
    dto: CreateUploadInput,
  ): Promise<CreateUploadResponse> {
    const rule = UPLOAD_PURPOSES[dto.purpose];
    const role = this.roleOf(p, t);
    const platformUpload = p.kind === 'admin';
    const userOwnedUpload = !!rule.userOwned && !t && p.kind === 'user';

    if (!userOwnedUpload && !platformUpload && !t) {
      throw badRequest('Informe o vínculo ativo no header X-Tenant-Id.', 'TENANT_REQUIRED');
    }
    if (!userOwnedUpload && (!role || !rule.roles.includes(role))) {
      throw forbidden('Seu perfil não pode enviar este tipo de arquivo.');
    }
    if (!rule.mimeTypes.includes(dto.mimeType)) {
      throw badRequest('Formato de arquivo não permitido.', 'UPLOAD_INVALID', {
        allowed: rule.mimeTypes,
      });
    }
    if (dto.size > rule.maxBytes) {
      throw badRequest(
        `Arquivo maior que o permitido (${Math.round(rule.maxBytes / 1024 / 1024)} MB).`,
        'UPLOAD_INVALID',
        {
          maxBytes: rule.maxBytes,
        },
      );
    }

    const tenantId =
      platformUpload || userOwnedUpload || rule.platformOwned || rule.userOwned
        ? null
        : t!.tenantId;
    if (tenantId && rule.feature) await this.entitlements.assertFeature(tenantId, rule.feature);
    const studentLinkId =
      tenantId && t ? await this.resolveStudentLink(t, dto.studentLinkId) : null;

    if (tenantId && rule.countsQuota) {
      const limitMb = Number((await this.entitlements.value(tenantId, 'storage.quota_mb')) ?? 0);
      const ok = await reserveQuota(this.prisma.system, tenantId, dto.size, limitMb);
      if (!ok) {
        const used = (await this.entitlements.usage(tenantId, 'storage.quota_mb')) ?? 0;
        throw upgradeRequired(
          'QUOTA_EXCEEDED',
          'Seu armazenamento está cheio. Libere espaço ou faça upgrade.',
          {
            feature: 'storage.quota_mb',
            requiredPlan: requiredPlanFor(
              await this.entitlements.planMatrix(),
              'storage.quota_mb',
              used + Math.ceil(dto.size / 1048576),
            ),
            used,
            max: limitMb,
          },
        );
      }
    }

    const mediaId = uuidv7();
    const ownerUserId = p.kind === 'user' ? p.userId : null;
    const storageKey = buildStorageKey({
      tenantId,
      ownerUserId,
      purpose: dto.purpose,
      mediaId,
      fileName: dto.fileName,
    });
    const multipart = dto.size > MULTIPART_THRESHOLD;
    const uploadId = multipart
      ? await this.storage.createMultipart(storageKey, dto.mimeType)
      : null;
    const uploadExpiresAt = new Date(Date.now() + PENDING_UPLOAD_TTL_HOURS * 3_600_000);

    await this.prisma.system.media.create({
      data: {
        id: mediaId,
        tenantId,
        ownerUserId,
        ownerAdminId: p.kind === 'admin' ? p.adminId : null,
        studentLinkId,
        purpose: dto.purpose,
        status: 'PENDING',
        bucket: this.storage.bucket,
        storageKey,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        size: BigInt(dto.size),
        multipartUploadId: uploadId,
        uploadExpiresAt,
      },
    });

    return {
      mediaId,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      target: await this.target(storageKey, dto.mimeType, dto.size, uploadId, new Set()),
    };
  }

  private async target(
    key: string,
    mime: string,
    size: number,
    uploadId: string | null,
    done: Set<number>,
  ): Promise<UploadTarget> {
    if (!uploadId) {
      return {
        type: 'single',
        method: 'PUT',
        url: await this.storage.presignPut(key, mime, size, SIGNED_URL_TTL_SECONDS),
        headers: { 'Content-Type': mime },
      };
    }
    const total = Math.ceil(size / MULTIPART_PART_SIZE);
    const parts: { partNumber: number; url: string }[] = [];
    for (let n = 1; n <= total; n++) {
      if (!done.has(n))
        parts.push({
          partNumber: n,
          url: await this.storage.presignPart(key, uploadId, n, SIGNED_URL_TTL_SECONDS),
        });
    }
    return { type: 'multipart', partSize: MULTIPART_PART_SIZE, parts };
  }

  /** Aluno só envia para o próprio vínculo; assistente só para alunos atribuídos. */
  private async resolveStudentLink(t: TenantAccess, requested?: string): Promise<string | null> {
    if (t.role === 'ALUNO') {
      if (requested && requested !== t.studentLinkId) throw forbidden();
      return t.studentLinkId;
    }
    if (!requested) return null;
    const link = await this.prisma.tenant(t.tenantId).studentLink.findFirst({
      where: {
        id: requested,
        deletedAt: null,
        ...(t.role === 'PERSONAL_ASSISTENTE' ? { assistantMemberId: t.memberId } : {}),
      },
    });
    if (!link) throw notFound('Aluno não encontrado.');
    return link.id;
  }

  private async ownMedia(p: Principal, id: string): Promise<Media> {
    const m = await this.prisma.system.media.findUnique({ where: { id } });
    const mine =
      m && (p.kind === 'user' ? m.ownerUserId === p.userId : m.ownerAdminId === p.adminId);
    if (!m || !mine || m.deletedAt) throw notFound('Upload não encontrado.');
    return m;
  }

  /** Status e retomada: devolve as partes já recebidas e novas URLs para as que faltam. */
  async status(p: Principal, id: string): Promise<UploadStatusResponse> {
    const m = await this.ownMedia(p, id);
    if (m.status !== 'PENDING') return { mediaId: m.id, status: m.status, uploadedParts: [] };
    const parts = m.multipartUploadId
      ? await this.storage.listParts(m.storageKey, m.multipartUploadId)
      : [];
    return {
      mediaId: m.id,
      status: m.status,
      uploadedParts: parts.map((x) => ({ partNumber: x.partNumber, size: x.size })),
      target: await this.target(
        m.storageKey,
        m.mimeType,
        Number(m.size),
        m.multipartUploadId,
        new Set(parts.map((x) => x.partNumber)),
      ),
    };
  }

  async complete(p: Principal, id: string): Promise<UploadStatusResponse> {
    const m = await this.ownMedia(p, id);
    if (m.status !== 'PENDING') return { mediaId: m.id, status: m.status, uploadedParts: [] };
    const declared = Number(m.size);
    if (m.multipartUploadId) {
      const parts = await this.storage.listParts(m.storageKey, m.multipartUploadId);
      const expected = Math.ceil(declared / MULTIPART_PART_SIZE);
      const total = parts.reduce((a, x) => a + x.size, 0);
      if (parts.length !== expected || total !== declared) {
        throw badRequest('Upload incompleto: envie todas as partes.', 'UPLOAD_INVALID', {
          receivedParts: parts.length,
          expectedParts: expected,
        });
      }
      await this.storage.completeMultipart(m.storageKey, m.multipartUploadId, parts);
    }
    const head = await this.storage.head(m.storageKey);
    if (!head)
      throw badRequest('Arquivo não encontrado no storage. Envie novamente.', 'UPLOAD_INVALID');
    if (head.size !== declared) {
      throw badRequest('O tamanho enviado não confere com o informado.', 'UPLOAD_INVALID', {
        declared,
        received: head.size,
      });
    }
    await this.prisma.system.media.update({
      where: { id: m.id },
      data: { status: 'UPLOADED', uploadedAt: new Date() },
    });
    await this.mediaQueue.add(
      'process',
      { mediaId: m.id },
      { jobId: m.id, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return { mediaId: m.id, status: 'UPLOADED', uploadedParts: [] };
  }

  /** Leitura sempre por URL assinada de 15 min, com checagem de acesso. */
  async get(p: Principal, t: TenantAccess | undefined, id: string): Promise<MediaResponse> {
    const m = await this.readable(p, t, id);
    const variants: Record<string, string> = {};
    if (m.status === 'READY') {
      for (const [name, v] of Object.entries(
        (m.variants ?? {}) as Record<string, { key: string }>,
      )) {
        variants[name] = v.key.startsWith('http')
          ? v.key
          : await this.storage.presignGet(v.key, SIGNED_URL_TTL_SECONDS);
      }
    }
    return {
      id: m.id,
      purpose: m.purpose as UploadPurpose,
      status: m.status,
      mimeType: m.detectedMimeType ?? m.mimeType,
      size: Number(m.size),
      fileName: m.fileName,
      url:
        m.status === 'READY'
          ? await this.storage.presignGet(m.storageKey, SIGNED_URL_TTL_SECONDS, m.fileName)
          : null,
      variants,
      failureReason: m.failureReason,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private async readable(p: Principal, t: TenantAccess | undefined, id: string): Promise<Media> {
    const rule = (m: Media) => UPLOAD_PURPOSES[m.purpose as UploadPurpose];
    if (p.kind === 'admin') {
      const m = await this.prisma.platform.media.findUnique({ where: { id } });
      if (!m || m.deletedAt) throw notFound('Arquivo não encontrado.');
      const readRoles = rule(m).readRoles;
      if (readRoles && !readRoles.includes(p.role)) throw forbidden();
      return m;
    }
    // Mídia sem tenant (avatar, conteúdo da plataforma): qualquer usuário autenticado.
    const global = await this.prisma.system.media.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!global) throw notFound('Arquivo não encontrado.');
    if (!global.tenantId) {
      const m = await this.prisma.system.media.findUniqueOrThrow({ where: { id } });
      if (m.deletedAt) throw notFound('Arquivo não encontrado.');
      return m;
    }
    if (!t) throw notFound('Arquivo não encontrado.');
    const m = await this.prisma.tenant(t.tenantId).media.findUnique({ where: { id } });
    if (!m || m.deletedAt) throw notFound('Arquivo não encontrado.');
    const readRoles = rule(m).readRoles;
    if (readRoles && !readRoles.includes(t.role)) throw forbidden();
    if (t.role === 'ALUNO' && m.ownerUserId !== p.userId && m.studentLinkId !== t.studentLinkId)
      throw notFound('Arquivo não encontrado.');
    if (t.role === 'PERSONAL_ASSISTENTE' && m.ownerUserId !== p.userId && m.studentLinkId) {
      const assigned = await this.prisma
        .tenant(t.tenantId)
        .studentLink.count({ where: { id: m.studentLinkId, assistantMemberId: t.memberId } });
      if (!assigned) throw notFound('Arquivo não encontrado.');
    }
    return m;
  }

  /** Exclusão lógica (física após 30 dias pelo job de limpeza). */
  async remove(p: Principal, t: TenantAccess | undefined, id: string) {
    const m = await this.readable(p, t, id);
    const canDelete =
      p.kind === 'admin'
        ? !m.tenantId
        : m.ownerUserId === p.userId || (t?.role === 'PERSONAL' && m.tenantId === t.tenantId);
    if (!canDelete) throw forbidden();
    await this.prisma.system.media.update({
      where: { id: m.id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });
    if (m.multipartUploadId && m.status === 'PENDING') {
      await this.storage.abortMultipart(m.storageKey, m.multipartUploadId).catch(() => undefined);
    }
    if (
      m.tenantId &&
      UPLOAD_PURPOSES[m.purpose as UploadPurpose].countsQuota &&
      m.status === 'READY'
    ) {
      await freeQuota(this.prisma.system, m.tenantId, Number(m.size));
    }
    return { ok: true as const };
  }
}
