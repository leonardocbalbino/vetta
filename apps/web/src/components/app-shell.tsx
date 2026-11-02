'use client';

import type { MeResponse, NotificationDto, PublicBrand } from '@vetta/contracts';
import { useEntitlements, useVettaClient } from '@vetta/sdk/react';
import {
  Avatar,
  Badge,
  Button,
  cn,
  Logo,
  PlanBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@vetta/ui';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Globe,
  Home,
  LineChart,
  Lock,
  Menu,
  MessageCircle,
  MessageSquareHeart,
  Settings,
  Stethoscope,
  User,
  Users,
  Wallet,
  History,
  Megaphone,
  FileText,
  BarChart3,
  GraduationCap,
  LifeBuoy,
  Palette,
  Plug,
  UsersRound,
} from 'lucide-react';
import { SupportWidget } from './support-widget';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useApi, useApiMutation, fmtDateTime } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  feature?: string;
  soon?: boolean;
  /** Assistente não vê (financeiro, marca, configurações). */
  ownerOnly?: boolean;
}

const PERSONAL_NAV: NavItem[] = [
  { href: '/inicio', label: 'Início', icon: Home },
  { href: '/alunos', label: 'Alunos', icon: Users },
  { href: '/treinos', label: 'Treinos', icon: Dumbbell },
  { href: '/biblioteca', label: 'Biblioteca', icon: BookOpen },
  { href: '/avaliacoes', label: 'Avaliações', icon: Stethoscope },
  { href: '/modelos-anamnese', label: 'Anamneses', icon: ClipboardList },
  { href: '/feedbacks', label: 'Feedbacks', icon: MessageSquareHeart },
  { href: '/mensagens', label: 'Mensagens', icon: MessageCircle },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone, feature: 'comms.broadcast' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, feature: 'schedule.calendar' },
  {
    href: '/financeiro',
    label: 'Financeiro',
    icon: Wallet,
    feature: 'finance.student_billing',
    ownerOnly: true,
  },
  {
    href: '/minha-pagina',
    label: 'Minha página',
    icon: Globe,
    feature: 'brand.sales_page',
    ownerOnly: true,
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    feature: 'finance.advanced_reports',
    ownerOnly: true,
  },
  { href: '/equipe', label: 'Equipe', icon: UsersRound, ownerOnly: true },
  {
    href: '/marca',
    label: 'Minha marca',
    icon: Palette,
    feature: 'brand.white_label',
    ownerOnly: true,
  },
  { href: '/integracoes', label: 'Integrações', icon: Plug },
  { href: '/academy', label: 'Academy', icon: GraduationCap },
  { href: '/suporte', label: 'Suporte', icon: LifeBuoy },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, ownerOnly: true },
];

const STUDENT_NAV: NavItem[] = [
  { href: '/treino', label: 'Treino do dia', icon: Dumbbell },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/evolucao', label: 'Evolução', icon: LineChart },
  { href: '/mensagens', label: 'Mensagens', icon: MessageCircle },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, feature: 'schedule.calendar' },
  { href: '/pagamentos', label: 'Pagamentos', icon: Wallet },
  { href: '/documentos', label: 'Documentos', icon: FileText, feature: 'docs.student_folder' },
  { href: '/anamnese', label: 'Anamnese', icon: ClipboardList },
  { href: '/perfil', label: 'Perfil', icon: User },
];

