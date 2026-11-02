'use client';

import { CYCLE_LABEL, FEATURE_CATALOG, UNLIMITED, type BillingCycle } from '@vetta/contracts';
import { useEntitlements, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
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
  Switch,
  toast,
} from '@vetta/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  CardForm,
  InvoiceStatus,
  PayLinks,
  PixBox,
  type CardData,
} from '@/components/pro/payments';
import { brl, errorMessage, fmtDate, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Plan {
  code: 'FREE' | 'PRO' | 'PRO_PLUS';
  name: string;
  description: string | null;
  prices: { cycle: BillingCycle; amountCents: number }[];
  features: Record<string, boolean | number>;
}

interface Invoice {
  id: string;
  status: string;
  description: string | null;
  totalCents: number;
  discountCents: number;
  creditCents: number;
  dueDate: string;
  paidAt: string | null;
  method: string | null;
  boletoUrl: string | null;
  invoiceUrl: string | null;
  pix: { copyPaste: string; qrCode: string | null } | null;
  fiscal: { status: string; number: string | null; pdfUrl: string | null } | null;
}

interface Subscription {
  status: string;
  plan: { code: Plan['code']; name: string };
  cycle: BillingCycle;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingChange: { plan: { name: string }; effectiveAt: string } | null;
  graceEndsAt: string | null;
  card: { brand: string; last4: string } | null;
  openInvoice: Invoice | null;
  invoices: Invoice[];
  paymentsEnabled: boolean;
}

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

const mb = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(1).replace('.', ',')} GB` : `${v} MB`);

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

function Checkout({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const client = useVettaClient();
  const qc = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [method, setMethod] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [billing, setBilling] = useState({
    name: '',
    cpfCnpj: '',
    email: '',
    postalCode: '',
    addressNumber: '',
  });
  const [card, setCard] = useState<CardData | null>(null);
  const [quote, setQuote] = useState<{
    kind: string;
    amountCents: number;
    discountCents: number;
    creditCents: number;
    chargeNowCents: number;
    effectiveAt: string;
  } | null>(null);
  const [result, setResult] = useState<{
    kind: string;
    effectiveAt: string;
    invoice: Invoice | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const cycles = CYCLES.filter((c) => plan.prices.some((p) => p.cycle === c));

  useEffect(() => {
    void client
      .request<NonNullable<typeof quote>>('POST', '/v1/subscription/quote', {
        planCode: plan.code,
        cycle,
        code: applied,
      })
      .then(setQuote)
      .catch((err) => {
        setQuote(null);
        toast.error(errorMessage(err));
        if (applied) setApplied('');
      });
  }, [client, plan.code, cycle, applied]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await client.request<NonNullable<typeof result>>(
        'POST',
        '/v1/subscription/checkout',
        {
          planCode: plan.code,
          cycle,
          method,
          ...(applied ? { couponCode: applied } : {}),
          billing: {
            name: billing.name,
            cpfCnpj: billing.cpfCnpj,
            email: billing.email,
            ...(billing.postalCode ? { postalCode: billing.postalCode } : {}),
            ...(billing.addressNumber ? { addressNumber: billing.addressNumber } : {}),
          },
          ...(method === 'CREDIT_CARD' && card ? card : {}),
        },
      );
      setResult(r);
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        {result.kind === 'DOWNGRADE' ? (
          <p>
            A troca para o {plan.name} fica agendada para {fmtDate(result.effectiveAt)}. Até lá,
            você continua com o plano atual.
          </p>
        ) : result.invoice?.status === 'PAID' ? (
          <p className="font-semibold text-success">
            Pagamento aprovado. O {plan.name} já está ativo.
          </p>
        ) : result.invoice ? (
          <>
            <p>
              Falta só o pagamento de {brl(result.invoice.totalCents)}. O plano ativa assim que ele
              for confirmado.
            </p>
            {result.invoice.pix ? <PixBox pix={result.invoice.pix} /> : null}
            <PayLinks boletoUrl={result.invoice.boletoUrl} invoiceUrl={result.invoice.invoiceUrl} />
          </>
        ) : null}
        <Button onClick={onClose}>Fechar</Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ciclo">
          <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
            <SelectTrigger aria-label="Ciclo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c} value={c}>
                  {CYCLE_LABEL[c]} · {brl(plan.prices.find((p) => p.cycle === c)!.amountCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Forma de pagamento">
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger aria-label="Forma de pagamento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PIX">Pix</SelectItem>
              <SelectItem value="BOLETO">Boleto</SelectItem>
              <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex items-end gap-2">
        <Field label="Cupom" className="flex-1">
          <Input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder="Opcional"
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setApplied(coupon.trim())}
          disabled={!coupon.trim()}
        >
          Aplicar
        </Button>
      </div>
      {quote ? (
        <div className="rounded-control bg-muted p-3 text-sm">
          <p className="flex justify-between">
            <span>
              {plan.name} ({CYCLE_LABEL[cycle].toLowerCase()})
            </span>{' '}
            <span>{brl(quote.amountCents)}</span>
          </p>
          {quote.discountCents ? (
            <p className="flex justify-between text-success">
              <span>Cupom {applied}</span> <span>− {brl(quote.discountCents)}</span>
            </p>
          ) : null}
          {quote.kind === 'UPGRADE' && quote.creditCents ? (
            <p className="flex justify-between text-success">
              <span>Crédito do plano atual (pró-rata)</span>{' '}
              <span>
                − {brl(Math.min(quote.creditCents, quote.amountCents - quote.discountCents))}
              </span>
            </p>
          ) : null}
          {quote.kind === 'DOWNGRADE' ? (
            <p className="mt-1 text-muted-foreground">
              Troca agendada para {fmtDate(quote.effectiveAt)}, sem cobrança agora.
            </p>
          ) : (
            <p className="mt-1 flex justify-between font-display text-lg">
              <span>Total agora</span> <span>{brl(quote.chargeNowCents)}</span>
            </p>
          )}
        </div>
      ) : null}
      {quote?.kind !== 'DOWNGRADE' ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Dados para a nota fiscal</legend>
          <Field label="Nome ou razão social">
            <Input
              required
              value={billing.name}
              onChange={(e) => setBilling({ ...billing, name: e.target.value })}
            />
          </Field>
          <Field label="CPF ou CNPJ">
            <Input
              required
              inputMode="numeric"
              value={billing.cpfCnpj}
              onChange={(e) => setBilling({ ...billing, cpfCnpj: e.target.value })}
            />
          </Field>
          <Field label="E-mail de cobrança">
            <Input
              required
              type="email"
              value={billing.email}
              onChange={(e) => setBilling({ ...billing, email: e.target.value })}
            />
          </Field>
          <Field label="CEP">
            <Input
              inputMode="numeric"
              value={billing.postalCode}
              onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })}
            />
          </Field>
        </fieldset>
      ) : null}
      {method === 'CREDIT_CARD' && quote?.kind !== 'DOWNGRADE' ? (
        <CardForm
          onChange={setCard}
          defaults={{ name: billing.name, email: billing.email, cpfCnpj: billing.cpfCnpj }}
        />
      ) : null}
      <Button type="submit" variant="action" loading={busy} disabled={!quote}>
        {quote?.kind === 'DOWNGRADE' ? 'Agendar troca' : 'Assinar agora'}
      </Button>
    </form>
  );
}

/** Minha assinatura: plano atual, faturas (com NFS-e), checkout de upgrade e cancelamento. */
export default function SubscriptionPage() {
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const plans = useApi<Plan[]>('/v1/plans');
  const sub = useApi<Subscription>('/v1/subscription');
  const [annual, setAnnual] = useState(false);
  const [checkout, setCheckout] = useState<Plan | null>(null);
  const cancel = useApiMutation('POST', '/v1/subscription/cancel', {
    invalidate: ['/v1/subscription'],
    success: 'Assinatura cancelada ao fim do período.',
  });
  const resume = useApiMutation('POST', '/v1/subscription/resume', {
    invalidate: ['/v1/subscription'],
    success: 'Cancelamento desfeito.',
  });
  if (!ent.data || !plans.data || !sub.data) return <Skeleton className="h-96" />;
  const s = sub.data;
  const visible = FEATURE_CATALOG.filter(
    (f) => f.key !== 'core.auth' && f.key !== 'finance.split_fee_bps',
  );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Minha assinatura</h1>
      {s.status === 'PAST_DUE' ? (
        <div role="alert" className="rounded-card border border-danger bg-danger/10 p-4">
          Sua fatura está em atraso. Pague até {fmtDate(s.graceEndsAt)} para não voltar ao Free.
          Nenhum dado será apagado.
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Plano atual <PlanBadge plan={s.plan.code} />
            {s.status === 'TRIALING' ? (
              <Badge variant="accent">teste grátis até {fmtDate(ent.data.plan.trialEndsAt)}</Badge>
            ) : null}
            {s.cancelAtPeriodEnd ? (
              <Badge variant="warning">cancela em {fmtDate(s.currentPeriodEnd)}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(ent.data.limits).map(([k, l]) => (
              <div key={k} className="rounded-control bg-muted p-3">
                <p className="text-sm text-muted-foreground">
                  {FEATURE_CATALOG.find((f) => f.key === k)?.name ?? k}
                </p>
                <p className="font-display text-xl tabular-nums">
                  {k === 'storage.quota_mb'
                    ? `${mb(l.used)} / ${l.max === UNLIMITED ? '∞' : mb(l.max)}`
                    : `${l.used} / ${l.max === UNLIMITED ? '∞' : l.max}`}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {s.plan.code !== 'FREE' && s.status !== 'TRIALING' ? (
              <span>
                Ciclo {CYCLE_LABEL[s.cycle].toLowerCase()} · renova em {fmtDate(s.currentPeriodEnd)}
              </span>
            ) : null}
            {s.card ? (
              <span>
                Cartão {s.card.brand} final {s.card.last4}
              </span>
            ) : null}
            {s.pendingChange ? (
              <span>
                Troca para {s.pendingChange.plan.name} em {fmtDate(s.pendingChange.effectiveAt)}
              </span>
            ) : null}
          </div>
          {s.openInvoice ? (
            <div className="flex flex-col gap-3 rounded-card border border-warning p-4">
              <p className="font-semibold">
                Fatura em aberto: {brl(s.openInvoice.totalCents)} · vence{' '}
                {fmtDate(s.openInvoice.dueDate)}
              </p>
              {s.openInvoice.pix ? <PixBox pix={s.openInvoice.pix} /> : null}
              <PayLinks boletoUrl={s.openInvoice.boletoUrl} invoiceUrl={s.openInvoice.invoiceUrl} />
            </div>
          ) : null}
          {s.plan.code !== 'FREE' && s.status !== 'TRIALING' ? (
            s.cancelAtPeriodEnd ? (
              <Button
                variant="secondary"
                className="self-start"
                loading={resume.isPending}
                onClick={() => resume.mutate(undefined)}
              >
                Desfazer cancelamento
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="self-start"
                loading={cancel.isPending}
                onClick={() => {
                  if (
                    confirm(
                      'Cancelar a assinatura? Você mantém o plano até o fim do período e nada é apagado.',
                    )
                  )
                    cancel.mutate(undefined);
                }}
              >
                Cancelar assinatura
              </Button>
            )
          ) : null}
          {!s.paymentsEnabled ? (
            <p className="text-sm text-muted-foreground">
              Pagamentos ainda não estão configurados neste ambiente.
            </p>
          ) : null}
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
                const current = s.plan.code === p.code && s.status !== 'TRIALING';
                return (
                  <th key={p.code} className="p-3 text-center">
                    <PlanBadge plan={p.code} />
                    <p className="mt-2 font-display text-lg">
                      {price && price.amountCents
                        ? `${brl(annual && price.cycle === 'ANNUAL' ? price.amountCents / 12 : price.amountCents)}/mês`
                        : 'Grátis'}
                    </p>
                    {current ? (
                      <Badge variant="outline">atual</Badge>
                    ) : p.code !== 'FREE' ? (
                      <Button
                        size="sm"
                        variant="action"
                        className="mt-2"
                        disabled={!s.paymentsEnabled}
                        onClick={() => setCheckout(p)}
                      >
                        Escolher
                      </Button>
                    ) : null}
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

      <Card>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          {s.invoices.length ? (
            <ul className="divide-y divide-border">
              {s.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="flex-1">{i.description ?? 'Assinatura Vetta'}</span>
                  <span className="tabular-nums">{brl(i.totalCents)}</span>
                  <span>{fmtDate(i.paidAt ?? i.dueDate)}</span>
                  <InvoiceStatus status={i.status} />
                  {i.fiscal?.pdfUrl ? (
                    <a
                      className="text-link underline"
                      href={i.fiscal.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      NFS-e {i.fiscal.number}
                    </a>
                  ) : i.status === 'PAID' ? (
                    <span className="text-muted-foreground">NFS-e em emissão</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nenhuma fatura ainda.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!checkout} onOpenChange={(o) => !o && setCheckout(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assinar o {checkout?.name}</DialogTitle>
            <DialogDescription>
              Pagamento processado pelo Asaas. Guardamos só o token, a bandeira e o final do cartão.
            </DialogDescription>
          </DialogHeader>
          {checkout ? <Checkout plan={checkout} onClose={() => setCheckout(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
