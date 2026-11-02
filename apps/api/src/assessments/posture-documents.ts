import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PostureInputSchema,
  StudentDocumentInputSchema,
  type PostureInput,
} from '@vetta/contracts';
import type { EventPublisher, StorageProvider } from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import { badRequest, notFound } from '../common/errors';
import { signedMediaUrl } from '../common/media';
import {
  CurrentTenant,
  CurrentUser,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { assertStudentInScope, isStaff, studentScope } from '../common/scope';
import { EVENTS, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class PostureDto extends createZodDto(PostureInputSchema) {}
class CompareDto extends createZodDto(
  z.object({ ids: z.string().regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36})+$/i) }),
) {}
class DocumentDto extends createZodDto(StudentDocumentInputSchema) {}
class DocumentPatchDto extends createZodDto(
  StudentDocumentInputSchema.omit({ mediaId: true }).partial(),
) {}
class DocumentsQueryDto extends createZodDto(
  z.object({
    category: z.enum(['EXAM', 'MEAL_PLAN', 'CONTRACT', 'PRESCRIPTION', 'OTHER']).optional(),
  }),
) {}

const VIEW_ORDER = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];

@Injectable()
export class PostureService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  private async assertPhotos(tenantId: string, studentLinkId: string, input: PostureInput) {
    const ids = input.photos.map((p) => p.mediaId);
    if (new Set(input.photos.map((p) => p.view)).size !== input.photos.length)
      throw badRequest('Uma foto por vista (frente, costas e perfis).');
    if (!ids.length) return;
    const ok = await this.prisma.system.media.count({
      where: {
        id: { in: ids },
        tenantId,
        purpose: 'posture_photo',
        deletedAt: null,
        OR: [{ studentLinkId }, { studentLinkId: null }],
      },
    });
    if (ok !== ids.length)
      throw badRequest('Envie as fotos posturais antes (upload posture_photo).');
  }

  private async view(a: {
    id: string;
    studentLinkId: string;
    assessedAt: Date;
    findings: unknown;
    notes: string | null;
    photos: { id: string; view: string; mediaId: string; markers: unknown }[];
  }) {
    const media = await this.prisma.system.media.findMany({
      where: { id: { in: a.photos.map((p) => p.mediaId) } },
    });
    return {
      id: a.id,
      studentLinkId: a.studentLinkId,
      assessedAt: a.assessedAt,
      findings: a.findings,
      notes: a.notes,
      photos: await Promise.all(
        [...a.photos]
          .sort((x, y) => VIEW_ORDER.indexOf(x.view) - VIEW_ORDER.indexOf(y.view))
          .map(async (p) => {
            const m = media.find((x) => x.id === p.mediaId);
            return {
              id: p.id,
              view: p.view,
              mediaId: p.mediaId,
              markers: p.markers,
              url: m && m.status === 'READY' ? await signedMediaUrl(this.storage, m) : null,
              status: m?.status ?? 'DELETED',
            };
          }),
      ),
    };
  }

  async list(t: TenantAccess, studentLinkId: string) {
    await assertStudentInScope(this.prisma, t, studentLinkId);
    const items = await this.prisma.tenant(t.tenantId).postureAssessment.findMany({
      where: { studentLinkId, deletedAt: null },
      include: { photos: { where: { deletedAt: null } } },
      orderBy: { assessedAt: 'desc' },
    });
    return Promise.all(items.map((a) => this.view(a)));
  }

  async get(t: TenantAccess, id: string) {
    const a = await this.prisma.tenant(t.tenantId).postureAssessment.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
      include: { photos: { where: { deletedAt: null } } },
    });
    if (!a) throw notFound('Avaliação postural não encontrada.');
    return this.view(a);
  }

  async create(t: TenantAccess, studentLinkId: string, input: PostureInput) {
    await assertStudentInScope(this.prisma, t, studentLinkId);
    await this.assertPhotos(t.tenantId, studentLinkId, input);
    const db = this.prisma.tenant(t.tenantId);
    const a = await db.postureAssessment.create({
      data: {
        studentLinkId,
        assessedAt: input.assessedAt ? new Date(input.assessedAt) : new Date(),
        findings: input.findings,
        notes: input.notes ?? null,
      } as never,
    });
    if (input.photos.length)
      await db.posturePhoto.createMany({
        data: input.photos.map((p) => ({
          tenantId: t.tenantId,
          postureAssessmentId: a.id,
          view: p.view,
          mediaId: p.mediaId,
          markers: p.markers,
        })) as never,
      });
    return this.get(t, a.id);
  }

  /** Atualiza checklist, notas e marcações (pontos e linhas) sobre as fotos. */
  async update(t: TenantAccess, id: string, input: PostureInput) {
    const current = await this.get(t, id);
    await this.assertPhotos(t.tenantId, current.studentLinkId, input);
    const db = this.prisma.tenant(t.tenantId);
    await db.postureAssessment.update({
      where: { id },
      data: {
        findings: input.findings,
        notes: input.notes ?? null,
        ...(input.assessedAt ? { assessedAt: new Date(input.assessedAt) } : {}),
      },
    });
    await db.posturePhoto.updateMany({
      where: { postureAssessmentId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (input.photos.length)
      await db.posturePhoto.createMany({
        data: input.photos.map((p) => ({
          tenantId: t.tenantId,
          postureAssessmentId: id,
          view: p.view,
          mediaId: p.mediaId,
          markers: p.markers,
        })) as never,
      });
    return this.get(t, id);
  }

  async remove(t: TenantAccess, id: string) {
    await this.get(t, id);
    await this.prisma
      .tenant(t.tenantId)
      .postureAssessment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  /** Comparativo: fotos por vista lado a lado e o que mudou no checklist. */
  async compare(t: TenantAccess, ids: string[]) {
    const items = await Promise.all(ids.slice(0, 4).map((id) => this.get(t, id)));
    if (new Set(items.map((i) => i.studentLinkId)).size > 1)
      throw badRequest('Compare avaliações do mesmo aluno.');
    const sorted = items.sort((a, b) => a.assessedAt.getTime() - b.assessedAt.getTime());
    const first = (sorted[0]!.findings ?? {}) as Record<string, string>;
    const last = (sorted[sorted.length - 1]!.findings ?? {}) as Record<string, string>;
    const keys = [...new Set([...Object.keys(first), ...Object.keys(last)])];
    const rank = { leve: 1, moderado: 2, acentuado: 3 } as Record<string, number>;
    return {
      assessments: sorted,
      views: VIEW_ORDER.map((view) => ({
        view,
        photos: sorted.map((a) => a.photos.find((p) => p.view === view) ?? null),
      })),
      changes: keys.map((k) => {
        const a = rank[first[k] ?? ''] ?? 0;
        const b = rank[last[k] ?? ''] ?? 0;
        return {
          deviation: k,
          from: first[k] ?? null,
          to: last[k] ?? null,
          trend: b < a ? 'improved' : b > a ? 'worse' : 'same',
        };
      }),
    };
  }
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  private async view(d: {
    id: string;
    title: string;
    category: string;
    visibleToStudent: boolean;
    createdAt: Date;
    mediaId: string;
    studentLinkId: string;
    uploadedByUserId: string;
  }) {
    const m = await this.prisma.system.media.findUnique({ where: { id: d.mediaId } });
    return {
      id: d.id,
      studentLinkId: d.studentLinkId,
      title: d.title,
      category: d.category,
      visibleToStudent: d.visibleToStudent,
      createdAt: d.createdAt,
      uploadedByUserId: d.uploadedByUserId,
      file: m
        ? {
            mimeType: m.detectedMimeType ?? m.mimeType,
            size: Number(m.size),
            status: m.status,
            fileName: m.fileName,
            url:
              m.status === 'READY'
                ? await this.storage.presignGet(m.storageKey, 900, m.fileName)
                : null,
            previewUrl:
              m.status === 'READY' && (m.variants as Record<string, unknown>)?.thumbnail
                ? await signedMediaUrl(this.storage, m, 'thumbnail')
                : null,
          }
        : null,
    };
  }

  async list(t: TenantAccess, studentLinkId: string, category?: string) {
    await assertStudentInScope(this.prisma, t, studentLinkId);
    const items = await this.prisma.tenant(t.tenantId).studentDocument.findMany({
      where: {
        studentLinkId,
        deletedAt: null,
        ...(category ? { category: category as never } : {}),
        ...(t.role === 'ALUNO' ? { visibleToStudent: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(items.map((d) => this.view(d)));
  }

  async create(
    t: TenantAccess,
    userId: string,
    studentLinkId: string,
    dto: z.infer<typeof StudentDocumentInputSchema>,
  ) {
    const link = await assertStudentInScope(this.prisma, t, studentLinkId);
    const m = await this.prisma.system.media.findFirst({
      where: {
        id: dto.mediaId,
        tenantId: t.tenantId,
        purpose: 'document',
        ownerUserId: userId,
        deletedAt: null,
      },
    });
    if (!m) throw badRequest('Envie o arquivo antes (upload document).');
    const staff = isStaff(t);
    const d = await this.prisma.tenant(t.tenantId).studentDocument.create({
      data: {
        studentLinkId,
        mediaId: m.id,
        uploadedByUserId: userId,
        title: dto.title,
        category: dto.category,
        // O aluno sempre vê o que ele mesmo enviou.
        visibleToStudent: staff ? dto.visibleToStudent : true,
      } as never,
    });
    if (staff && d.visibleToStudent && link.userId)
      await this.events.publish('document.shared', {
        tenantId: t.tenantId,
        payload: { studentLinkId, documentId: d.id, title: d.title },
      });
    return this.view(d);
  }

  private async find(t: TenantAccess, id: string) {
    const d = await this.prisma.tenant(t.tenantId).studentDocument.findFirst({
      where: {
        id,
        deletedAt: null,
        studentLink: studentScope(t),
        ...(t.role === 'ALUNO' ? { visibleToStudent: true } : {}),
      },
    });
    if (!d) throw notFound('Documento não encontrado.');
    return d;
  }

  async get(t: TenantAccess, id: string) {
    return this.view(await this.find(t, id));
  }

  async update(
    t: TenantAccess,
    id: string,
    dto: {
      title?: string | undefined;
      category?: string | undefined;
      visibleToStudent?: boolean | undefined;
    },
  ) {
    await this.find(t, id);
    const d = await this.prisma.tenant(t.tenantId).studentDocument.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.category ? { category: dto.category as never } : {}),
        ...(dto.visibleToStudent !== undefined ? { visibleToStudent: dto.visibleToStudent } : {}),
      },
    });
    return this.view(d);
  }

  async remove(t: TenantAccess, userId: string, id: string) {
    const d = await this.find(t, id);
    // Aluno só apaga o que enviou.
    if (t.role === 'ALUNO' && d.uploadedByUserId !== userId)
      throw notFound('Documento não encontrado.');
    await this.prisma
      .tenant(t.tenantId)
      .studentDocument.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.system.media.update({
      where: { id: d.mediaId },
      data: { deletedAt: new Date() },
    });
    return { ok: true as const };
  }
}

@ApiTags('assessments')
@Controller()
export class PostureController {
  constructor(private readonly posture: PostureService) {}

  @Get('students/:studentLinkId/posture')
  @Can('read', 'assessments')
  @RequireFeature('assessment.posture')
  list(@CurrentTenant() t: TenantAccess, @Param('studentLinkId', ParseUUIDPipe) id: string) {
    return this.posture.list(t, id);
  }

  @Post('students/:studentLinkId/posture')
  @Can('create', 'assessments')
  @RequireFeature('assessment.posture')
  create(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId', ParseUUIDPipe) id: string,
    @Body() dto: PostureDto,
  ) {
    return this.posture.create(t, id, dto);
  }

  @Get('posture/compare')
  @Can('read', 'assessments')
  @RequireFeature('assessment.posture')
  compare(@CurrentTenant() t: TenantAccess, @Query() q: CompareDto) {
    return this.posture.compare(t, q.ids.split(','));
  }

  @Get('posture/:id')
  @Can('read', 'assessments')
  @RequireFeature('assessment.posture')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.posture.get(t, id);
  }

  @Put('posture/:id')
  @Can('update', 'assessments')
  @RequireFeature('assessment.posture')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostureDto,
  ) {
    return this.posture.update(t, id, dto);
  }

  @Delete('posture/:id')
  @Can('delete', 'assessments')
  @RequireFeature('assessment.posture')
  remove(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.posture.remove(t, id);
  }
}

@ApiTags('documents')
@Controller()
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get('students/:studentLinkId/documents')
  @Can('read', 'documents')
  @RequireFeature('docs.student_folder')
  list(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId', ParseUUIDPipe) id: string,
    @Query() q: DocumentsQueryDto,
  ) {
    return this.docs.list(t, id, q.category);
  }

  @Post('students/:studentLinkId/documents')
  @Can('create', 'documents')
  @RequireFeature('docs.student_folder')
  create(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('studentLinkId', ParseUUIDPipe) id: string,
    @Body() dto: DocumentDto,
  ) {
    return this.docs.create(t, u.userId, id, dto);
  }

  @Get('documents/:id')
  @Can('read', 'documents')
  @RequireFeature('docs.student_folder')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.get(t, id);
  }

  @Patch('documents/:id')
  @Can('update', 'documents')
  @RequireFeature('docs.student_folder')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentPatchDto,
  ) {
    return this.docs.update(t, id, dto);
  }

  @Delete('documents/:id')
  // O aluno pode apagar o que ele mesmo enviou (checado no serviço).
  @Can('create', 'documents')
  @RequireFeature('docs.student_folder')
  remove(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.docs.remove(t, u.userId, id);
  }
}
