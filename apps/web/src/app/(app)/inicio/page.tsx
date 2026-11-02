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
  StatTile,
} from '@vetta/ui';
import { Cake, Moon, Stethoscope } from 'lucide-react';
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
  if (!d.data) return <Skeleton className="h-96" />;
  const { alerts, onboarding, limits, plan } = d.data;
  const done = STEPS.filter((s) => onboarding[s.key]).length;
  const students = limits['students.max'];
  const storage = limits['storage.quota_mb'];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Bom te ver por aqui!</h1>
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
        <StatTile label="Alunos ativos" value={d.data.activeStudents} />
        <StatTile label="Treinos feitos hoje" value={d.data.workoutsToday} />
        <Link href="/feedbacks?pendentes=1">
          <StatTile
            label="Feedbacks pendentes"
            value={d.data.pendingFeedbacks}
            hint="Toque para responder"
            className="hover:border-action"
          />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="size-5" aria-hidden /> Sem treinar há {alerts.inactivityDays}+ dias
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {alerts.inactive.length ? (
              alerts.inactive.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/alunos/${s.id}`} className="truncate hover:underline">
                    {s.name}
                  </Link>
                  {s.whatsapp ? (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={wa(s.whatsapp, s.name)} target="_blank" rel="noreferrer">
                        Chamar no WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {s.lastWorkoutAt ? fmtDate(s.lastWorkoutAt) : 'nunca treinou'}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Todo mundo em dia. 👏</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="size-5" aria-hidden /> Aniversários (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {alerts.birthdays.length ? (
              alerts.birthdays.map((b) => (
                <Link
                  key={b.id}
                  href={`/alunos/${b.id}`}
                  className="flex justify-between hover:underline"
                >
                  <span>{b.name}</span>
                  <Badge variant={b.inDays === 0 ? 'accent' : 'outline'}>
                    {b.inDays === 0 ? 'hoje' : `em ${b.inDays} dias`}
                  </Badge>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum aniversário na semana.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="size-5" aria-hidden /> Reavaliações (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {alerts.reassessments.length ? (
              alerts.reassessments.map((r) => (
                <Link
                  key={r.assessmentId}
                  href={`/alunos/${r.student.id}?aba=assessments`}
                  className="flex justify-between hover:underline"
                >
                  <span>{r.student.displayName}</span>
                  <span className="text-sm text-muted-foreground">{fmtDate(r.date)}</span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma reavaliação marcada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Uso do plano <PlanBadge plan={plan.code} />
            {plan.status === 'TRIALING' ? (
              <Badge variant="accent">teste até {fmtDate(plan.trialEndsAt)}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {students ? <UsageBar label="Alunos" used={students.used} max={students.max} /> : null}
          {storage ? (
            <UsageBar label="Armazenamento (MB)" used={storage.used} max={storage.max} />
          ) : null}
        </CardContent>
      </Card>
    </div>
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
