'use client';

import { useMe } from '@vetta/sdk/react';
import { Skeleton } from '@vetta/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { useActiveTenant } from '@/lib/session';

const STUDENT_ROUTES = ['/treino', '/historico', '/evolucao', '/anamnese', '/perfil'];

/** Portão: exige login, escolhe o vínculo e manda cada perfil para a área certa. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const path = usePathname();
  const { tenantId, setTenantId } = useActiveTenant();

  useEffect(() => {
    if (me.isError) router.replace(`/entrar?voltar=${encodeURIComponent(path)}`);
  }, [me.isError, router, path]);

  useEffect(() => {
    const m = me.data?.memberships;
    if (!m?.length) return;
    if (!m.some((x) => x.tenantId === tenantId)) setTenantId(m[0]!.tenantId);
  }, [me.data, tenantId, setTenantId]);

  const active = me.data?.memberships.find((m) => m.tenantId === tenantId);
  useEffect(() => {
    if (!active) return;
    const studentArea = STUDENT_ROUTES.some((r) => path.startsWith(r));
    if (active.role === 'ALUNO' && !studentArea) router.replace('/treino');
    if (active.role !== 'ALUNO' && studentArea) router.replace('/inicio');
  }, [active, path, router]);

  if (!me.data || !active) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        {me.data && !me.data.memberships.length ? (
          <p className="text-muted-foreground">
            Sua conta ainda não tem vínculo com um personal. Abra o convite recebido por e-mail ou
            WhatsApp.
          </p>
        ) : null}
      </div>
    );
  }
  return <AppShell me={me.data}>{children}</AppShell>;
}
