'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  PlanBadge,
  Skeleton,
  cn,
} from '@vetta/ui';
import { useMe } from '@vetta/sdk/react';
import {
  ArrowRight,
  Cake,
  CalendarPlus,
  CheckCircle2,
  Dumbbell,
  Moon,
  Sparkles,
  Stethoscope,
  UserPlus,
} from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { UnreadMessagesAlert } from '@/components/unread-messages';
import { useApi, fmtDate } from '@/lib/api';

interface Dashboard {
  activeStudents: number;
  workoutsToday: number;
  pendingFeedbacks: number;
  alerts: {
    inactive: { id: string; name: string; whatsapp: string | null; lastWorkoutAt: string | null }[];
    inactivityDays: number;
    birthdays: { id: string; name: string; inDays: number }[];
    reassessments: {
      assessmentId: string;
      date: string;
      student: { id: string; displayName: string };
    }[];
  };
  plan: {
    code: 'FREE' | 'PRO' | 'PRO_PLUS';
    name: string;
    status: string;
    trialEndsAt: string | null;
  };
  limits: Record<string, { used: number; max: number }>;
  onboarding: { profile: boolean; firstStudent: boolean; firstWorkout: boolean };
}

const STEPS = [
  { key: 'profile', label: 'Complete seu perfil (CREF e apresentação)', href: '/configuracoes' },
  { key: 'firstStudent', label: 'Cadastre seu primeiro aluno', href: '/alunos?convidar=1' },
  { key: 'firstWorkout', label: 'Crie o primeiro treino', href: '/treinos/novo' },
] as const;

const wa = (phone: string, name: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi, ${name.split(' ')[0]}! Senti sua falta nos treinos. Bora voltar essa semana?`)}`;

export default function PersonalHome() {
  const d = useApi<Dashboard>('/v1/dashboard');
  const me = useMe();
  if (!d.data) return <Skeleton className="h-96" />;
  const { alerts, onboarding, limits, plan } = d.data;
  const done = STEPS.filter((s) => onboarding[s.key]).length;
  const students = limits['students.max'];
  const storage = limits['storage.quota_mb'];
  const firstName = me.data?.name.split(' ')[0];
  const attention = alerts.inactive.length + alerts.birthdays.length + alerts.reassessments.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm capitalize text-muted-foreground">{today()}</p>
        <h1 className="font-display text-2xl">{firstName ? `Olá, ${firstName}` : 'Olá!'}</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <Button key={a.href} variant={a.primary ? 'action' : 'secondary'} asChild>
            <Link href={a.href}>
              <a.icon aria-hidden /> {a.label}
            </Link>
          </Button>
        ))}
      </div>

      <UnreadMessagesAlert />

      {done < STEPS.length ? (
        <Card className="border-action">
          <CardHeader>
            <CardTitle>Primeiros passos ({done}/3)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {STEPS.map((s) => (
                <li key={s.key} className="flex items-center gap-3">
                  <Checkbox checked={onboarding[s.key]} disabled aria-label={s.label} />
                  {onboarding[s.key] ? (
                    <span className="text-muted-foreground line-through">{s.label}</span>
                  ) : (
                    <Link href={s.href} className="text-link hover:underline">
                      {s.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi href="/alunos" label="Alunos ativos" value={d.data.activeStudents} />
        <Kpi href="/feedbacks" label="Treinos feitos hoje" value={d.data.workoutsToday} />
        <Kpi
          href="/feedbacks?pendentes=1"
          label="Feedbacks para responder"
          value={d.data.pendingFeedbacks}
          highlight={d.data.pendingFeedbacks > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Precisa de atenção
              {attention ? <Badge variant="warning">{attention}</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!attention ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" aria-hidden /> Tudo em dia: ninguém
                sumido, sem aniversários nem reavaliações nos próximos 7 dias.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {alerts.inactive.map((s) => (
                  <Row
                    key={`i-${s.id}`}
                    icon={<Moon className="size-4" aria-hidden />}
                    href={`/alunos/${s.id}`}
                    name={s.name}
                    detail={
                      s.lastWorkoutAt
                        ? `sem treinar desde ${fmtDate(s.lastWorkoutAt)}`
                        : 'ainda não treinou'
                    }
                    action={
                      s.whatsapp ? (
                        <Button size="sm" variant="secondary" asChild>
                          <a href={wa(s.whatsapp, s.name)} target="_blank" rel="noreferrer">
                            WhatsApp
                          </a>
                        </Button>
                      ) : null
                    }
                  />
                ))}
                {alerts.birthdays.map((b) => (
                  <Row
                    key={`b-${b.id}`}
                    icon={<Cake className="size-4" aria-hidden />}
                    href={`/alunos/${b.id}`}
                    name={b.name}
                    detail={
                      b.inDays === 0 ? 'faz aniversário hoje 🎉' : `aniversário em ${b.inDays} dias`
                    }
                  />
                ))}
                {alerts.reassessments.map((r) => (
                  <Row
                    key={`r-${r.assessmentId}`}
                    icon={<Stethoscope className="size-4" aria-hidden />}
                    href={`/alunos/${r.student.id}?aba=assessments`}
                    name={r.student.displayName}
                    detail={`reavaliação em ${fmtDate(r.date)}`}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Seu plano <PlanBadge plan={plan.code} />
              {plan.status === 'TRIALING' ? (
                <Badge variant="accent">teste até {fmtDate(plan.trialEndsAt)}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {students ? <UsageBar label="Alunos" used={students.used} max={students.max} /> : null}
            {storage ? (
              <UsageBar label="Armazenamento (MB)" used={storage.used} max={storage.max} />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const ACTIONS = [
  { href: '/alunos?convidar=1', label: 'Convidar aluno', icon: UserPlus, primary: true },
  { href: '/treinos/novo', label: 'Novo treino', icon: Dumbbell },
  { href: '/treinos/ia', label: 'Gerar com IA', icon: Sparkles },
  { href: '/agenda', label: 'Nova aula', icon: CalendarPlus },
];

const today = () =>
  new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  });

function Kpi({
  href,
  label,
  value,
  highlight,
}: {
  href: string;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-2 rounded-card border bg-surface p-5 transition-colors hover:border-action',
        highlight ? 'border-action' : 'border-border',
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-end justify-between">
        <span className="font-display text-4xl tabular-nums leading-none">{value}</span>
        <ArrowRight
          className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </span>
    </Link>
  );
}

function Row({
  icon,
  href,
  name,
  detail,
  action,
}: {
  icon: ReactNode;
  href: string;
  name: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <Link href={href} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </Link>
      {action}
    </li>
  );
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used} / {unlimited ? 'ilimitado' : max}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={
            pct >= 100 ? 'h-full bg-danger' : pct >= 80 ? 'h-full bg-warning' : 'h-full bg-action'
          }
          style={{ width: `${unlimited ? 4 : pct}%` }}
        />
      </div>
      {pct >= 80 ? (
        <Link href="/assinatura" className="text-sm text-link hover:underline">
          Faça upgrade para continuar crescendo
        </Link>
      ) : null}
    </div>
  );
}
