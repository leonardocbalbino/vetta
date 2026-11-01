import type { Prisma } from '@vetta/db';
import { forbidden, notFound } from './errors';
import type { TenantAccess } from './request';
import type { PrismaService } from '../infra/prisma.service';

/** Filtro de alunos conforme o escopo do papel (all, assigned ou own). */
export function studentScope(t: TenantAccess): Prisma.StudentLinkWhereInput {
  if (t.role === 'ALUNO') return { id: t.studentLinkId ?? '00000000-0000-0000-0000-000000000000' };
  if (t.scope === 'assigned') return { assistantMemberId: t.memberId };
  return {};
}

/** Garante que o aluno existe no tenant e está no escopo; 404 caso contrário. */
export async function assertStudentInScope(
  prisma: PrismaService,
  t: TenantAccess,
  studentLinkId: string,
) {
  const link = await prisma.tenant(t.tenantId).studentLink.findFirst({
    where: { id: studentLinkId, deletedAt: null, ...studentScope(t) },
  });
  if (!link) throw notFound('Aluno não encontrado.');
  return link;
}

export const isStaff = (t: TenantAccess) =>
  t.role === 'PERSONAL' || t.role === 'PERSONAL_ASSISTENTE';

export function requireStaff(t: TenantAccess) {
  if (!isStaff(t)) throw forbidden();
}

export function requireStudent(t: TenantAccess): string {
  if (t.role !== 'ALUNO' || !t.studentLinkId) throw forbidden('Disponível apenas para alunos.');
  return t.studentLinkId;
}

/** Paginação por cursor (id UUID v7 ordenável). */
export function page<T extends { id: string }>(items: T[], limit: number) {
  const more = items.length > limit;
  return { items: items.slice(0, limit), nextCursor: more ? items[limit - 1]!.id : null };
}
