'use client';

import type { TenantRole } from '@vetta/contracts';
import { useMe } from '@vetta/sdk/react';
import { useActiveTenant } from './session';

/** Papel do usuário no vínculo ativo (PERSONAL, PERSONAL_ASSISTENTE ou ALUNO). */
export function useActiveRole(): TenantRole | null {
  const { tenantId } = useActiveTenant();
  const me = useMe();
  return me.data?.memberships.find((m) => m.tenantId === tenantId)?.role ?? null;
}
