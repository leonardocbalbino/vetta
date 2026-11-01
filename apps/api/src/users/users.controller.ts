import { Body, Controller, Delete, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantScoped } from '../access/decorators';
import { EntitlementsResponseDto, MeResponseDto, UpdateMeDto } from '../common/dto';
import {
  CurrentTenant,
  CurrentUser,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiSecurity('bearer')
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentUser() u: UserPrincipal) {
    return this.users.me(u);
  }

  @Patch()
  @ApiOkResponse({ type: MeResponseDto })
  update(@CurrentUser() u: UserPrincipal, @Body() dto: UpdateMeDto) {
    return this.users.update(u, dto);
  }

  /** Plano, features e limites do vínculo ativo (usado por useFeature no front). */
  @Get('entitlements')
  @TenantScoped()
  @ApiOkResponse({ type: EntitlementsResponseDto })
  entitlementsOf(@CurrentTenant() t: TenantAccess) {
    return this.entitlements.toResponse(t.tenantId);
  }

  /** LGPD: exportação dos dados do titular. */
  @Get('export')
  export(@CurrentUser() u: UserPrincipal) {
    return this.users.export(u);
  }

  /** LGPD: exclusão dos dados do titular. */
  @Delete()
  async remove(@CurrentUser() u: UserPrincipal) {
    await this.users.deleteAccount(u);
    return { ok: true as const };
  }
}
