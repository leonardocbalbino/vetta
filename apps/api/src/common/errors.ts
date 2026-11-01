import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, PlanCode } from '@vetta/contracts';

/** Exceção com o formato único da API: { code, message, details }. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, status);
  }
}

export const badRequest = (
  message: string,
  code: ErrorCode = 'VALIDATION_ERROR',
  details?: unknown,
) => new AppException(code, message, HttpStatus.BAD_REQUEST, details);

export const unauthorized = (
  message = 'Faça login para continuar.',
  code: ErrorCode = 'UNAUTHENTICATED',
) => new AppException(code, message, HttpStatus.UNAUTHORIZED);

export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new AppException('FORBIDDEN', message, HttpStatus.FORBIDDEN);

export const notFound = (message = 'Não encontrado.') =>
  new AppException('NOT_FOUND', message, HttpStatus.NOT_FOUND);

export const conflict = (message: string, details?: unknown) =>
  new AppException('CONFLICT', message, HttpStatus.CONFLICT, details);

export const upgradeRequired = (
  code: 'FEATURE_LOCKED' | 'LIMIT_REACHED' | 'QUOTA_EXCEEDED',
  message: string,
  details: { feature: string; requiredPlan: PlanCode | null; used?: number; max?: number },
) => new AppException(code, message, HttpStatus.PAYMENT_REQUIRED, details);
