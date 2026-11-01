import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import type { AppRequest } from '../common/request';
import { AuditService } from './audit.service';

/** Toda escrita feita durante uma impersonação é auditada automaticamente. */
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const p = req.principal;
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!write || p?.kind !== 'user' || !p.impersonatorAdminId) return next.handle();
    return next.handle().pipe(
      tap(() => {
        void this.audit.log(
          p,
          {
            ip: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
            requestId: req.id ? String(req.id) : null,
          },
          {
            action: 'impersonation.request',
            resource: req.route?.path ?? req.path,
            tenantId: req.tenantAccess?.tenantId ?? null,
            metadata: { method: req.method, path: req.originalUrl },
          },
        );
      }),
    );
  }
}
