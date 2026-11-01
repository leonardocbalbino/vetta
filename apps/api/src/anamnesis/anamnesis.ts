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
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AnamnesisAssignmentInputSchema,
  AnamnesisTemplateInputSchema,
  AnswerAnamnesisSchema,
  SendAnamnesisSchema,
  anamnesisHasRisk,
  validateAnswers,
  type AnamnesisQuestion,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import type { EventPublisher } from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature, Roles } from '../access/decorators';
import { AuthService } from '../auth/auth.service';
import { badRequest, conflict, notFound } from '../common/errors';
import {
  CurrentTenant,
  CurrentUser,
  Meta,
  type RequestMeta,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import {
  assertStudentInScope,
  requireStaff as requireStaffAccess,
  requireStudent,
  studentScope,
} from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

const TemplateInputSchema = AnamnesisTemplateInputSchema;

class SendDto extends createZodDto(SendAnamnesisSchema) {}
class AnswerDto extends createZodDto(AnswerAnamnesisSchema) {}
class TemplateDto extends createZodDto(TemplateInputSchema) {}
class AssignmentsQueryDto extends createZodDto(z.object({ studentLinkId: z.uuid().optional() })) {}
class AssignmentDto extends createZodDto(AnamnesisAssignmentInputSchema) {}
class ResponsesQueryDto extends createZodDto(
  z.object({
    studentLinkId: z.uuid().optional(),
    status: z.enum(['PENDING', 'ANSWERED']).optional(),
  }),
) {}

@Injectable()
export class AnamnesisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly entitlements: EntitlementsService,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  /** Modelos prontos (globais) + personalizados do tenant. */
  templates(t: TenantAccess) {
    return this.prisma.tenant(t.tenantId).anamnesisTemplate.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ tenantId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
  }

  createTemplate(t: TenantAccess, dto: z.infer<typeof TemplateInputSchema>) {
    return this.prisma.tenant(t.tenantId).anamnesisTemplate.create({
      data: {
        kind: 'CUSTOM',
        name: dto.name,
        description: dto.description ?? null,
        schema: { questions: dto.questions },
      } as never,
    });
  }

  /** Edita o modelo personalizado: nova versão (respostas antigas guardam a versão usada). */
  async updateTemplate(t: TenantAccess, id: string, dto: z.infer<typeof TemplateInputSchema>) {
    const db = this.prisma.tenant(t.tenantId);
    const tpl = await db.anamnesisTemplate.findFirst({
      where: { id, tenantId: t.tenantId, deletedAt: null },
    });
    if (!tpl) throw notFound('Modelo não encontrado.');
    return db.anamnesisTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        schema: { questions: dto.questions },
        version: { increment: 1 },
      },
    });
  }

  async deleteTemplate(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const tpl = await db.anamnesisTemplate.findFirst({
      where: { id, tenantId: t.tenantId, deletedAt: null },
    });
    if (!tpl) throw notFound('Modelo não encontrado.');
    await db.anamnesisTemplate.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { ok: true as const };
  }

  /** Reaplicação periódica: envia agora (ou na data) e repete a cada N dias. */
  async assign(t: TenantAccess, dto: z.infer<typeof AnamnesisAssignmentInputSchema>) {
    const db = this.prisma.tenant(t.tenantId);
    const tpl = await db.anamnesisTemplate.findFirst({
      where: { id: dto.templateId, deletedAt: null, isActive: true },
    });
    if (!tpl) throw notFound('Modelo não encontrado.');
    if (tpl.kind === 'CUSTOM')
      await this.entitlements.assertFeature(t.tenantId, 'assessment.anamnesis_custom');
    const first = dto.firstDueOn ?? new Date().toISOString().slice(0, 10);
    for (const studentLinkId of dto.studentLinkIds) {
      await assertStudentInScope(this.prisma, t, studentLinkId);
      await db.anamnesisAssignment.upsert({
        where: { studentLinkId_templateId: { studentLinkId, templateId: tpl.id } },
        create: {
          studentLinkId,
          templateId: tpl.id,
          repeatEveryDays: dto.repeatEveryDays,
          nextDueOn: new Date(first),
        } as never,
        update: {
          repeatEveryDays: dto.repeatEveryDays,
          nextDueOn: new Date(first),
          isActive: true,
          deletedAt: null,
        },
      });
    }
    return this.assignments(t);
  }

  assignments(t: TenantAccess, studentLinkId?: string) {
    return this.prisma.tenant(t.tenantId).anamnesisAssignment.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        studentLink: studentScope(t),
        ...(studentLinkId ? { studentLinkId } : {}),
      },
      include: {
        template: { select: { name: true } },
        studentLink: { select: { displayName: true } },
      },
      orderBy: { nextDueOn: 'asc' },
    });
  }

  async unassign(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const a = await db.anamnesisAssignment.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
    });
    if (!a) throw notFound('Reaplicação não encontrada.');
    await db.anamnesisAssignment.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { ok: true as const };
  }

  async send(t: TenantAccess, dto: z.infer<typeof SendAnamnesisSchema>) {
    const db = this.prisma.tenant(t.tenantId);
    const template = await db.anamnesisTemplate.findFirst({
      where: { id: dto.templateId, deletedAt: null, isActive: true },
    });
    if (!template) throw notFound('Modelo não encontrado.');
    if (template.kind === 'CUSTOM')
      await this.entitlements.assertFeature(t.tenantId, 'assessment.anamnesis_custom');
    const tenant = await db.tenant.findFirstOrThrow({
      where: { id: t.tenantId },
      select: { name: true },
    });
    const created: string[] = [];
    for (const studentLinkId of dto.studentLinkIds) {
      await assertStudentInScope(this.prisma, t, studentLinkId);
      const pending = await db.anamnesisResponse.findFirst({
        where: { studentLinkId, templateId: template.id, status: 'PENDING', deletedAt: null },
      });
      if (pending) continue;
      const r = await db.anamnesisResponse.create({
        data: {
          studentLinkId,
          templateId: template.id,
          templateVersion: template.version,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        } as never,
      });
      created.push(r.id);
      const due = dto.dueAt
        ? new Date(dto.dueAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : null;
      await this.events.publish('anamnesis.requested', {
        tenantId: t.tenantId,
        payload: {
          studentLinkId,
          responseId: r.id,
          templateName: template.name,
          tenantName: tenant.name,
          dueText: due ? ` até ${due}` : '',
        },
      });
    }
    return { created: created.length, ids: created };
  }

  async list(
    t: TenantAccess,
    q: { studentLinkId?: string | undefined; status?: 'PENDING' | 'ANSWERED' | undefined },
  ) {
    const where: Prisma.AnamnesisResponseWhereInput = {
      deletedAt: null,
      studentLink: studentScope(t),
      ...(q.studentLinkId ? { studentLinkId: q.studentLinkId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    return this.prisma.tenant(t.tenantId).anamnesisResponse.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      include: {
        template: { select: { id: true, name: true, kind: true } },
        studentLink: { select: { id: true, displayName: true } },
      },
    });
  }

  async get(t: TenantAccess, id: string) {
    const r = await this.prisma.tenant(t.tenantId).anamnesisResponse.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
      include: { template: true, studentLink: { select: { id: true, displayName: true } } },
    });
    if (!r) throw notFound('Anamnese não encontrada.');
    return r;
  }

  /** O aluno responde no app; o consentimento de dados de saúde fica registrado (LGPD). */
  async answer(
    t: TenantAccess,
    userId: string,
    id: string,
    dto: z.infer<typeof AnswerAnamnesisSchema>,
    meta: RequestMeta,
  ) {
    const studentLinkId = requireStudent(t);
    const db = this.prisma.tenant(t.tenantId);
    const r = await db.anamnesisResponse.findFirst({
      where: { id, studentLinkId, deletedAt: null },
      include: { template: true },
    });
    if (!r) throw notFound('Anamnese não encontrada.');
    if (r.status !== 'PENDING') throw conflict('Esta anamnese já foi respondida.');
    const questions = (
      (r.template.schema as { questions?: AnamnesisQuestion[] }).questions ?? []
    ).map((q) =>
      // Modelos prontos (PAR-Q) tratam toda pergunta como obrigatória.
      r.template.kind === 'PARQ' ? { ...q, required: q.required !== false } : q,
    );
    const errors = validateAnswers(questions, dto.answers);
    if (Object.keys(errors).length) {
      throw badRequest(
        r.template.kind === 'PARQ'
          ? 'Responda todas as perguntas do PAR-Q.'
          : 'Revise as respostas destacadas.',
        'VALIDATION_ERROR',
        { missing: Object.keys(errors), errors },
      );
    }
    const hasRisk = anamnesisHasRisk(r.template.kind, dto.answers);
    await db.anamnesisResponse.update({
      where: { id },
      data: {
        answers: dto.answers as Prisma.InputJsonValue,
        status: 'ANSWERED',
        answeredAt: new Date(),
        hasRisk,
      },
    });
    const hasConsent = await this.prisma.system.consent.findFirst({
      where: { userId, tenantId: t.tenantId, type: 'HEALTH_DATA', granted: true, revokedAt: null },
    });
    if (!hasConsent) {
      await this.prisma.system.consent.createMany({
        data: this.auth.consentRows(userId, t.tenantId, meta, ['HEALTH_DATA']),
      });
    }
    const link = await db.studentLink.findFirstOrThrow({
      where: { id: studentLinkId },
      select: { displayName: true },
    });
    const payload = {
      studentLinkId,
      responseId: id,
      studentName: link.displayName,
      templateName: r.template.name,
    };
    await this.events.publish('anamnesis.answered', {
      tenantId: t.tenantId,
      actorId: userId,
      payload,
    });
    if (hasRisk)
      await this.events.publish('anamnesis.risk', {
        tenantId: t.tenantId,
        actorId: userId,
        payload,
      });
    return { ok: true as const, hasRisk };
  }

  async review(t: TenantAccess, id: string) {
    await this.get(t, id);
    return this.prisma
      .tenant(t.tenantId)
      .anamnesisResponse.update({ where: { id }, data: { reviewedAt: new Date() } });
  }
}

