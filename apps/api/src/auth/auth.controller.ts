import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  SetMetadata,
} from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminOnly, Can, Public } from '../access/decorators';
import {
  AuthTokensDto,
  EmailOnlyDto,
  ImpersonateDto,
  LoginDto,
  MagicLinkVerifyDto,
  OAuthLoginDto,
  RefreshDto,
  RegisterPersonalDto,
  ResetPasswordDto,
  SessionDto,
  TokenDto,
  TwoFactorCodeDto,
  TwoFactorLoginDto,
} from '../common/dto';
import {
  CurrentAdmin,
  CurrentPrincipal,
  CurrentUser,
  Meta,
  type AdminPrincipal,
  type Principal,
  type RequestMeta,
  type UserPrincipal,
} from '../common/request';
import { AdminAuthService } from './admin-auth.service';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

/** Marca rotas sujeitas ao limite estrito de tentativas (AUTH_RATE_LIMIT_PER_MINUTE). */
export const AUTH_THROTTLE = 'vetta:auth-throttle';
const AuthThrottle = () => SetMetadata(AUTH_THROTTLE, true);

const OK = { ok: true as const };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('register')
  @ApiOkResponse({ type: AuthTokensDto })
  register(@Body() dto: RegisterPersonalDto, @Meta() meta: RequestMeta) {
    return this.auth.registerPersonal(dto, meta);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Meta() meta: RequestMeta) {
    return this.auth.login(dto.email, dto.password, dto, meta);
  }

  @Public()
  @AuthThrottle()
  @Post('login/2fa')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthTokensDto })
  loginTwoFactor(@Body() dto: TwoFactorLoginDto, @Meta() meta: RequestMeta) {
    return this.auth.loginTwoFactor(dto.challengeToken, dto.code, dto, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthTokensDto })
  refresh(@Body() dto: RefreshDto, @Meta() meta: RequestMeta) {
    return this.sessions.refresh(dto.refreshToken, meta);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiSecurity('bearer')
  async logout(@CurrentPrincipal() p: Principal) {
    await this.sessions.revoke(p.sessionId, 'logout');
    return OK;
  }

  @Public()
  @AuthThrottle()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
    return OK;
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  @ApiSecurity('bearer')
  async resendVerification(@CurrentUser() u: UserPrincipal) {
    await this.auth.resendVerification(u);
    return OK;
  }

  @Public()
  @AuthThrottle()
  @Post('password/forgot')
  @HttpCode(200)
  async forgot(@Body() dto: EmailOnlyDto) {
    await this.auth.forgotPassword(dto.email);
    return OK;
  }

  @Public()
  @AuthThrottle()
  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return OK;
  }

  @Public()
  @AuthThrottle()
  @Post('magic-link')
  @HttpCode(200)
  async magicLink(@Body() dto: EmailOnlyDto) {
    await this.auth.requestMagicLink(dto.email);
    return OK;
  }

  @Public()
  @AuthThrottle()
  @Post('magic-link/verify')
  @HttpCode(200)
  verifyMagicLink(@Body() dto: MagicLinkVerifyDto, @Meta() meta: RequestMeta) {
    return this.auth.verifyMagicLink(dto.token, dto, meta);
  }

  @Public()
  @AuthThrottle()
  @Post('oauth')
  @HttpCode(200)
  oauth(@Body() dto: OAuthLoginDto, @Meta() meta: RequestMeta) {
    return this.auth.oauthLogin(dto, dto, meta);
  }

  @Get('sessions')
  @ApiSecurity('bearer')
  @ApiOkResponse({ type: [SessionDto] })
  listSessions(@CurrentUser() u: UserPrincipal) {
    return this.sessions.list(u.userId, u.sessionId);
  }

  @Delete('sessions/:id')
  @ApiSecurity('bearer')
  async revokeSession(@CurrentUser() u: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.sessions.revokeOwn(u.userId, id);
    return OK;
  }

  /** Encerra todas as outras sessões. */
  @Delete('sessions')
  @ApiSecurity('bearer')
  async revokeOthers(@CurrentUser() u: UserPrincipal) {
    const count = await this.sessions.revokeAllForUser(u.userId, 'user_revoked_all', u.sessionId);
    return { ok: true as const, revoked: count };
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @ApiSecurity('bearer')
  setup2fa(@CurrentUser() u: UserPrincipal) {
    return this.auth.setupTwoFactor(u);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @ApiSecurity('bearer')
  enable2fa(@CurrentUser() u: UserPrincipal, @Body() dto: TwoFactorCodeDto) {
    return this.auth.enableTwoFactor(u, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @ApiSecurity('bearer')
  async disable2fa(@CurrentUser() u: UserPrincipal, @Body() dto: TwoFactorCodeDto) {
    await this.auth.disableTwoFactor(u, dto.code);
    return OK;
  }
}

@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admin: AdminAuthService) {}

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.admin.login(dto.email, dto.password);
  }

  @Public()
  @AuthThrottle()
  @Post('2fa/setup')
  @HttpCode(200)
  setup(@Body() dto: TokenDto) {
    return this.admin.setup(dto.token);
  }

  @Public()
  @AuthThrottle()
  @Post('2fa/verify')
  @HttpCode(200)
  verify(@Body() dto: TwoFactorLoginDto, @Meta() meta: RequestMeta) {
    return this.admin.verify(dto.challengeToken, dto.code, meta);
  }

  @Get('me')
  @AdminOnly()
  me(@CurrentAdmin() a: AdminPrincipal) {
    return { id: a.adminId, role: a.role };
  }
}

@ApiTags('admin')
@Controller('admin/impersonations')
export class ImpersonationController {
  constructor(private readonly admin: AdminAuthService) {}

  @Post()
  @Can('manage', 'platform.impersonation')
  start(@CurrentAdmin() a: AdminPrincipal, @Body() dto: ImpersonateDto, @Meta() meta: RequestMeta) {
    return this.admin.impersonate(a, dto, meta);
  }

  @Delete(':sessionId')
  @Can('manage', 'platform.impersonation')
  async end(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Meta() meta: RequestMeta,
  ) {
    await this.admin.endImpersonation(a, id, meta);
    return OK;
  }
}
