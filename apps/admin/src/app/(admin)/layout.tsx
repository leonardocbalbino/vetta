'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Logo, Skeleton, cn } from '@vetta/ui';
import { BookOpen, Gauge, Layers, ScrollText, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { adminClient } from '@/lib/client';

const NAV = [
  { href: '/painel', label: 'Painel', icon: Gauge },
  { href: '/personais', label: 'Personais', icon: Users },
  { href: '/planos', label: 'Planos', icon: Layers },
  { href: '/biblioteca', label: 'Biblioteca global', icon: BookOpen },
  { href: '/auditoria', label: 'Auditoria', icon: ScrollText },
];

/** Shell do painel: exige sessão de admin (com 2FA) e mostra a navegação lateral. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminClient.request<{ id: string; role: string }>('GET', '/v1/admin/auth/me'),
    retry: false,
  });
  useEffect(() => {
    if (me.isError) router.replace('/entrar');
  }, [me.isError, router]);

  if (!me.data) return <Skeleton className="m-6 h-64" />;
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4">
        <Logo />
        <nav aria-label="Navegação do painel" className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium hover:bg-muted',
                  active && 'bg-muted font-semibold',
                )}
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 text-sm text-muted-foreground">
          <span>{me.data.role === 'SUPER_ADMIN' ? 'Super admin' : 'Operador'}</span>
          <Button
            variant="ghost"
            onClick={async () => {
              await adminClient.auth.logout().catch(() => undefined);
              router.replace('/entrar');
            }}
          >
            Sair
          </Button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
  );
}
