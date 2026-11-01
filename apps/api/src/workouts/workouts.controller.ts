import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApplyProgramSchema,
  CreateProgramSchema,
  FeedbackReplySchema,
  ProgramInputSchema,
  ProgramListQuerySchema,
  SyncSessionSchema,
} from '@vetta/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SetMetadata } from '@nestjs/common';
import { Can, Public, RequireFeature, Roles } from '../access/decorators';
import { AUTH_THROTTLE } from '../auth/auth.controller';
import {
  CurrentTenant,
  CurrentUser,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { requireStudent } from '../common/scope';
import { LibraryService } from '../library/library.service';
import { TrainingService } from '../training/training.service';
import { WorkoutsService } from './workouts.service';

class CreateProgramDto extends createZodDto(CreateProgramSchema) {}
class ProgramInputDto extends createZodDto(ProgramInputSchema) {}
class ApplyDto extends createZodDto(ApplyProgramSchema) {}
class ListDto extends createZodDto(ProgramListQuerySchema) {}
class CloneDto extends createZodDto(
  z.object({
    studentLinkId: z.uuid().nullable().optional(),
    asTemplate: z.boolean().default(false),
    name: z.string().trim().min(2).max(120).optional(),
  }),
) {}
class SyncDto extends createZodDto(SyncSessionSchema) {}
class ReplyDto extends createZodDto(FeedbackReplySchema) {}
class FeedbackQueryDto extends createZodDto(
  z.object({ unread: z.coerce.boolean().default(false) }),
) {}
class HistoryQueryDto extends createZodDto(
  z.object({
    studentLinkId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
) {}

@ApiTags('workouts')
@Controller('programs')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get()
  @Can('read', 'workouts')
  list(@CurrentTenant() t: TenantAccess, @Query() q: ListDto) {
    return this.workouts.list(t, q);
  }

  @Post()
  @Can('create', 'workouts')
  @RequireFeature('workouts.routines')
  create(@CurrentTenant() t: TenantAccess, @Body() dto: CreateProgramDto) {
    return this.workouts.create(t, dto);
  }

  @Get(':id')
  @Can('read', 'workouts')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.get(t, id);
  }

  /** Salva o programa inteiro (construtor). */
  @Put(':id')
  @Can('update', 'workouts')
  replace(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProgramInputDto,
  ) {
    return this.workouts.replace(t, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Can('update', 'workouts')
  publish(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.publish(t, id);
  }

  @Post(':id/clone')
  @Can('create', 'workouts')
  clone(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneDto,
  ) {
    return this.workouts.clone(t, id, { ...dto, ...(dto.name ? { name: dto.name } : {}) });
  }

  @Post(':id/apply')
  @Can('create', 'workouts')
  apply(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDto,
  ) {
    return this.workouts.apply(t, id, dto);
  }

  @Delete(':id')
  @Can('delete', 'workouts')
  archive(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.archive(t, id);
  }

  @Post(':id/public-link')
  @Can('update', 'workouts')
  @RequireFeature('workouts.public_link')
  link(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.createPublicLink(t, id);
  }

  @Delete(':id/public-link')
  @Can('update', 'workouts')
  revoke(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.revokePublicLink(t, id);
  }
}

@ApiTags('training')
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  /** Treino do dia do aluno (com última execução e sugestão de carga). */
  @Get('today')
  @Roles('ALUNO')
  @Can('read', 'workouts')
  @RequireFeature('training.player')
  today(@CurrentTenant() t: TenantAccess) {
    return this.training.today(t);
  }

  /** Sincroniza uma sessão concluída (idempotente por clientSessionId). */
  @Post('sessions')
  @Roles('ALUNO')
  @Can('create', 'training')
  @RequireFeature('training.player')
  sync(@CurrentTenant() t: TenantAccess, @CurrentUser() u: UserPrincipal, @Body() dto: SyncDto) {
    return this.training.sync(t.tenantId, requireStudent(t), u.userId, dto);
  }

  @Get('sessions')
  @Can('read', 'training')
  history(@CurrentTenant() t: TenantAccess, @Query() q: HistoryQueryDto) {
    return this.training.history(t, q.studentLinkId ?? '', q.limit);
  }

  @Get('records')
  @Can('read', 'training')
  records(@CurrentTenant() t: TenantAccess, @Query() q: HistoryQueryDto) {
    return this.training.records(t, q.studentLinkId ?? '');
  }
}

@ApiTags('feedbacks')
@Controller('feedbacks')
export class FeedbacksController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  @Can('read', 'students')
  list(@CurrentTenant() t: TenantAccess, @Query() q: FeedbackQueryDto) {
    return this.training.feedbacks(t, q.unread);
  }

  @Patch(':sessionId/read')
  @Can('read', 'students')
  read(@CurrentTenant() t: TenantAccess, @Param('sessionId', ParseUUIDPipe) id: string) {
    return this.training.markRead(t, id);
  }

  @Post(':sessionId/reply')
  @Roles('PERSONAL', 'PERSONAL_ASSISTENTE')
  @Can('create', 'chat')
  reply(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.training.reply(t, u.userId, id, dto.message);
  }
}

/** Link público do treino: sem login, revogável pelo personal. */
@ApiTags('public')
@Controller('public/workouts')
export class PublicWorkoutsController {
  constructor(
    private readonly workouts: WorkoutsService,
    private readonly training: TrainingService,
    private readonly library: LibraryService,
  ) {}

  @Public()
  @Get(':token')
  async get(@Param('token') token: string) {
    const { program, tenantId, studentLinkId, tenantName } =
      await this.workouts.byPublicToken(token);
    const enriched = await this.training.enrich(tenantId, studentLinkId, program);
    // Sem dados pessoais além do primeiro nome do aluno.
    const { studentLink, ...rest } = enriched;
    return {
      ...rest,
      tenantName,
      studentFirstName: studentLink?.displayName.split(' ')[0] ?? null,
    };
  }

  @Public()
  @SetMetadata(AUTH_THROTTLE, true)
  @Post(':token/sessions')
  async complete(@Param('token') token: string, @Body() dto: SyncDto) {
    const { program, tenantId, studentLinkId } = await this.workouts.byPublicToken(token);
    return this.training.sync(tenantId, studentLinkId, null, { ...dto, programId: program.id });
  }
}
