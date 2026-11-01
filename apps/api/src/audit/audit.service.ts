import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@vetta/db';
import type { Principal, RequestMeta } from '../common/request';
import { PrismaService } from '../infra/prisma.service';

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Trilha de auditoria (append-only) em audit_logs. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async log(principal: Principal | null, meta: RequestMeta | null, e: AuditEntry): Promise<void> {
    try {
      await this.prisma.system.auditLog.create({
        data: {
          action: e.action,
          resource: e.resource,
          resourceId: e.resourceId ?? null,
          tenantId: e.tenantId ?? null,
          actorUserId: principal?.kind === 'user' ? principal.userId : null,
          actorAdminId: principal?.kind === 'admin' ? principal.adminId : null,
          impersonatorAdminId: principal?.kind === 'user' ? principal.impersonatorAdminId : null,
          ip: meta?.ip ?? null,
          userAgent: meta?.userAgent ?? null,
          requestId: meta?.requestId ?? null,
          metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Auditoria nunca derruba a requisição, mas a falha precisa ficar visível.
      this.logger.error(`Falha ao gravar auditoria ${e.action}: ${(err as Error).message}`);
    }
  }
}
