'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  Logo,
  PlanBadge,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vetta/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { adminClient } from '@/lib/client';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  owner: { name: string; email: string };
  subscription: {
    status: string;
    trialEndsAt: string | null;
    plan: { code: 'FREE' | 'PRO' | 'PRO_PLUS' };
  } | null;
  _count: { studentLinks: number };
}

export default function Painel() {
  const router = useRouter();
  const tenants = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () =>
      adminClient.request<{ items: TenantRow[]; nextCursor: string | null }>(
        'GET',
        '/v1/admin/tenants',
        undefined,
        { limit: 50 },
      ),
  });

  useEffect(() => {
    if (tenants.isError) router.replace('/entrar');
  }, [tenants.isError, router]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Button
          variant="ghost"
          onClick={async () => {
            await adminClient.auth.logout();
            router.replace('/entrar');
          }}
        >
          Sair
        </Button>
      </header>
      <h1 className="font-display text-3xl font-extrabold">Personais</h1>
      {tenants.isLoading ? (
        <Skeleton className="h-64" />
      ) : !tenants.data?.items.length ? (
        <EmptyState title="Nenhum personal ainda" description="Os cadastros aparecem aqui." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Negócio</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Alunos</TableHead>
              <TableHead>Desde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.data.items.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  {t.owner.name}
                  <span className="block text-sm text-muted-foreground">{t.owner.email}</span>
                </TableCell>
                <TableCell>
                  {t.subscription ? <PlanBadge plan={t.subscription.plan.code} /> : '—'}
                  {t.subscription?.status === 'TRIALING' ? (
                    <span className="ml-2 text-sm text-muted-foreground">teste</span>
                  ) : null}
                </TableCell>
                <TableCell>{t._count.studentLinks}</TableCell>
                <TableCell>
                  {new Date(t.createdAt).toLocaleDateString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
