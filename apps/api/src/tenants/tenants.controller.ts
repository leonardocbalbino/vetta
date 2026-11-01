import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AssertLimit, Can, Public, TenantScoped } from '../access/decorators';
import {
  AcceptInviteDto,
  AuthTokensDto,
  InvitePreviewDto,
  InviteResponseDto,
  InviteStudentDto,
  UpdateTenantDto,
} from '../common/dto';
import {
  CurrentTenant,
  CurrentUser,
  Meta,
  type RequestMeta,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { PrismaService } from '../infra/prisma.service';
import { StudentsService } from './students.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('current')
  @TenantScoped()
  async current(@CurrentTenant() t: TenantAccess) {
    const tenant = await this.prisma.tenant(t.tenantId).tenant.findFirstOrThrow({
      where: { id: t.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        cref: true,
        crefState: true,
        timezone: true,
        locale: true,
      },
    });
    return { ...tenant, role: t.role };
  }

  @Patch('current')
  @Can('update', 'settings')
  update(@CurrentTenant() t: TenantAccess, @Body() dto: UpdateTenantDto) {
    return this.prisma.tenant(t.tenantId).tenant.update({
      where: { id: t.tenantId },
      data: dto,
      select: {
        id: true,
        slug: true,
        name: true,
        cref: true,
        crefState: true,
        legalName: true,
        timezone: true,
      },
    });
  }
}

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @Can('read', 'students')
  list(@CurrentTenant() t: TenantAccess) {
    return this.students.list(t);
  }

  /** Convida um aluno (respeita o limite de alunos do plano). */
  @Post('invites')
  @Can('create', 'students')
  @AssertLimit('students.max')
  @ApiOkResponse({ type: InviteResponseDto })
  invite(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: InviteStudentDto,
  ) {
    return this.students.invite(t, u, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Can('update', 'students')
  archive(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.archive(t, id);
  }

  /** Reativa um aluno arquivado (só o personal; respeita o limite do plano). */
  @Post(':id/restore')
  @HttpCode(200)
  @Can('delete', 'students')
  @AssertLimit('students.max')
  restore(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.restore(t, id);
  }
}

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly students: StudentsService) {}

  @Public()
  @Get(':token')
  @ApiOkResponse({ type: InvitePreviewDto })
  preview(@Param('token') token: string) {
    return this.students.preview(token);
  }

  @Public()
  @Post('accept')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthTokensDto })
  accept(@Body() dto: AcceptInviteDto, @Meta() meta: RequestMeta) {
    return this.students.accept(dto, meta);
  }
}
