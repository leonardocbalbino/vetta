import * as C from '@vetta/contracts';
import { createZodDto } from 'nestjs-zod';

/** DTOs gerados a partir dos schemas de @vetta/contracts (fonte única). */
export class RegisterPersonalDto extends createZodDto(C.RegisterPersonalSchema) {}
export class LoginDto extends createZodDto(C.LoginSchema) {}
export class TwoFactorLoginDto extends createZodDto(C.TwoFactorLoginSchema) {}
export class RefreshDto extends createZodDto(C.RefreshSchema) {}
export class TokenDto extends createZodDto(C.TokenSchema) {}
export class EmailOnlyDto extends createZodDto(C.EmailOnlySchema) {}
export class ResetPasswordDto extends createZodDto(C.ResetPasswordSchema) {}
export class MagicLinkVerifyDto extends createZodDto(C.MagicLinkVerifySchema) {}
export class OAuthLoginDto extends createZodDto(C.OAuthLoginSchema) {}
export class InviteStudentDto extends createZodDto(C.InviteStudentSchema) {}
export class AcceptInviteDto extends createZodDto(C.AcceptInviteSchema) {}
export class TwoFactorCodeDto extends createZodDto(C.TwoFactorCodeSchema) {}
export class ImpersonateDto extends createZodDto(C.ImpersonateSchema) {}
export class CreateUploadDto extends createZodDto(C.CreateUploadSchema) {}
export class RegisterDeviceDto extends createZodDto(C.RegisterDeviceSchema) {}
export class NotificationPreferencesDto extends createZodDto(C.NotificationPreferencesSchema) {}
export class CursorQueryDto extends createZodDto(C.CursorQuerySchema) {}
export class IdParamDto extends createZodDto(C.IdParamSchema) {}
export class FeatureOverrideDto extends createZodDto(C.FeatureOverrideSchema) {}

export class AuthTokensDto extends createZodDto(C.AuthTokensSchema) {}
export class MeResponseDto extends createZodDto(C.MeResponseSchema) {}
export class EntitlementsResponseDto extends createZodDto(C.EntitlementsResponseSchema) {}
export class CreateUploadResponseDto extends createZodDto(C.CreateUploadResponseSchema) {}
export class UploadStatusResponseDto extends createZodDto(C.UploadStatusResponseSchema) {}
export class MediaResponseDto extends createZodDto(C.MediaResponseSchema) {}
export class NotificationDto extends createZodDto(C.NotificationSchema) {}
export class SessionDto extends createZodDto(C.SessionSchema) {}
export class InviteResponseDto extends createZodDto(C.InviteResponseSchema) {}
export class InvitePreviewDto extends createZodDto(C.InvitePreviewSchema) {}
export class ApiErrorDto extends createZodDto(C.ApiErrorSchema) {}
export class UpdateMeDto extends createZodDto(C.UpdateMeSchema) {}
export class UpdateTenantDto extends createZodDto(C.UpdateTenantSchema) {}
export class UpdatePlanFeaturesDto extends createZodDto(C.UpdatePlanFeaturesSchema) {}
