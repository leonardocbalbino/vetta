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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  BulkStudentActionSchema,
  GroupInputSchema,
  StudentListQuerySchema,
  TenantSettingsSchema,
  UpdateStudentSchema,
} from '@vetta/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import {
  CurrentTenant,
  CurrentUser,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { StudentsAdminService } from './students-admin.service';

class StudentListQueryDto extends createZodDto(StudentListQuerySchema) {}
class UpdateStudentDto extends createZodDto(UpdateStudentSchema) {}
class BulkDto extends createZodDto(BulkStudentActionSchema) {}
class GroupDto extends createZodDto(GroupInputSchema) {}
class MembersDto extends createZodDto(
  z.object({ studentLinkIds: z.array(z.uuid()).min(1).max(500) }),
) {}
class ImportDto extends createZodDto(
  z.object({ csv: z.string().min(5).max(2_000_000), sendInvites: z.boolean().default(true) }),
) {}
class FrequencyQueryDto extends createZodDto(
  z.object({ weeks: z.coerce.number().int().min(1).max(26).default(8) }),
) {}
class InactiveQueryDto extends createZodDto(
  z.object({ days: z.coerce.number().int().min(1).max(365).optional() }),
) {}
class SettingsDto extends createZodDto(TenantSettingsSchema) {}

@ApiTags('students')
@Controller()
export class StudentsManagementController {
  constructor(private readonly students: StudentsAdminService) {}

  @Get('students')
  @Can('read', 'students')
  list(@CurrentTenant() t: TenantAccess, @Query() q: StudentListQueryDto) {
    return this.students.list(t, q);
  }

  @Get('students/frequency')
  @Can('read', 'students')
  frequency(@CurrentTenant() t: TenantAccess, @Query() q: FrequencyQueryDto) {
    return this.students.frequency(t, q.weeks);
  }

  @Get('students/inactive')
  @Can('read', 'students')
  @RequireFeature('students.inactivity_alert')
  inactive(@CurrentTenant() t: TenantAccess, @Query() q: InactiveQueryDto) {
    return this.students.inactive(t, q.days);
  }

  @Post('students/bulk')
  @HttpCode(200)
  @Can('update', 'students')
  bulk(@CurrentTenant() t: TenantAccess, @Body() dto: BulkDto) {
    return this.students.bulk(t, dto);
  }

  @Post('students/import')
  @Can('create', 'students')
  @RequireFeature('students.import_csv')
  import(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: ImportDto,
  ) {
    return this.students.importCsv(t, u, dto.csv, dto.sendInvites);
  }

  @Get('students/:id')
  @Can('read', 'students')
  detail(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.detail(t, id);
  }

  @Patch('students/:id')
  @Can('update', 'students')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.update(t, id, dto);
  }

  @Get('students/:id/timeline')
  @Can('read', 'students')
  timeline(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.timeline(t, id);
  }

  @Get('student-groups')
  @Can('read', 'groups')
  groups(@CurrentTenant() t: TenantAccess) {
    return this.students.groups(t);
  }

  @Post('student-groups')
  @Can('create', 'groups')
  @RequireFeature('students.groups')
  createGroup(@CurrentTenant() t: TenantAccess, @Body() dto: GroupDto) {
    return this.students.createGroup(t, dto);
  }

  @Patch('student-groups/:id')
  @Can('update', 'groups')
  @RequireFeature('students.groups')
  updateGroup(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroupDto,
  ) {
    return this.students.updateGroup(t, id, dto);
  }

  @Delete('student-groups/:id')
  @Can('delete', 'groups')
  removeGroup(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.removeGroup(t, id);
  }

  @Post('student-groups/:id/members')
  @Can('update', 'groups')
  @RequireFeature('students.groups')
  addMembers(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MembersDto,
  ) {
    return this.students.addMembers(t, id, dto.studentLinkIds);
  }

  @Delete('student-groups/:id/members/:studentLinkId')
  @Can('update', 'groups')
  removeMember(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentLinkId', ParseUUIDPipe) studentLinkId: string,
  ) {
    return this.students.removeMember(t, id, studentLinkId);
  }

  @Patch('tenants/current/settings')
  @Can('update', 'settings')
  settings(@CurrentTenant() t: TenantAccess, @Body() dto: SettingsDto) {
    return this.students.updateSettings(t, dto);
  }
}
