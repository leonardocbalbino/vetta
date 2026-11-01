import { Injectable } from '@nestjs/common';
import type { TenantRole } from '@vetta/contracts';
import { forbidden, notFound } from '../common/errors';
import type { TenantAccess } from '../common/request';
import { PrismaService } from '../infra/prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida o X-Tenant-Id contra os vínculos do usuário e define o papel efetivo. */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, tenantId: string): Promise<Omit<TenantAccess, 'scope'>> {
    // Tenant de outro usuário responde 404 (não revela existência).
    if (!UUID_RE.test(tenantId)) throw notFound('Vínculo não encontrado.');
    const db = this.prisma.system;
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, deletedAt: true },
    });
    if (!tenant || tenant.deletedAt) throw notFound('Vínculo não encontrado.');

    const member = await db.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (member && !member.deletedAt && member.status === 'ACTIVE') {
      if (tenant.status !== 'ACTIVE')
        throw forbidden('Esta conta está suspensa. Fale com o suporte.');
      const role: TenantRole = member.role === 'OWNER' ? 'PERSONAL' : 'PERSONAL_ASSISTENTE';
      return { tenantId, role, memberId: member.id, studentLinkId: null };
    }

    const link = await db.studentLink.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!link || link.deletedAt) throw notFound('Vínculo não encontrado.');
    if (link.status === 'ARCHIVED') throw forbidden('Seu acesso a este personal está arquivado.');
    if (link.status === 'INVITED') throw forbidden('Aceite o convite para acessar.');
    if (tenant.status !== 'ACTIVE') throw forbidden('Este personal está com a conta suspensa.');
    return {
      tenantId,
      role: 'ALUNO',
      memberId: null,
      studentLinkId: link.id,
      blocked: link.status === 'OVERDUE',
    };
  }
}
