'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  PlanBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatTile,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetta/ui';
import Link from 'next/link';
import { useState } from 'react';
import { fmtBRL, fmtDate, fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface Metrics {
  mrrCents: number;
  arrCents: number;
  payingSubscribers: number;
  trialing: number;
  pastDue: number;
  revenue30dCents: number;
  churnRate30d: number;
  churned30d: number;
  arpuCents: number;
  ltvCents: number | null;
  failedPayments30d: number;
  refunds30d: { count: number; cents: number };
  fiscalPending: number;
  byPlan: {
    code: 'FREE' | 'PRO' | 'PRO_PLUS';
    plan: string;
    subscribers: number;
    mrrCents: number;
    revenue30dCents: number;
  }[];
}
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
interface Sub {
  id: string;
  status: string;
  cycle: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: { code: 'FREE' | 'PRO' | 'PRO_PLUS'; name: string };
  tenant: { id: string; name: string };
  pendingPlan: { name: string } | null;
  graceEndsAt: string | null;
}
interface Inv {
  id: string;
  status: string;
  amountCents: number;
  discountCents: number;
  creditCents: number;
  dueDate: string;
  paidAt: string | null;
  failureReason: string | null;
  failedAt: string | null;
  refundedCents: number;
  method: string | null;
  gatewayInvoiceId: string | null;
  tenant: { id: string; name: string };
  plan: { name: string } | null;
  fiscalInvoice: { status: string; number: string | null } | null;
}
interface Run {
  id: string;
  date: string;
  status: string;
  checked: number;
  fixed: number;
  mismatches: {
    kind: string;
    gatewayId: string;
    ours: string | null;
    theirs: string;
    action: string;
  }[];
  error: string | null;
  finishedAt: string | null;
}
interface Fiscal {
  id: string;
  status: string;
  number: string | null;
  amountCents: number;
  error: string | null;
  attempts: number;
  issuedAt: string | null;
  tenant: { name: string };
}
interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  percentOff: number | null;
  amountOffCents: number | null;
  durationCycles: number | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  planCodes: string[];
  validUntil: string | null;
  isActive: boolean;
}

const SUB_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }
> = {
  ACTIVE: { label: 'ativa', variant: 'success' },
  TRIALING: { label: 'teste', variant: 'warning' },
  PAST_DUE: { label: 'em atraso', variant: 'danger' },
  CANCELED: { label: 'cancelada', variant: 'outline' },
};
const INV_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }
> = {
  PENDING: { label: 'em aberto', variant: 'warning' },
  PAID: { label: 'paga', variant: 'success' },
  OVERDUE: { label: 'vencida', variant: 'danger' },
  CANCELED: { label: 'cancelada', variant: 'outline' },
  REFUNDED: { label: 'estornada', variant: 'outline' },
};

