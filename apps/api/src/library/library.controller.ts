import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExerciseInputSchema, ExerciseQuerySchema, FolderInputSchema } from '@vetta/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import {
  CurrentAdmin,
  CurrentTenant,
  CurrentUser,
  type AdminPrincipal,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { LibraryService } from './library.service';

class ExerciseInputDto extends createZodDto(ExerciseInputSchema) {}
class ExerciseQueryDto extends createZodDto(ExerciseQuerySchema) {}
class FolderInputDto extends createZodDto(FolderInputSchema) {}
class ImportDto extends createZodDto(
  z.object({
    csv: z.string().min(10).max(5_000_000),
    videos: z.array(z.object({ fileName: z.string().min(1), mediaId: z.uuid() })).default([]),
    dryRun: z.boolean().default(false),
  }),
) {}

@ApiTags('library')
@Controller()
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('exercises')
  @Can('read', 'library')
  search(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Query() q: ExerciseQueryDto,
  ) {
    return this.library.search(t, u.userId, q);
  }

  @Get('exercises/:id')
  @Can('read', 'library')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.get(t, id);
  }

  @Post('exercises')
  @Can('create', 'library')
  @RequireFeature('library.custom')
  create(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: ExerciseInputDto,
  ) {
    return this.library.create(t, u.userId, dto);
  }

  @Put('exercises/:id')
  @Can('update', 'library')
  @RequireFeature('library.custom')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExerciseInputDto,
  ) {
    return this.library.update(t, id, dto);
  }

  @Post('exercises/:id/duplicate')
  @Can('create', 'library')
  @RequireFeature('library.custom')
  duplicate(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.library.duplicate(t, u.userId, id);
  }

  @Delete('exercises/:id')
  @Can('delete', 'library')
  remove(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.remove(t, id);
  }

  @Post('exercises/:id/favorite')
  @Can('read', 'library')
  favorite(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.library.favorite(t, u.userId, id, true);
  }

  @Delete('exercises/:id/favorite')
  @Can('read', 'library')
  unfavorite(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.library.favorite(t, u.userId, id, false);
  }

  @Get('exercise-folders')
  @Can('read', 'library')
  folders(@CurrentTenant() t: TenantAccess) {
    return this.library.folders(t);
  }

  @Post('exercise-folders')
  @Can('create', 'library')
  @RequireFeature('library.custom')
  createFolder(@CurrentTenant() t: TenantAccess, @Body() dto: FolderInputDto) {
    return this.library.createFolder(t, dto.name, dto.parentId);
  }

  @Patch('exercise-folders/:id')
  @Can('update', 'library')
  @RequireFeature('library.custom')
  updateFolder(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FolderInputDto,
  ) {
    return this.library.updateFolder(t, id, dto.name);
  }

  @Delete('exercise-folders/:id')
  @Can('delete', 'library')
  removeFolder(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.removeFolder(t, id);
  }
}

@ApiTags('admin')
@Controller('admin/exercises')
export class AdminLibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @Can('read', 'platform.library')
  search(@Query() q: ExerciseQueryDto) {
    return this.library.adminSearch(q);
  }

  @Post()
  @Can('create', 'platform.library')
  create(@CurrentAdmin() a: AdminPrincipal, @Body() dto: ExerciseInputDto) {
    return this.library.adminCreate(a.adminId, dto);
  }

  @Put(':id')
  @Can('update', 'platform.library')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExerciseInputDto) {
    return this.library.adminUpdate(id, dto);
  }

  @Delete(':id')
  @Can('delete', 'platform.library')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.library.adminRemove(id);
  }

  /** Importação em lote: CSV + mapeamento dos vídeos já enviados por upload. */
  @Post('import')
  @Can('create', 'platform.library')
  import(@CurrentAdmin() a: AdminPrincipal, @Body() dto: ImportDto) {
    return this.library.adminImport(a.adminId, dto.csv, dto.videos, dto.dryRun);
  }

  @Get('video-queue')
  @Can('read', 'platform.library')
  queue() {
    return this.library.videoQueue();
  }
}