@ApiTags('anamnesis')
@Controller('anamnesis')
export class AnamnesisController {
  constructor(private readonly anamnesis: AnamnesisService) {}

  @Get('templates')
  @Can('read', 'anamnesis')
  @RequireFeature('assessment.anamnesis')
  templates(@CurrentTenant() t: TenantAccess) {
    return this.anamnesis.templates(t);
  }

  @Post('templates')
  @Can('create', 'anamnesis')
  @RequireFeature('assessment.anamnesis_custom')
  createTemplate(@CurrentTenant() t: TenantAccess, @Body() dto: TemplateDto) {
    return this.anamnesis.createTemplate(t, dto);
  }

  @Put('templates/:id')
  @Can('update', 'anamnesis')
  @RequireFeature('assessment.anamnesis_custom')
  updateTemplate(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TemplateDto,
  ) {
    return this.anamnesis.updateTemplate(t, id, dto);
  }

  @Delete('templates/:id')
  @Can('delete', 'anamnesis')
  @RequireFeature('assessment.anamnesis_custom')
  deleteTemplate(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.anamnesis.deleteTemplate(t, id);
  }

  @Get('assignments')
  @Can('read', 'anamnesis')
  @RequireFeature('assessment.anamnesis')
  assignments(@CurrentTenant() t: TenantAccess, @Query() q: AssignmentsQueryDto) {
    requireStaffAccess(t);
    return this.anamnesis.assignments(t, q.studentLinkId);
  }

