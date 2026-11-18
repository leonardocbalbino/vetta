'use client';

import { FEATURE_CATALOG, UNLIMITED } from '@vetta/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PlanBadge,
  cn,
} from '@vetta/ui';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { APP_URL, brl, type PublicPlan } from '@/lib/data';

/** Destaques por plano, derivados das features configuradas pelo admin. */
const HIGHLIGHT_KEYS = [
  'assessment.physical_per_student',
  'assessment.anamnesis_custom',
  'assessment.posture',
  'storage.quota_mb',
  'workouts.periodization',
  'comms.chat_media',
  'comms.broadcast',
  'schedule.calendar',
  'finance.student_billing',
  'brand.sales_page',
  'assessment.pdf_branding',
  'workouts.ai_assistant',
  'team.assistants',
  'brand.white_label',
  'brand.custom_domain',
  'comms.whatsapp',
  'schedule.google_calendar',
  'finance.advanced_reports',
  'support.priority',
];

/** Rótulo da feature com o valor do plano (limites viram texto). */
function label(key: string, v: number | boolean): string {
  const def = FEATURE_CATALOG.find((f) => f.key === key);
  if (key === 'students.max')
    return v === UNLIMITED ? 'Alunos ilimitados' : `Até ${String(v)} alunos`;
  if (key === 'assessment.physical_per_student')
    return v === UNLIMITED
      ? 'Avaliações físicas ilimitadas'
      : `${String(v)} avaliação física por aluno`;
  if (key === 'storage.quota_mb' && typeof v === 'number')
    return v === UNLIMITED
      ? 'Vídeos próprios ilimitados'
      : `${v >= 1024 ? `${v / 1024} GB` : `${v} MB`} para vídeos próprios`;
  if (key === 'team.assistants' && typeof v === 'number') return `Até ${v} assistentes`;
  return def?.name ?? key;
}

/** O que o plano tem de diferente do anterior (no máximo 8 itens no cartão). */
function increments(p: PublicPlan, prev: PublicPlan | undefined) {
  const out: string[] = [];
  for (const key of ['students.max', ...HIGHLIGHT_KEYS]) {
    const v = p.features[key];
    if (v === undefined || v === false || v === 0) continue;
    if (prev && prev.features[key] === v) continue;
    out.push(label(key, v));
  }
  return out.slice(0, 8);
}

export function Pricing({ plans }: { plans: PublicPlan[] }) {
  const hasAnnual = plans.some((p) => p.prices.ANNUAL);
  const [annual, setAnnual] = useState(false);
  return (
    <div className="flex flex-col items-center gap-8">
      {hasAnnual ? (
        <div
          role="radiogroup"
          aria-label="Ciclo de cobrança"
          className="flex rounded-control border border-border p-1"
        >
          {[
            { v: false, label: 'Mensal' },
            { v: true, label: 'Anual' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={annual === o.v}
              onClick={() => setAnnual(o.v)}
              className={cn(
                'min-h-11 rounded-control px-5 text-sm font-semibold',
                annual === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid w-full gap-4 md:grid-cols-3">
        {plans.map((p, idx) => {
          const prev = plans[idx - 1];
          const monthly = p.prices.MONTHLY ?? 0;
          const yearly = p.prices.ANNUAL;
          const showAnnual = annual && yearly !== undefined;
          const perMonth = showAnnual ? Math.round(yearly / 12) : monthly;
          const saving =
            showAnnual && monthly ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;
          return (
            <Card
              key={p.code}
              className={cn('flex flex-col', p.code === 'PRO' && 'border-2 border-action')}
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PlanBadge plan={p.code} />
                  {p.code === 'PRO' ? (
                    <span className="text-xs font-semibold text-action">Mais escolhido</span>
                  ) : null}
                </div>
                <CardTitle className="font-display text-3xl">
                  {perMonth ? (
                    <>
                      {brl(perMonth)}
                      <span className="text-base font-normal text-muted-foreground">/mês</span>
                    </>
                  ) : (
                    'Grátis'
                  )}
                </CardTitle>
                <CardDescription>
                  {showAnnual && yearly
                    ? `${brl(yearly)} por ano${saving > 0 ? ` · economize ${saving}%` : ''}`
                    : p.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                {prev ? <p className="text-sm font-semibold">Tudo do {prev.name}, mais:</p> : null}
                <ul className="flex flex-col gap-2 text-sm">
                  {increments(p, prev).map((b) => (
                    <li key={b} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-auto"
                  variant={p.code === 'PRO' ? 'action' : 'secondary'}
                >
                  <a href={`${APP_URL}/cadastro?plano=${p.code.toLowerCase()}`}>
                    {monthly ? 'Comece com 14 dias grátis' : 'Comece grátis'}
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <a
        href="#comparar"
        className="text-sm font-semibold text-action underline underline-offset-4"
      >
        Comparar todos os recursos
      </a>
      <p className="text-sm text-muted-foreground">
        Teste de 14 dias do Pro Plus sem cartão. Ao fim, você escolhe um plano ou segue no Free sem
        perder dados.
      </p>
    </div>
  );
}
