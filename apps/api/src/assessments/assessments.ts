import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AssessmentInputSchema,
  SIGNED_URL_TTL_SECONDS,
  UNLIMITED,
  type AssessmentInput,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import {
  ageAt,
  bmi,
  bmiClass,
  bodyComposition,
  bodyFatClass,
  compositionFromBodyFat,
  MissingSkinfoldError,
  waistHipRatio,
  waistHipRisk,
  type Protocol,
} from '@vetta/fitness';
import { requiredPlanFor, type StorageProvider } from '@vetta/server';
import type { Queue } from 'bullmq';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can } from '../access/decorators';
import { badRequest, notFound, upgradeRequired } from '../common/errors';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { assertStudentInScope, studentScope } from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DOCUMENTS_QUEUE, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class AssessmentDto extends createZodDto(AssessmentInputSchema) {}
class CompareQueryDto extends createZodDto(z.object({ ids: z.string().optional() })) {}

const SKINFOLD_PROTOCOLS = [
  'POLLOCK_3',
  'POLLOCK_7',
  'JACKSON_POLLOCK',
  'GUEDES',
  'PETROSKI',
  'FAULKNER',
  'DURNIN_WOMERSLEY',
];

/** Calcula IMC, RCQ, composição e classificações a partir do formulário. */
export function computeResults(input: AssessmentInput, birthDate: Date | null, on: Date) {
  const results: Record<string, unknown> = {};
  results.bmi = bmi(input.weightKg, input.heightCm);
  results.bmiClass = bmiClass(results.bmi as number);
  const waist = input.perimeters['cintura'];
  const hip = input.perimeters['quadril'];
  if (waist && hip) {
    results.waistHipRatio = waistHipRatio(waist, hip);
    results.waistHipRisk = waistHipRisk(results.waistHipRatio as number, input.sex);
  }
  if (SKINFOLD_PROTOCOLS.includes(input.protocol)) {
    if (!birthDate && !['FAULKNER', 'GUEDES'].includes(input.protocol)) {
      throw badRequest('Informe a data de nascimento do aluno para este protocolo.');
    }
    try {
      Object.assign(
        results,
        bodyComposition({
          protocol: input.protocol as Protocol,
          sex: input.sex,
          age: birthDate ? ageAt(birthDate, on) : 30,
          weightKg: input.weightKg,
          skinfolds: input.skinfolds,
          equation: input.equation,
        }),
      );
    } catch (err) {
      if (err instanceof MissingSkinfoldError)
        throw badRequest(err.message, 'VALIDATION_ERROR', { missing: err.missing });
      throw err;
    }
  } else if (input.protocol === 'BIOIMPEDANCE') {
    if (!input.bioimpedance) throw badRequest('Informe o % de gordura da bioimpedância.');
    Object.assign(
      results,
      compositionFromBodyFat(input.weightKg, input.bioimpedance.bodyFatPct),
      input.bioimpedance,
    );
  }
  if (typeof results.bodyFatPct === 'number')
    results.bodyFatClass = bodyFatClass(results.bodyFatPct, input.sex);
  return results;
}

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(DOCUMENTS_QUEUE) private readonly documents: Queue,
  ) {}

  /** Limite por aluno (FREE = 1 avaliação por aluno). */
  private async assertPerStudentLimit(tenantId: string, studentLinkId: string) {
    const max = Number(
      (await this.entitlements.value(tenantId, 'assessment.physical_per_student')) ?? 0,
    );
    if (max === UNLIMITED) return;
    const used = await this.prisma
      .tenant(tenantId)
      .physicalAssessment.count({ where: { studentLinkId, deletedAt: null } });
    if (used < max) return;
    throw upgradeRequired(
      'LIMIT_REACHED',
      'Seu plano permite apenas 1 avaliação física por aluno.',
      {
        feature: 'assessment.physical_per_student',
        requiredPlan: requiredPlanFor(
          await this.entitlements.planMatrix(),
          'assessment.physical_per_student',
          used + 1,
        ),
        used,
        max,
      },
    );
  }

  async create(t: TenantAccess, studentLinkId: string, input: AssessmentInput) {
    const link = await assertStudentInScope(this.prisma, t, studentLinkId);
    await this.assertPerStudentLimit(t.tenantId, studentLinkId);
    const assessedAt = input.assessedAt ? new Date(input.assessedAt) : new Date();
    const results = computeResults(input, link.birthDate, assessedAt);
    const db = this.prisma.tenant(t.tenantId);
    const a = await db.physicalAssessment.create({
      data: {
        studentLinkId,
        assessorMemberId: t.memberId,
        assessedAt,
        protocol: input.protocol,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
        skinfolds: input.skinfolds,
        perimeters: input.perimeters,
        bioimpedance: (input.bioimpedance ?? {}) as Prisma.InputJsonValue,
        results: results as Prisma.InputJsonValue,
        equation: input.equation,
        nextAssessmentOn: input.nextAssessmentOn ? new Date(input.nextAssessmentOn) : null,
        notes: input.notes ?? null,
      } as never,
    });
    // Alimenta os gráficos de evolução.
    await db.bodyMeasurement.create({
      data: {
        studentLinkId,
        measuredAt: assessedAt,
        source: 'ASSESSMENT',
        weightKg: input.weightKg,
        bodyFatPct: typeof results.bodyFatPct === 'number' ? results.bodyFatPct : null,
        measures: input.perimeters,
      } as never,
    });
    if (!link.sex) {
      await db.studentLink.update({
        where: { id: studentLinkId },
        data: { sex: input.sex === 'male' ? 'MALE' : 'FEMALE' },
      });
    }
    return a;
  }

  list(t: TenantAccess, studentLinkId: string) {
    return this.prisma.tenant(t.tenantId).physicalAssessment.findMany({
      where: { studentLinkId, deletedAt: null, studentLink: studentScope(t) },
      orderBy: { assessedAt: 'desc' },
    });
  }

  async get(t: TenantAccess, id: string) {
    const a = await this.prisma.tenant(t.tenantId).physicalAssessment.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
      include: {
        studentLink: { select: { id: true, displayName: true, birthDate: true, sex: true } },
      },
    });
    if (!a) throw notFound('Avaliação não encontrada.');
    let pdfUrl: string | null = null;
    if (a.pdfMediaId) {
      const m = await this.prisma.system.media.findUnique({ where: { id: a.pdfMediaId } });
      if (m?.status === 'READY')
        pdfUrl = await this.storage.presignGet(
          m.storageKey,
          SIGNED_URL_TTL_SECONDS,
          'avaliacao.pdf',
        );
    }
    return { ...a, pdfUrl };
  }

  /** Comparativo: séries de peso, % gordura, massas e perímetros entre avaliações. */
  async compare(t: TenantAccess, studentLinkId: string, ids?: string[]) {
    const items = await this.prisma.tenant(t.tenantId).physicalAssessment.findMany({
      where: {
        studentLinkId,
        deletedAt: null,
        studentLink: studentScope(t),
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      orderBy: { assessedAt: 'asc' },
    });
    return {
      items: items.map((a) => ({
        id: a.id,
        assessedAt: a.assessedAt,
        weightKg: a.weightKg ? Number(a.weightKg) : null,
        results: a.results,
        perimeters: a.perimeters,
      })),
    };
  }

  async remove(t: TenantAccess, id: string) {
    await this.get(t, id);
    await this.prisma
      .tenant(t.tenantId)
      .physicalAssessment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  /** Gera o PDF no worker (react-pdf). Com o plano Pro, sai com a logo do personal. */
  async requestPdf(t: TenantAccess, id: string) {
    await this.get(t, id);
    const branded = await this.entitlements.hasFeature(t.tenantId, 'assessment.pdf_branding');
    await this.documents.add(
      'assessment-pdf',
      { assessmentId: id, tenantId: t.tenantId, branded },
      { jobId: `pdf-${id}-${Date.now()}`, attempts: 3 },
    );
    return { status: 'queued' as const };
  }
}

@ApiTags('assessments')
@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Post('students/:studentLinkId/assessments')
  @Can('create', 'assessments')
  create(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId', ParseUUIDPipe) s: string,
    @Body() dto: AssessmentDto,
  ) {
    return this.assessments.create(t, s, dto);
  }

  @Get('students/:studentLinkId/assessments')
  @Can('read', 'assessments')
  list(@CurrentTenant() t: TenantAccess, @Param('studentLinkId', ParseUUIDPipe) s: string) {
    return this.assessments.list(t, s);
  }

  @Get('students/:studentLinkId/assessments/compare')
  @Can('read', 'assessments')
  compare(
    @CurrentTenant() t: TenantAccess,
    @Param('studentLinkId', ParseUUIDPipe) s: string,
    @Query() q: CompareQueryDto,
  ) {
    return this.assessments.compare(t, s, q.ids?.split(',').filter(Boolean));
  }

  @Get('assessments/:id')
  @Can('read', 'assessments')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.get(t, id);
  }

  @Delete('assessments/:id')
  @Can('delete', 'assessments')
  remove(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.remove(t, id);
  }

  @Post('assessments/:id/pdf')
  @HttpCode(202)
  @Can('read', 'assessments')
  pdf(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.requestPdf(t, id);
  }
}
