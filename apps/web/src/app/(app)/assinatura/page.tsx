'use client';

import { FEATURE_CATALOG, UNLIMITED } from '@vetta/contracts';
import { useEntitlements } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PlanBadge,
  Skeleton,
  Switch,
} from '@vetta/ui';
import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import { fmtDate, useApi } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Plan {
  code: 'FREE' | 'PRO' | 'PRO_PLUS';
  name: string;
  description: string | null;
  prices: { cycle: string; amountCents: number }[];
  features: Record<string, boolean | number>;
}

const brl = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtValue = (v: boolean | number | undefined, unit?: string) =>
  v === undefined || v === false || v === 0 ? (
    <Minus className="mx-auto size-4 text-muted-foreground" aria-label="não incluso" />
  ) : v === true ? (
    <Check className="mx-auto size-4 text-success" aria-label="incluso" />
  ) : v === UNLIMITED ? (
    'Ilimitado'
  ) : (
    `${v.toLocaleString('pt-BR')} ${unit ?? ''}`
  );

/** Minha assinatura: plano atual, uso dos limites e comparação (dados da API). */
export default function SubscriptionPage() {
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const plans = useApi<Plan[]>('/v1/plans');
  const [annual, setAnnual] = useState(false);
  if (!ent.data || !plans.data) return <Skeleton className="h-96" />;
  const visible = FEATURE_CATALOG.filter(
    (f) => f.key !== 'core.auth' && f.key !== 'finance.split_fee_bps',
  );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Minha assinatura</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Plano atual <PlanBadge plan={ent.data.plan.code} />
            {ent.data.plan.status === 'TRIALING' ? (
              <Badge variant="accent">teste grátis até {fmtDate(ent.data.plan.trialEndsAt)}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {Object.entries(ent.data.limits).map(([k, l]) => (
            <div key={k} className="rounded-control bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                {FEATURE_CATALOG.find((f) => f.key === k)?.name ?? k}
              </p>
              <p className="font-display text-xl tabular-nums">
                {l.used} / {l.max === UNLIMITED ? '∞' : l.max}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Cobrança anual" />{' '}
        <span>Anual (economize ~17%)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th className="p-3 text-left">Recurso</th>
              {plans.data.map((p) => {
                const price =
                  p.prices.find((x) => x.cycle === (annual ? 'ANNUAL' : 'MONTHLY')) ?? p.prices[0];
                return (
                  <th key={p.code} className="p-3 text-center">
                    <PlanBadge plan={p.code} />
                    <p className="mt-2 font-display text-lg">
                      {price && price.amountCents
                        ? `${brl(annual && price.cycle === 'ANNUAL' ? price.amountCents / 12 : price.amountCents)}/mês`
                        : 'Grátis'}
                    </p>
                    {ent.data!.plan.code === p.code ? (
                      <Badge variant="outline">atual</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="action"
                        className="mt-2"
                        onClick={() =>
                          alert(
                            'O checkout da assinatura chega com o módulo financeiro (Fase 2). Fale com o suporte para mudar de plano.',
                          )
                        }
                      >
                        Escolher
                      </Button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.key} className="border-t border-border">
                <td className="p-3">{f.name}</td>
                {plans.data.map((p) => (
                  <td key={p.code} className="p-3 text-center tabular-nums">
                    {fmtValue(p.features[f.key], 'unit' in f ? f.unit : undefined)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