function MetricsTab() {
  const m = useAdminApi<Metrics>('/v1/admin/finance/metrics');
  if (!m.data) return <Skeleton className="h-64" />;
  const d = m.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="MRR"
          value={fmtBRL(d.mrrCents)}
          hint={`${d.payingSubscribers} assinantes pagantes`}
        />
        <StatTile label="ARR" value={fmtBRL(d.arrCents)} />
        <StatTile
          label="Churn (30 dias)"
          value={`${d.churnRate30d.toLocaleString('pt-BR')}%`}
          hint={`${d.churned30d} voltaram ao Free`}
        />
        <StatTile
          label="LTV"
          value={d.ltvCents === null ? '—' : fmtBRL(d.ltvCents)}
          hint={d.ltvCents === null ? 'sem churn observado' : `ARPU ${fmtBRL(d.arpuCents)}`}
        />
        <StatTile label="Receita (30 dias)" value={fmtBRL(d.revenue30dCents)} />
        <StatTile label="Em atraso" value={d.pastDue} hint={`${d.trialing} em teste`} />
        <StatTile label="Falhas de pagamento (30 dias)" value={d.failedPayments30d} />
        <StatTile
          label="Estornos (30 dias)"
          value={fmtBRL(d.refunds30d.cents)}
          hint={`${d.refunds30d.count} estornos · ${d.fiscalPending} NFS-e pendentes`}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Receita por plano</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">Plano</th>
                <th className="p-2 text-right">Assinantes</th>
                <th className="p-2 text-right">MRR</th>
                <th className="p-2 text-right">Receita 30 dias</th>
              </tr>
            </thead>
            <tbody>
              {d.byPlan.map((p) => (
                <tr key={p.code} className="border-t border-border">
                  <td className="p-2">
                    <PlanBadge plan={p.code} />
                  </td>
                  <td className="p-2 text-right tabular-nums">{p.subscribers}</td>
                  <td className="p-2 text-right tabular-nums">{fmtBRL(p.mrrCents)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtBRL(p.revenue30dCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionsTab() {
  const [status, setStatus] = useState('ALL');
  const [cursor, setCursor] = useState<string | undefined>();
  const list = useAdminApi<Page<Sub>>('/v1/admin/finance/subscriptions', {
    status: status === 'ALL' ? undefined : status,
    cursor,
  });
  return (
    <div className="flex flex-col gap-3">
      <Select
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          setCursor(undefined);
        }}
      >
        <SelectTrigger className="w-48" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas</SelectItem>
          {Object.entries(SUB_STATUS).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!list.data ? (
        <Skeleton className="h-48" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2">Personal</th>
              <th className="p-2">Plano</th>
              <th className="p-2">Situação</th>
              <th className="p-2">Renova</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-2">
                  <Link className="text-link underline" href={`/personais/${s.tenant.id}`}>
                    {s.tenant.name}
                  </Link>
                </td>
                <td className="p-2">
                  <PlanBadge plan={s.plan.code} />{' '}
                  {s.pendingPlan ? (
                    <span className="text-muted-foreground">→ {s.pendingPlan.name}</span>
                  ) : null}
                </td>
                <td className="p-2">
                  <Badge variant={SUB_STATUS[s.status]?.variant ?? 'outline'}>
                    {SUB_STATUS[s.status]?.label ?? s.status}
                  </Badge>
                  {s.cancelAtPeriodEnd ? (
                    <Badge variant="outline" className="ml-1">
                      cancela no fim
                    </Badge>
                  ) : null}
                  {s.graceEndsAt ? (
                    <span className="ml-1 text-danger">carência até {fmtDate(s.graceEndsAt)}</span>
                  ) : null}
                </td>
                <td className="p-2">{fmtDate(s.currentPeriodEnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.data?.nextCursor ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setCursor(list.data!.nextCursor!)}
        >
          Próxima página
        </Button>
      ) : null}
    </div>
  );
}

function InvoicesTab() {
  const [status, setStatus] = useState('ALL');
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [refund, setRefund] = useState<Inv | null>(null);
  const [form, setForm] = useState({ amount: '', reason: '' });
  const list = useAdminApi<Page<Inv>>('/v1/admin/finance/invoices', {
    status: status === 'ALL' ? undefined : status,
    failed: failed ? 'true' : undefined,
    cursor,
  });
  const doRefund = useAdminMutation<object>(
    'POST',
    `/v1/admin/finance/invoices/${refund?.id}/refund`,
    {
      invalidate: ['/v1/admin/finance'],
      success: 'Estorno solicitado ao gateway.',
      onSuccess: () => setRefund(null),
    },
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setCursor(undefined);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {Object.entries(INV_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex min-h-11 items-center gap-2">
          <Switch
            checked={failed}
            onCheckedChange={(v) => {
              setFailed(v);
              setCursor(undefined);
            }}
          />{' '}
          Só com falha de pagamento
        </label>
      </div>
      {!list.data ? (
        <Skeleton className="h-48" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2">Personal</th>
              <th className="p-2">Plano</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2">Vencimento</th>
              <th className="p-2">Situação</th>
              <th className="p-2">NFS-e</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="p-2">
                  <Link className="text-link underline" href={`/personais/${i.tenant.id}`}>
                    {i.tenant.name}
                  </Link>
                </td>
                <td className="p-2">{i.plan?.name ?? '—'}</td>
                <td className="p-2 text-right tabular-nums">
                  {fmtBRL(i.amountCents - i.discountCents - i.creditCents)}
                </td>
                <td className="p-2">{fmtDate(i.dueDate)}</td>
                <td className="p-2">
                  <Badge variant={INV_STATUS[i.status]?.variant ?? 'outline'}>
                    {INV_STATUS[i.status]?.label ?? i.status}
                  </Badge>
                  {i.failureReason ? (
                    <p className="text-xs text-danger">{i.failureReason}</p>
                  ) : null}
                </td>
                <td className="p-2">
                  {i.fiscalInvoice
                    ? `${i.fiscalInvoice.status === 'ISSUED' ? `nº ${i.fiscalInvoice.number}` : i.fiscalInvoice.status.toLowerCase()}`
                    : '—'}
                </td>
                <td className="p-2">
                  {i.status === 'PAID' && i.gatewayInvoiceId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefund(i);
                        setForm({ amount: '', reason: '' });
                      }}
                    >
                      Estornar
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.data?.nextCursor ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setCursor(list.data!.nextCursor!)}
        >
          Próxima página
        </Button>
      ) : null}
      <Dialog open={!!refund} onOpenChange={(o) => !o && setRefund(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar fatura de {refund?.tenant.name}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              doRefund.mutate({
                reason: form.reason,
                ...(form.amount
                  ? { amountCents: Math.round(Number(form.amount.replace(',', '.')) * 100) }
                  : {}),
              });
            }}
          >
            <Field label="Valor (vazio = total)">
              <Input
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Motivo (fica no histórico)">
              <Input
                required
                minLength={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </Field>
            <Button type="submit" variant="destructive" loading={doRefund.isPending}>
              Confirmar estorno
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReconciliationTab() {
  const runs = useAdminApi<Run[]>('/v1/admin/finance/reconciliation');
  const [date, setDate] = useState('');
  const run = useAdminMutation<object>('POST', '/v1/admin/finance/reconciliation', {
    invalidate: ['/v1/admin/finance/reconciliation'],
    success: 'Conciliação concluída.',
  });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Roda sozinha todo dia (cobranças de ontem no gateway x nossas faturas). Diferenças que o
        gateway confirma são corrigidas; o resto fica para revisão.
      </p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate(date ? { date } : {});
        }}
      >
        <Field label="Dia (vazio = ontem)">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={run.isPending}>
          Conciliar agora
        </Button>
      </form>
      {!runs.data ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.data.map((r) => (
            <li key={r.id} className="rounded-control border border-border p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {fmtDate(r.date)}{' '}
                <Badge
                  variant={
                    r.status === 'DONE' ? 'success' : r.status === 'FAILED' ? 'danger' : 'warning'
                  }
                >
                  {r.status === 'DONE' ? 'concluída' : r.status === 'FAILED' ? 'falhou' : 'rodando'}
                </Badge>
                <span className="font-normal text-muted-foreground">
                  {r.checked} cobranças · {r.fixed} corrigidas · {r.mismatches.length - r.fixed}{' '}
                  para revisar
                </span>
              </p>
              {r.error ? <p className="text-danger">{r.error}</p> : null}
              {r.mismatches
                .filter((x) => x.action !== 'fixed')
                .map((x) => (
                  <p key={x.gatewayId} className="text-muted-foreground">
                    {x.gatewayId}: nosso {x.ours ?? 'ausente'} × gateway {x.theirs} (
                    {x.kind === 'missing_local' ? 'sem fatura local' : 'status'})
                  </p>
                ))}
            </li>
          ))}
          {!runs.data.length ? (
            <li className="text-muted-foreground">Nenhuma execução ainda.</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function FiscalTab() {
  const [status, setStatus] = useState('ALL');
  const list = useAdminApi<Fiscal[]>('/v1/admin/finance/fiscal-invoices', {
    status: status === 'ALL' ? undefined : status,
  });
  const retry = useAdminMutation<string>(
    'POST',
    (id) => `/v1/admin/finance/fiscal-invoices/${id}/retry`,
    { invalidate: ['/v1/admin/finance/fiscal-invoices'], success: 'Nova tentativa agendada.' },
  );
  return (
    <div className="flex flex-col gap-3">
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-56" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas</SelectItem>
          <SelectItem value="PENDING_CONFIG">Aguardando configuração</SelectItem>
          <SelectItem value="PENDING">Pendentes</SelectItem>
          <SelectItem value="PROCESSING">Processando</SelectItem>
          <SelectItem value="ISSUED">Emitidas</SelectItem>
          <SelectItem value="FAILED">Com falha</SelectItem>
        </SelectContent>
      </Select>
      {list.data?.some((f) => f.status === 'PENDING_CONFIG') ? (
        <p role="alert" className="rounded-control border border-warning p-3 text-sm">
          O emissor de NFS-e não está configurado (NFEIO_API_KEY e NFEIO_COMPANY_ID). As notas ficam
          na fila e saem quando configurar.
        </p>
      ) : null}
      {!list.data ? (
        <Skeleton className="h-32" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2">Personal</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2">Situação</th>
              <th className="p-2">Número</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {list.data.map((f) => (
              <tr key={f.id} className="border-t border-border">
                <td className="p-2">{f.tenant.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtBRL(f.amountCents)}</td>
                <td className="p-2">
                  {f.status.toLowerCase()}
                  {f.error ? <p className="text-xs text-danger">{f.error}</p> : null}
                </td>
                <td className="p-2">
                  {f.number ?? '—'}
                  {f.issuedAt ? ` · ${fmtDate(f.issuedAt)}` : ''}
                </td>
                <td className="p-2">
                  {f.status === 'FAILED' ? (
                    <Button size="sm" variant="ghost" onClick={() => retry.mutate(f.id)}>
                      Tentar de novo
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const emptyCoupon = {
  code: '',
  description: '',
  discountType: 'PERCENT' as Coupon['discountType'],
  value: '',
  durationCycles: '',
  maxRedemptions: '',
  planCodes: [] as string[],
  validUntil: '',
  isActive: true,
};

function CouponsTab() {
  const list = useAdminApi<Coupon[]>('/v1/admin/finance/coupons');
  const [edit, setEdit] = useState<Coupon | 'new' | null>(null);
  const [f, setF] = useState(emptyCoupon);
  const save = useAdminMutation<object>(
    edit && edit !== 'new' ? 'PATCH' : 'POST',
    edit && edit !== 'new' ? `/v1/admin/finance/coupons/${edit.id}` : '/v1/admin/finance/coupons',
    {
      invalidate: ['/v1/admin/finance/coupons'],
      success: 'Cupom salvo.',
      onSuccess: () => setEdit(null),
    },
  );
  const open = (c: Coupon | 'new') => {
    setEdit(c);
    setF(
      c === 'new'
        ? emptyCoupon
        : {
            code: c.code,
            description: c.description ?? '',
            discountType: c.discountType,
            value:
              c.discountType === 'PERCENT'
                ? String(c.percentOff ?? '')
                : ((c.amountOffCents ?? 0) / 100).toFixed(2),
            durationCycles: c.durationCycles ? String(c.durationCycles) : '',
            maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : '',
            planCodes: c.planCodes,
            validUntil: c.validUntil ? c.validUntil.slice(0, 10) : '',
            isActive: c.isActive,
          },
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <Button className="self-start" onClick={() => open('new')}>
        Novo cupom
      </Button>
      {!list.data ? (
        <Skeleton className="h-32" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2">Código</th>
              <th className="p-2">Desconto</th>
              <th className="p-2">Duração</th>
              <th className="p-2">Usos</th>
              <th className="p-2">Validade</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-2 font-mono">
                  {c.code} {!c.isActive ? <Badge variant="outline">inativo</Badge> : null}
                </td>
                <td className="p-2">
                  {c.discountType === 'PERCENT'
                    ? `${c.percentOff}%`
                    : fmtBRL(c.amountOffCents ?? 0)}
                  {c.planCodes.length ? ` · ${c.planCodes.join(', ')}` : ''}
                </td>
                <td className="p-2">
                  {c.durationCycles ? `${c.durationCycles} ciclo(s)` : 'sempre'}
                </td>
                <td className="p-2 tabular-nums">
                  {c.redemptionsCount}
                  {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}
                </td>
                <td className="p-2">{c.validUntil ? fmtDate(c.validUntil) : '—'}</td>
                <td className="p-2">
                  <Button size="sm" variant="ghost" onClick={() => open(c)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit === 'new' ? 'Novo cupom' : 'Editar cupom'}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({
                code: f.code,
                description: f.description || null,
                discountType: f.discountType,
                ...(f.discountType === 'PERCENT'
                  ? { percentOff: Number(f.value) }
                  : { amountOffCents: Math.round(Number(f.value.replace(',', '.')) * 100) }),
                durationCycles: f.durationCycles ? Number(f.durationCycles) : null,
                maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : null,
                planCodes: f.planCodes,
                validUntil: f.validUntil
                  ? new Date(`${f.validUntil}T23:59:59-03:00`).toISOString()
                  : null,
                isActive: f.isActive,
              });
            }}
          >
            <Field label="Código">
              <Input
                required
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={f.discountType}
                onValueChange={(v) => setF({ ...f, discountType: v as Coupon['discountType'] })}
              >
                <SelectTrigger aria-label="Tipo de desconto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percentual</SelectItem>
                  <SelectItem value="FIXED">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={f.discountType === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}>
              <Input
                required
                inputMode="decimal"
                value={f.value}
                onChange={(e) => setF({ ...f, value: e.target.value })}
              />
            </Field>
            <Field label="Duração (ciclos, vazio = sempre)">
              <Input
                type="number"
                min={1}
                value={f.durationCycles}
                onChange={(e) => setF({ ...f, durationCycles: e.target.value })}
              />
            </Field>
            <Field label="Máximo de usos">
              <Input
                type="number"
                min={1}
                value={f.maxRedemptions}
                onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })}
              />
            </Field>
            <Field label="Válido até">
              <Input
                type="date"
                value={f.validUntil}
                onChange={(e) => setF({ ...f, validUntil: e.target.value })}
              />
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Input
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </Field>
            <fieldset className="flex gap-4 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Planos (nenhum = todos)</legend>
              {['PRO', 'PRO_PLUS'].map((p) => (
                <label key={p} className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    checked={f.planCodes.includes(p)}
                    onCheckedChange={(c) =>
                      setF({
                        ...f,
                        planCodes: c ? [...f.planCodes, p] : f.planCodes.filter((x) => x !== p),
                      })
                    }
                  />{' '}
                  {p === 'PRO' ? 'Pro' : 'Pro Plus'}
                </label>
              ))}
            </fieldset>
            <label className="flex min-h-11 items-center gap-2">
              <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />{' '}
              Ativo
            </label>
            <Button type="submit" loading={save.isPending} className="sm:col-span-2">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Financeiro da plataforma: métricas, assinaturas, faturas (falhas e estornos), conciliação, NFS-e e cupons. */
export default function AdminFinance() {
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Financeiro</h1>
      <Tabs defaultValue="metricas">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
          <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
          <TabsTrigger value="faturas">Faturas</TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
          <TabsTrigger value="nfse">NFS-e</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
        </TabsList>
        <TabsContent value="metricas">
          <MetricsTab />
        </TabsContent>
        <TabsContent value="assinaturas">
          <SubscriptionsTab />
        </TabsContent>
        <TabsContent value="faturas">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="conciliacao">
          <ReconciliationTab />
        </TabsContent>
        <TabsContent value="nfse">
          <FiscalTab />
        </TabsContent>
        <TabsContent value="cupons">
          <CouponsTab />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Atualizado em {fmtDateTime(new Date().toISOString())}
      </p>
    </>
  );
}