function NotificationBell() {
  const client = useVettaClient();
  const unread = useApi<{ count: number }>('/v1/notifications/unread-count');
  const list = useApi<{ items: NotificationDto[] }>('/v1/notifications');
  const readAll = useApiMutation('POST', '/v1/notifications/read-all', {
    invalidate: ['/v1/notifications'],
  });
  const router = useRouter();
  const count = unread.data?.count ?? 0;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notificações${count ? `: ${count} não lidas` : ''}`}
          className="relative"
        >
          <Bell />
          {count ? (
            <span className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-danger-foreground">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <div className="flex items-center justify-between pr-12">
          <SheetTitle>Notificações</SheetTitle>
          {count ? (
            <Button variant="link" size="sm" onClick={() => readAll.mutate(undefined)}>
              Marcar todas
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-2">
          {(list.data?.items ?? []).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn(
                  'w-full rounded-control border border-border p-3 text-left hover:bg-muted',
                  !n.readAt && 'border-action',
                )}
                onClick={async () => {
                  await client.notifications.read(n.id);
                  void unread.refetch();
                  if (n.deepLink) router.push(n.deepLink);
                }}
              >
                <p className="font-semibold">
                  {n.title}
                  {n.groupCount > 1 ? (
                    <span className="ml-2 text-sm text-muted-foreground">({n.groupCount})</span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
              </button>
            </li>
          ))}
          {!list.data?.items.length ? (
            <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
          ) : null}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {items.map((i) => {
        const active = path === i.href || path.startsWith(`${i.href}/`);
        const locked = i.feature && ent.data && ent.data.features[i.feature] === false;
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium',
              active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
            )}
          >
            <i.icon className="size-5" aria-hidden />
            <span className="flex-1">{i.label}</span>
            {locked ? (
              <Lock className="size-4 opacity-70" aria-label="fora do plano" />
            ) : i.soon ? (
              <Badge variant="outline">em breve</Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Tema do personal (white label) do vínculo ativo: variáveis CSS injetadas em tempo de
 * execução. Cada vínculo busca o próprio tema; trocar de vínculo troca o tema.
 */
function useBrand(tenantId: string | null) {
  return useApi<PublicBrand>(tenantId ? '/v1/brand/active' : null);
}

export function AppShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const client = useVettaClient();
  const router = useRouter();
  const { tenantId, setTenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const [open, setOpen] = useState(false);
  const active = me.memberships.find((m) => m.tenantId === tenantId);
  const staff = active && active.role !== 'ALUNO';
  const items = staff
    ? PERSONAL_NAV.filter((i) => !i.ownerOnly || active?.role === 'PERSONAL')
    : STUDENT_NAV;
  const brand = useBrand(tenantId);
  const wl = brand.data?.whiteLabel ? brand.data : null;

  const sidebar = (
    <div className="flex h-full flex-col gap-6">
      <Link href={staff ? '/inicio' : '/treino'} className="px-2">
        {wl ? (
          wl.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wl.logoUrl} alt={wl.displayName} className="h-8 max-w-48 object-contain" />
          ) : (
            <span className="font-display text-xl">{wl.displayName}</span>
          )
        ) : (
          <Logo />
        )}
      </Link>
      <Nav items={items} onNavigate={() => setOpen(false)} />
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {wl?.css ? <style data-brand={wl.tenantId}>{wl.css}</style> : null}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-surface p-4 lg:block">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {me.impersonatedBy ? (
          <div
            role="alert"
            className="bg-warning px-4 py-2 text-center text-sm font-semibold text-warning-foreground"
          >
            Você está vendo esta conta como suporte Vetta. Toda ação é registrada.
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>
          {me.memberships.length > 1 ? (
            <Select value={tenantId ?? undefined} onValueChange={(v) => setTenantId(v)}>
              <SelectTrigger className="h-11 w-auto max-w-64" aria-label="Trocar vínculo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {me.memberships.map((m) => (
                  <SelectItem key={m.tenantId} value={m.tenantId}>
                    {m.tenantName} ·{' '}
                    {m.role === 'ALUNO'
                      ? 'Aluno'
                      : m.role === 'PERSONAL'
                        ? 'Personal'
                        : 'Assistente'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="truncate text-sm font-semibold">{active?.tenantName}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {staff && ent.data ? (
              <Link href="/assinatura" aria-label={`Plano ${ent.data.plan.name}`}>
                <PlanBadge plan={ent.data.plan.code} />
              </Link>
            ) : null}
            <NotificationBell />
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" className="rounded-full" aria-label="Menu da conta">
                  <Avatar name={me.name} src={me.avatarUrl} />
                </button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetTitle>{me.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{me.email}</p>
                <div className="flex flex-col gap-2">
                  <Button variant="secondary" asChild>
                    <Link href={staff ? '/configuracoes' : '/perfil'}>Minha conta</Link>
                  </Button>
                  {staff ? (
                    <Button variant="secondary" asChild>
                      <Link href="/assinatura">Minha assinatura</Link>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const dark = document.documentElement.classList.toggle('dark');
                      localStorage.setItem('theme', dark ? 'dark' : 'light');
                    }}
                  >
                    Alternar tema claro/escuro
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await client.auth.logout();
                      router.replace('/entrar');
                    }}
                  >
                    Sair
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          {active?.role === 'ALUNO' ? <StudentGate>{children}</StudentGate> : children}
        </main>
        {wl ? (
          <footer className="px-4 pb-4 text-center text-xs text-muted-foreground">
            feito com Vetta
          </footer>
        ) : null}
        {staff ? <SupportWidget /> : null}
      </div>
    </div>
  );
}

/**
 * Aluno com acesso pausado por inadimplência: a API responde 402 PAYMENT_OVERDUE em tudo,
 * exceto pagamentos. Mostra a explicação com o botão de pagar em vez da tela pedida.
 */
function StudentGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const fin = useApi<{ blocked: boolean }>('/v1/me/finance');
  if (!fin.data?.blocked || path.startsWith('/pagamentos') || path.startsWith('/mensagens'))
    return <>{children}</>;
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-start gap-4 rounded-card border border-danger p-6"
    >
      <h1 className="font-display text-2xl">Seu acesso está pausado</h1>
      <p>
        Existe uma cobrança em aberto com seu personal. Assim que o pagamento for confirmado, seus
        treinos voltam na hora.
      </p>
      <Button variant="accent" asChild>
        <Link href="/pagamentos">Ver e pagar</Link>
      </Button>
      <Button variant="link" asChild>
        <Link href="/mensagens">Falar com o personal</Link>
      </Button>
    </div>
  );
}

/** Página de módulo de fase futura: aparece com cadeado/“em breve”. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border p-8">
      <Badge variant="outline">Em breve</Badge>
      <h1 className="font-display text-2xl">{title}</h1>
      <p className="max-w-xl text-muted-foreground">{description}</p>
    </div>
  );
}
