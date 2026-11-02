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
  ChevronDown,
} from 'lucide-react';
import { SupportWidget } from './support-widget';
import { UnreadBadge, useUnreadMessages } from './unread-messages';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
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
  /** Sem grupo = item principal, sempre visível. "rodape" = ícone no pé do menu. */
  group?: NavGroupId;
}

type NavGroupId = 'acompanhamento' | 'conteudo' | 'gestao' | 'mais' | 'rodape';
const GROUP_LABEL: Record<Exclude<NavGroupId, 'rodape'>, string> = {
  acompanhamento: 'Acompanhamento',
  conteudo: 'Conteúdo',
  gestao: 'Gestão',
  mais: 'Mais',
};

const PERSONAL_NAV: NavItem[] = [
  { href: '/inicio', label: 'Início', icon: Home },
  { href: '/alunos', label: 'Alunos', icon: Users },
  { href: '/treinos', label: 'Treinos', icon: Dumbbell },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, feature: 'schedule.calendar' },
  { href: '/mensagens', label: 'Mensagens', icon: MessageCircle },
  {
    href: '/financeiro',
    label: 'Financeiro',
    icon: Wallet,
    feature: 'finance.student_billing',
    ownerOnly: true,
  },
  { href: '/feedbacks', label: 'Feedbacks', icon: MessageSquareHeart, group: 'acompanhamento' },
  { href: '/avaliacoes', label: 'Avaliações', icon: Stethoscope, group: 'acompanhamento' },
  { href: '/modelos-anamnese', label: 'Anamneses', icon: ClipboardList, group: 'acompanhamento' },
  { href: '/biblioteca', label: 'Biblioteca', icon: BookOpen, group: 'conteudo' },
  {
    href: '/comunicados',
    label: 'Comunicados',
    icon: Megaphone,
    feature: 'comms.broadcast',
    group: 'conteudo',
  },
  {
    href: '/minha-pagina',
    label: 'Minha página',
    icon: Globe,
    feature: 'brand.sales_page',
    ownerOnly: true,
    group: 'conteudo',
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    feature: 'finance.advanced_reports',
    ownerOnly: true,
    group: 'gestao',
  },
  { href: '/equipe', label: 'Equipe', icon: UsersRound, ownerOnly: true, group: 'gestao' },
  {
    href: '/marca',
    label: 'Minha marca',
    icon: Palette,
    feature: 'brand.white_label',
    ownerOnly: true,
    group: 'gestao',
  },
  { href: '/integracoes', label: 'Integrações', icon: Plug, group: 'gestao' },
  { href: '/academy', label: 'Academy', icon: GraduationCap, group: 'rodape' },
  { href: '/suporte', label: 'Suporte', icon: LifeBuoy, group: 'rodape' },
  {
    href: '/configuracoes',
    label: 'Configurações',
    icon: Settings,
    ownerOnly: true,
    group: 'rodape',
  },
];

const STUDENT_NAV: NavItem[] = [
  { href: '/treino', label: 'Treino do dia', icon: Dumbbell },
  { href: '/evolucao', label: 'Evolução', icon: LineChart },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, feature: 'schedule.calendar' },
  { href: '/mensagens', label: 'Mensagens', icon: MessageCircle },
  { href: '/pagamentos', label: 'Pagamentos', icon: Wallet },
  { href: '/historico', label: 'Histórico', icon: History, group: 'mais' },
  {
    href: '/documentos',
    label: 'Documentos',
    icon: FileText,
    feature: 'docs.student_folder',
    group: 'mais',
  },
  { href: '/anamnese', label: 'Anamnese', icon: ClipboardList, group: 'mais' },
  { href: '/perfil', label: 'Perfil', icon: User, group: 'rodape' },
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

const OPEN_KEY = 'vetta:nav-open';
const isActive = (path: string, href: string) => path === href || path.startsWith(href + '/');

function NavLink({
  item,
  active,
  locked,
  badge,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  locked: boolean;
  badge?: number | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium',
        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
      )}
    >
      <item.icon className="size-5" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {badge ? <UnreadBadge count={badge} /> : null}
      {locked ? (
        <Lock className="size-4 opacity-70" aria-label="fora do plano" />
      ) : item.soon ? (
        <Badge variant="outline">em breve</Badge>
      ) : null}
    </Link>
  );
}

/**
 * Menu lateral: itens principais sempre visíveis, os demais em grupos recolhíveis (o grupo
 * da página atual abre sozinho; a escolha fica salva) e atalhos de conta no rodapé.
 */
function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const unread = useUnreadMessages();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>);
    } catch {
      // preferência inválida: começa recolhido
    }
  }, []);
  const toggle = (g: string) =>
    setOpen((o) => {
      const next = { ...o, [g]: !o[g] };
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      return next;
    });
  const locked = (i: NavItem) =>
    !!(i.feature && ent.data && ent.data.features[i.feature] === false);
  const link = (i: NavItem) => (
    <NavLink
      key={i.href}
      item={i}
      active={isActive(path, i.href)}
      locked={locked(i)}
      badge={i.href === '/mensagens' ? unread.total : undefined}
      onNavigate={onNavigate}
    />
  );
  const groups = (Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[])
    .map((g) => ({ id: g, items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length);
  const footer = items.filter((i) => i.group === 'rodape');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {items.filter((i) => !i.group).map(link)}
        {groups.map((g) => {
          const hasActive = g.items.some((i) => isActive(path, i.href));
          const expanded = hasActive || !!open[g.id];
          const panel = 'nav-' + g.id;
          return (
            <div key={g.id} className="mt-2 flex flex-col gap-1">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panel}
                onClick={() => toggle(g.id)}
                disabled={hasActive}
                className="flex min-h-9 items-center gap-2 rounded-control px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
              >
                <span className="flex-1 text-left">{GROUP_LABEL[g.id]}</span>
                <ChevronDown
                  className={cn('size-4 transition-transform', expanded && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {expanded ? (
                <div id={panel} className="flex flex-col gap-1">
                  {g.items.map(link)}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      {footer.length ? (
        <div className="flex items-center gap-1 border-t border-border pt-3">
          {footer.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={onNavigate}
              title={i.label}
              aria-label={i.label}
              aria-current={isActive(path, i.href) ? 'page' : undefined}
              className={cn(
                'flex size-11 items-center justify-center rounded-control',
                isActive(path, i.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <i.icon className="size-5" aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
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
