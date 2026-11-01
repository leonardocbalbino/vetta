import { z } from 'zod';
import { PlanCode } from './enums.js';

export const ErrorCode = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'FEATURE_LOCKED',
  'LIMIT_REACHED',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'TWO_FACTOR_REQUIRED',
  'TWO_FACTOR_INVALID',
  'TOKEN_INVALID',
  'TOKEN_REUSED',
  'TENANT_REQUIRED',
  'UPLOAD_INVALID',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ErrorCode)[number];

/** Formato único de erro da API: { code, message, details }. */
export const ApiErrorSchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** details de 402 FEATURE_LOCKED / LIMIT_REACHED / QUOTA_EXCEEDED. */
export const UpgradeRequiredDetailsSchema = z.object({
  feature: z.string(),
  requiredPlan: z.enum(PlanCode).nullable(),
  used: z.number().optional(),
  max: z.number().optional(),
});
export type UpgradeRequiredDetails = z.infer<typeof UpgradeRequiredDetailsSchema>;