  @Post('assignments')
  @Can('create', 'anamnesis')
  @RequireFeature('assessment.anamnesis')
  assign(@CurrentTenant() t: TenantAccess, @Body() dto: AssignmentDto) {
    return this.anamnesis.assign(t, dto);
  }

  @Delete('assignments/:id')
  @Can('delete', 'anamnesis')
  @RequireFeature('assessment.anamnesis')
  unassign(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.anamnesis.unassign(t, id);
  }

  @Post('requests')
  @Can('create', 'anamnesis')
  @RequireFeature('assessment.anamnesis')
  send(@CurrentTenant() t: TenantAccess, @Body() dto: SendDto) {
    return this.anamnesis.send(t, dto);
  }

  @Get('responses')
  @Can('read', 'anamnesis')
  list(@CurrentTenant() t: TenantAccess, @Query() q: ResponsesQueryDto) {
    return this.anamnesis.list(t, q);
  }

  @Get('responses/:id')
  @Can('read', 'anamnesis')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.anamnesis.get(t, id);
  }

  @Post('responses/:id/answer')
  @HttpCode(200)
  @Roles('ALUNO')
  @Can('update', 'anamnesis')
  answer(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerDto,
    @Meta() meta: RequestMeta,
    @CurrentUser() u: UserPrincipal,
  ) {
    return this.anamnesis.answer(t, u.userId, id, dto, meta);
  }

  @Post('responses/:id/review')
  @HttpCode(200)
  @Can('create', 'anamnesis')
  review(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.anamnesis.review(t, id);
  }
}
