import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as Sentry from '@sentry/nestjs';
import type { ApiError, ErrorCode } from '@vetta/contracts';
import { Prisma } from '@vetta/db';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { AppException } from './errors';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  402: 'FEATURE_LOCKED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/** Converte qualquer erro para { code, message, details }. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const res = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toResponse(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      Sentry.captureException(exception);
    }
    res.status(status).json(body);
  }

  private toResponse(e: unknown): [number, ApiError] {
    if (e instanceof AppException) {
      return [e.getStatus(), e.getResponse() as ApiError];
    }
    if (e instanceof ZodValidationException) {
      const zodError = e.getZodError() as ZodError;
      return [
        HttpStatus.BAD_REQUEST,
        {
          code: 'VALIDATION_ERROR',
          message: zodError.issues[0]?.message ?? 'Dados inválidos.',
          details: zodError.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      ];
    }
    if (e instanceof ThrottlerException) {
      return [
        HttpStatus.TOO_MANY_REQUESTS,
        { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde um pouco.' },
      ];
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        return [HttpStatus.CONFLICT, { code: 'CONFLICT', message: 'Registro já existe.' }];
      if (e.code === 'P2025')
        return [HttpStatus.NOT_FOUND, { code: 'NOT_FOUND', message: 'Não encontrado.' }];
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      const message =
        typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? e.message);
      return [
        status,
        {
          code: STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR'),
          message: Array.isArray(message) ? message.join('; ') : String(message),
        },
      ];
    }
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { code: 'INTERNAL_ERROR', message: 'Erro inesperado. Tente novamente.' },
    ];
  }
}
