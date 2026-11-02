'use client';

import {
  CYCLE_LABEL,
  KYC_DOCUMENT_LABEL,
  KycDocumentType,
  PAYMENT_METHOD_LABEL,
  PAYMENT_MODE_LABEL,
  PaymentMethod,
  type BillingCycle,
} from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
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
  LockedFeature,
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
  Textarea,
  Uploader,
  toast,
} from '@vetta/ui';
import { Download } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { InvoiceStatus, PayLinks, PixBox } from '@/components/pro/payments';
import { brl, errorMessage, fmtDate, localDay, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';
import { env } from '@/env';

interface Summary {
  month: string;
  revenue: {
    grossCents: number;
    netCents: number;
    platformFeeCents: number;
    gatewayFeeCents: number;
    count: number;
  };
  receivable: { cents: number; count: number };
  overdue: { cents: number; count: number };
  balance: { availableCents: number; toReleaseCents: number; source: string };
  manual: { expensesCents: number; incomesCents: number };
  resultCents: number;
  account: { status: string };
}
interface ConsultingPlan {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  cycle: BillingCycle;
  paymentMode: 'ONE_TIME' | 'INSTALLMENTS' | 'RECURRING';
  maxInstallments: number;
  methods: (typeof PaymentMethod)[number][];
  toleranceDays: number | null;
  isActive: boolean;
  isPublic: boolean;
  benefits: string[];
  _count?: { subscriptions: number };
}
interface Invoice {
  id: string;
  studentName?: string;
  description: string;
  amountCents: number;
  netCents: number;
  platformFeeCents: number;
  status: string;
  method: string | null;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  boletoUrl: string | null;
  pix: { copyPaste: string; qrCode: string | null } | null;
}

const ACCOUNT_LABEL: Record<
  string,
  { label: string; variant: 'warning' | 'success' | 'danger' | 'outline' }
> = {
  NOT_STARTED: { label: 'Não ativada', variant: 'outline' },
  PENDING: { label: 'Pendente', variant: 'warning' },
  UNDER_REVIEW: { label: 'Em análise', variant: 'warning' },
  APPROVED: { label: 'Aprovada', variant: 'success' },
  REJECTED: { label: 'Recusada', variant: 'danger' },
};

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="month"
      aria-label="Mês"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-56"
    />
  );
}

function Overview({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const s = useApi<Summary>(`/v1/finance/summary?month=${month}`);
  if (!s.data) return <Skeleton className="h-48" />;
  const d = s.data;
  return (
    <div className="flex flex-col gap-4">
      <MonthPicker value={month} onChange={setMonth} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Receita do mês (líquida)"
          value={brl(d.revenue.netCents)}
          hint={`${d.revenue.count} pagamentos · bruto ${brl(d.revenue.grossCents)}`}
        />
        <StatTile
          label="A receber"
          value={brl(d.receivable.cents)}
          hint={`${d.receivable.count} cobranças em aberto`}
        />
        <StatTile
          label="Vencidas"
          value={brl(d.overdue.cents)}
          hint={`${d.overdue.count} cobranças`}
        />
        <StatTile
          label="Saldo disponível"
          value={brl(d.balance.availableCents)}
          hint={`${brl(d.balance.toReleaseCents)} a liberar`}
        />
      </div>
      <Card>
        <CardContent className="grid gap-2 pt-6 text-sm sm:grid-cols-2">
          <p className="flex justify-between">
            <span>Taxa da plataforma (split)</span>
            <span>{brl(d.revenue.platformFeeCents)}</span>
          </p>
          <p className="flex justify-between">
            <span>Taxa do gateway</span>
            <span>{brl(d.revenue.gatewayFeeCents)}</span>
          </p>
          <p className="flex justify-between">
            <span>Receitas avulsas</span>
            <span>{brl(d.manual.incomesCents)}</span>
          </p>
          <p className="flex justify-between">
            <span>Despesas</span>
            <span>− {brl(d.manual.expensesCents)}</span>
          </p>
          <p className="flex justify-between font-display text-lg sm:col-span-2">
            <span>Resultado do mês</span>
            <span>{brl(d.resultCents)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Invoices({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const [status, setStatus] = useState('ALL');
  const list = useApi<Invoice[]>(
    `/v1/finance/invoices?month=${month}${status !== 'ALL' ? `&status=${status}` : ''}`,
  );
  const [open, setOpen] = useState<string | null>(null);
  const detail = useApi<Invoice>(open ? `/v1/finance/invoices/${open}` : null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <MonthPicker value={month} onChange={setMonth} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="PENDING">Em aberto</SelectItem>
            <SelectItem value="PAID">Pagas</SelectItem>
            <SelectItem value="OVERDUE">Vencidas</SelectItem>
            <SelectItem value="REFUNDED">Estornadas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!list.data ? (
        <Skeleton className="h-40" />
      ) : list.data.length ? (
        <ul className="divide-y divide-border rounded-card border border-border">
          {list.data.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-wrap items-center gap-3 p-3 text-left text-sm hover:bg-muted"
                onClick={() => setOpen(i.id)}
              >
                <span className="flex-1">
                  <strong>{i.studentName}</strong> · {i.description}
                </span>
                <span>vence {fmtDate(i.dueDate)}</span>
                <span className="tabular-nums">{brl(i.amountCents)}</span>
                <InvoiceStatus status={i.status} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nenhuma cobrança neste mês.</p>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrança</DialogTitle>
          </DialogHeader>
          {detail.data ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>{detail.data.description}</p>
              <p className="flex justify-between">
                <span>Valor</span>
                <span>{brl(detail.data.amountCents)}</span>
              </p>
              {detail.data.status === 'PAID' ? (
                <>
                  <p className="flex justify-between">
                    <span>Taxa da plataforma</span>
                    <span>− {brl(detail.data.platformFeeCents)}</span>
                  </p>
                  <p className="flex justify-between font-semibold">
                    <span>Você recebe</span>
                    <span>{brl(detail.data.netCents)}</span>
                  </p>
                  <p>
                    Pago em {fmtDate(detail.data.paidAt)} (
                    {detail.data.method ? PAYMENT_METHOD_LABEL[detail.data.method as 'PIX'] : ''})
                  </p>
                </>
              ) : (
                <>
                  {detail.data.pix ? <PixBox pix={detail.data.pix} /> : null}
                  <PayLinks boletoUrl={detail.data.boletoUrl} invoiceUrl={detail.data.invoiceUrl} />
                </>
              )}
            </div>
          ) : (
            <Skeleton className="h-32" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const emptyPlan = {
  name: '',
  description: '',
  priceCents: 0,
  cycle: 'MONTHLY' as BillingCycle,
  paymentMode: 'RECURRING' as ConsultingPlan['paymentMode'],
  maxInstallments: 1,
  methods: ['PIX', 'CREDIT_CARD'] as ConsultingPlan['methods'],
  toleranceDays: null as number | null,
  isActive: true,
  isPublic: true,
  benefits: [] as string[],
};

function PlanForm({ initial, onDone }: { initial?: ConsultingPlan; onDone: () => void }) {
  const [p, setP] = useState({
    ...emptyPlan,
    ...(initial ?? {}),
    description: initial?.description ?? '',
  });
  const [price, setPrice] = useState(initial ? (initial.priceCents / 100).toFixed(2) : '');
  const save = useApiMutation<object>(
    initial ? 'PATCH' : 'POST',
    initial ? `/v1/finance/plans/${initial.id}` : '/v1/finance/plans',
    {
      invalidate: ['/v1/finance/plans'],
      success: 'Plano salvo.',
      onSuccess: onDone,
    },
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          name: p.name,
          description: p.description || null,
          priceCents: Math.round(Number(price.replace(',', '.')) * 100),
          cycle: p.cycle,
          paymentMode: p.paymentMode,
          maxInstallments: p.paymentMode === 'INSTALLMENTS' ? p.maxInstallments : 1,
          methods: p.methods,
          toleranceDays: p.toleranceDays,
          isActive: p.isActive,
          isPublic: p.isPublic,
          benefits: p.benefits.filter(Boolean),
        });
      }}
    >
      <Field label="Nome do plano" className="sm:col-span-2">
        <Input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <Textarea
          value={p.description}
          onChange={(e) => setP({ ...p, description: e.target.value })}
        />
      </Field>
      <Field label="Valor do período (R$)">
        <Input
          required
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>
      <Field label="Periodicidade">
        <Select value={p.cycle} onValueChange={(v) => setP({ ...p, cycle: v as BillingCycle })}>
          <SelectTrigger aria-label="Periodicidade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CYCLE_LABEL) as BillingCycle[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CYCLE_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Forma">
        <Select
          value={p.paymentMode}
          onValueChange={(v) =>
            setP({
              ...p,
              paymentMode: v as ConsultingPlan['paymentMode'],
              methods: v === 'INSTALLMENTS' ? ['CREDIT_CARD'] : p.methods,
            })
          }
        >
          <SelectTrigger aria-label="Forma">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PAYMENT_MODE_LABEL) as ConsultingPlan['paymentMode'][]).map((m) => (
              <SelectItem key={m} value={m}>
                {PAYMENT_MODE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {p.paymentMode === 'INSTALLMENTS' ? (
        <Field label="Máximo de parcelas">
          <Input
            type="number"
            min={2}
            max={12}
            value={p.maxInstallments}
            onChange={(e) => setP({ ...p, maxInstallments: Number(e.target.value) })}
          />
        </Field>
      ) : (
        <Field label="Tolerância de atraso (dias)" hint="Vazio usa a configuração geral">
          <Input
            type="number"
            min={0}
            max={60}
            value={p.toleranceDays ?? ''}
            onChange={(e) =>
              setP({ ...p, toleranceDays: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </Field>
      )}
      <fieldset className="flex flex-wrap gap-4 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Meios aceitos</legend>
        {PaymentMethod.map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-2">
            <Checkbox
              checked={p.methods.includes(m)}
              disabled={p.paymentMode === 'INSTALLMENTS' && m !== 'CREDIT_CARD'}
              onCheckedChange={(c) =>
                setP({ ...p, methods: c ? [...p.methods, m] : p.methods.filter((x) => x !== m) })
              }
            />
            {PAYMENT_METHOD_LABEL[m]}
          </label>
        ))}
      </fieldset>
      <Field label="Benefícios (um por linha)" className="sm:col-span-2">
        <Textarea
          value={p.benefits.join('\n')}
          onChange={(e) => setP({ ...p, benefits: e.target.value.split('\n') })}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-2">
        <Switch checked={p.isPublic} onCheckedChange={(v) => setP({ ...p, isPublic: v })} /> Mostrar
        na página de vendas
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <Switch checked={p.isActive} onCheckedChange={(v) => setP({ ...p, isActive: v })} /> Ativo
      </label>
      <Button type="submit" loading={save.isPending} className="sm:col-span-2">
        Salvar plano
      </Button>
    </form>
  );
}

function Plans() {
  const plans = useApi<ConsultingPlan[]>('/v1/finance/plans');
  const [edit, setEdit] = useState<ConsultingPlan | 'new' | null>(null);
  const del = useApiMutation<string>('DELETE', (id) => `/v1/finance/plans/${id}`, {
    invalidate: ['/v1/finance/plans'],
    success: 'Plano removido.',
  });
  return (
    <div className="flex flex-col gap-4">
      <Button className="self-start" onClick={() => setEdit('new')}>
        Novo plano
      </Button>
      <div className="grid gap-3 md:grid-cols-2">
        {(plans.data ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {p.name}
                {!p.isActive ? <Badge variant="outline">inativo</Badge> : null}
                {p.isPublic ? <Badge variant="action">na página</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="font-display text-2xl">
                {brl(p.priceCents)}{' '}
                <span className="text-sm text-muted-foreground">
                  / {CYCLE_LABEL[p.cycle].toLowerCase()}
                </span>
              </p>
              <p>
                {PAYMENT_MODE_LABEL[p.paymentMode]}
                {p.paymentMode === 'INSTALLMENTS' ? ` em até ${p.maxInstallments}x` : ''} ·{' '}
                {p.methods.map((m) => PAYMENT_METHOD_LABEL[m]).join(', ')}
              </p>
              <p className="text-muted-foreground">{p._count?.subscriptions ?? 0} alunos ativos</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    confirm('Remover o plano? Quem já comprou mantém a assinatura.') &&
                    del.mutate(p.id)
                  }
                >
                  Remover
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {edit === 'new' ? 'Novo plano de consultoria' : 'Editar plano'}
            </DialogTitle>
          </DialogHeader>
          {edit ? (
            <PlanForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Sell() {
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    '/v1/students?limit=100&status=ACTIVE',
  );
  const plans = useApi<ConsultingPlan[]>('/v1/finance/plans');
  const [f, setF] = useState({
    studentLinkId: '',
    consultingPlanId: '',
    method: 'PIX',
    installments: 1,
    cpfCnpj: '',
    blockOnOverdue: true,
  });
  const [result, setResult] = useState<{ invoices: Invoice[] } | null>(null);
  const sell = useApiMutation<object, { invoices: Invoice[] }>(
    'POST',
    '/v1/finance/subscriptions',
    {
      invalidate: ['/v1/finance'],
      success: 'Cobrança criada. O aluno foi avisado.',
      onSuccess: setResult,
    },
  );
  const plan = plans.data?.find((p) => p.id === f.consultingPlanId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vender plano a um aluno</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            sell.mutate({
              ...f,
              installments: plan?.paymentMode === 'INSTALLMENTS' ? f.installments : 1,
            });
          }}
        >
          <Field label="Aluno">
            <Select value={f.studentLinkId} onValueChange={(v) => setF({ ...f, studentLinkId: v })}>
              <SelectTrigger aria-label="Aluno">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {(students.data?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Plano">
            <Select
              value={f.consultingPlanId}
              onValueChange={(v) =>
                setF({
                  ...f,
                  consultingPlanId: v,
                  method: plans.data?.find((p) => p.id === v)?.methods[0] ?? 'PIX',
                })
              }
            >
              <SelectTrigger aria-label="Plano">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {(plans.data ?? [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {brl(p.priceCents)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Forma de pagamento">
            <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
              <SelectTrigger aria-label="Forma de pagamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(plan?.methods ?? PaymentMethod).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {plan?.paymentMode === 'INSTALLMENTS' ? (
            <Field label="Parcelas">
              <Input
                type="number"
                min={1}
                max={plan.maxInstallments}
                value={f.installments}
                onChange={(e) => setF({ ...f, installments: Number(e.target.value) })}
              />
            </Field>
          ) : null}
          <Field label="CPF do aluno">
            <Input
              required
              inputMode="numeric"
              value={f.cpfCnpj}
              onChange={(e) => setF({ ...f, cpfCnpj: e.target.value })}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2">
            <Switch
              checked={f.blockOnOverdue}
              onCheckedChange={(v) => setF({ ...f, blockOnOverdue: v })}
            />{' '}
            Pode bloquear se atrasar
          </label>
          <Button
            type="submit"
            loading={sell.isPending}
            disabled={!f.studentLinkId || !f.consultingPlanId}
            className="sm:col-span-2"
          >
            Gerar cobrança
          </Button>
        </form>
        {result?.invoices[0] ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="font-semibold">
              Primeira cobrança: {brl(result.invoices[0].amountCents)} · vence{' '}
              {fmtDate(result.invoices[0].dueDate)}
            </p>
            <PayLinks
              invoiceUrl={result.invoices[0].invoiceUrl}
              boletoUrl={result.invoices[0].boletoUrl}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface Account {
  status: string;
  account: null | {
    statusReason: string | null;
    pixKey: string | null;
    bankAccount: Record<string, string> | null;
    onboardingUrl: string | null;
    documents: { id: string; type: string; status: string; error: string | null }[];
  };
}

function Wallet() {
  const client = useVettaClient();
  const acc = useApi<Account>('/v1/finance/account');
  const summary = useApi<Summary>(`/v1/finance/summary`);
  const withdrawals = useApi<
    {
      id: string;
      amountCents: number;
      status: string;
      requestedAt: string;
      failureReason: string | null;
    }[]
  >('/v1/finance/withdrawals');
  const [kyc, setKyc] = useState({
    personType: 'CPF',
    name: '',
    email: '',
    cpfCnpj: '',
    birthDate: '',
    companyType: 'MEI',
    income: '',
    mobilePhone: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    postalCode: '',
    bankCode: '',
    agency: '',
    account: '',
    accountDigit: '',
    accountType: 'CONTA_CORRENTE',
    pixKey: '',
    pixKeyType: 'CPF',
  });
  const [docType, setDocType] = useState<(typeof KycDocumentType)[number]>('IDENTIFICATION');
  const [amount, setAmount] = useState('');
  const create = useApiMutation<object>('PUT', '/v1/finance/account', {
    invalidate: ['/v1/finance'],
    success: 'Dados enviados para análise.',
  });
  const addDoc = useApiMutation<object>('POST', '/v1/finance/account/documents', {
    invalidate: ['/v1/finance/account'],
    success: 'Documento enviado.',
  });
  const withdraw = useApiMutation<object>('POST', '/v1/finance/withdrawals', {
    invalidate: ['/v1/finance'],
    success: 'Saque solicitado.',
  });
  if (!acc.data) return <Skeleton className="h-48" />;
  const status = ACCOUNT_LABEL[acc.data.status] ?? ACCOUNT_LABEL.PENDING!;
  const set = (k: keyof typeof kyc) => (e: { target: { value: string } }) =>
    setKyc({ ...kyc, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Carteira de recebimentos <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {acc.data.account?.statusReason ? (
            <p className="text-danger">{acc.data.account.statusReason}</p>
          ) : null}
          {acc.data.account?.onboardingUrl ? (
            <a
              className="text-link underline"
              href={acc.data.account.onboardingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Completar o cadastro no gateway
            </a>
          ) : null}
          {acc.data.status === 'NOT_STARTED' ? (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate({
                  personType: kyc.personType,
                  name: kyc.name,
                  email: kyc.email,
                  cpfCnpj: kyc.cpfCnpj,
                  ...(kyc.birthDate ? { birthDate: kyc.birthDate } : {}),
                  ...(kyc.personType === 'CNPJ' ? { companyType: kyc.companyType } : {}),
                  incomeValueCents: Math.round(Number(kyc.income.replace(',', '.')) * 100),
                  mobilePhone: kyc.mobilePhone,
                  address: {
                    street: kyc.street,
                    number: kyc.number,
                    complement: kyc.complement || undefined,
                    district: kyc.district,
                    postalCode: kyc.postalCode,
                  },
                  bankAccount: {
                    bankCode: kyc.bankCode,
                    agency: kyc.agency,
                    account: kyc.account,
                    accountDigit: kyc.accountDigit,
                    accountType: kyc.accountType,
                    holderName: kyc.name,
                    holderDocument: kyc.cpfCnpj,
                  },
                  ...(kyc.pixKey ? { pixKey: kyc.pixKey, pixKeyType: kyc.pixKeyType } : {}),
                });
              }}
            >
              <Field label="Tipo">
                <Select
                  value={kyc.personType}
                  onValueChange={(v) => setKyc({ ...kyc, personType: v })}
                >
                  <SelectTrigger aria-label="Tipo de pessoa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">Pessoa física</SelectItem>
                    <SelectItem value="CNPJ">Pessoa jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nome completo ou razão social">
                <Input required value={kyc.name} onChange={set('name')} />
              </Field>
              <Field label="CPF ou CNPJ">
                <Input required inputMode="numeric" value={kyc.cpfCnpj} onChange={set('cpfCnpj')} />
              </Field>
              <Field label="E-mail">
                <Input required type="email" value={kyc.email} onChange={set('email')} />
              </Field>
              {kyc.personType === 'CPF' ? (
                <Field label="Data de nascimento">
                  <Input type="date" required value={kyc.birthDate} onChange={set('birthDate')} />
                </Field>
              ) : null}
              <Field label="Faturamento mensal estimado (R$)">
                <Input required inputMode="decimal" value={kyc.income} onChange={set('income')} />
              </Field>
              <Field label="Celular">
                <Input required type="tel" value={kyc.mobilePhone} onChange={set('mobilePhone')} />
              </Field>
              <Field label="CEP">
                <Input
                  required
                  inputMode="numeric"
                  value={kyc.postalCode}
                  onChange={set('postalCode')}
                />
              </Field>
              <Field label="Rua">
                <Input required value={kyc.street} onChange={set('street')} />
              </Field>
              <Field label="Número">
                <Input required value={kyc.number} onChange={set('number')} />
              </Field>
              <Field label="Bairro">
                <Input required value={kyc.district} onChange={set('district')} />
              </Field>
              <Field label="Complemento">
                <Input value={kyc.complement} onChange={set('complement')} />
              </Field>
              <Field label="Banco (código)">
                <Input
                  required
                  inputMode="numeric"
                  maxLength={3}
                  value={kyc.bankCode}
                  onChange={set('bankCode')}
                />
              </Field>
              <Field label="Agência">
                <Input required inputMode="numeric" value={kyc.agency} onChange={set('agency')} />
              </Field>
              <Field label="Conta">
                <Input required inputMode="numeric" value={kyc.account} onChange={set('account')} />
              </Field>
              <Field label="Dígito">
                <Input
                  required
                  maxLength={2}
                  value={kyc.accountDigit}
                  onChange={set('accountDigit')}
                />
              </Field>
              <Field label="Chave Pix para saques (opcional)">
                <Input value={kyc.pixKey} onChange={set('pixKey')} />
              </Field>
              <Field label="Tipo da chave">
                <Select
                  value={kyc.pixKeyType}
                  onValueChange={(v) => setKyc({ ...kyc, pixKeyType: v })}
                >
                  <SelectTrigger aria-label="Tipo da chave Pix">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === 'EVP' ? 'Aleatória' : t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button type="submit" loading={create.isPending} className="sm:col-span-2">
                Enviar para análise
              </Button>
            </form>
          ) : (
            <>
              <p>Documentos enviados:</p>
              <ul className="flex flex-col gap-1">
                {acc.data.account?.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    {KYC_DOCUMENT_LABEL[d.type as keyof typeof KYC_DOCUMENT_LABEL] ?? d.type}{' '}
                    <Badge
                      variant={
                        d.status === 'APPROVED'
                          ? 'success'
                          : d.status === 'REJECTED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {d.status === 'PENDING'
                        ? 'enviando'
                        : d.status === 'SENT'
                          ? 'em análise'
                          : d.status === 'APPROVED'
                            ? 'aprovado'
                            : 'recusado'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Tipo de documento" className="sm:w-72">
                  <Select value={docType} onValueChange={(v) => setDocType(v as typeof docType)}>
                    <SelectTrigger aria-label="Tipo de documento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KycDocumentType.map((t) => (
                        <SelectItem key={t} value={t}>
                          {KYC_DOCUMENT_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Uploader
                  accept="application/pdf,image/jpeg,image/png"
                  maxBytes={10 * 1024 * 1024}
                  label="Envie o documento (PDF, JPG ou PNG)"
                  upload={({ file, onProgress, signal }) =>
                    uploadFile(client, file, {
                      purpose: 'kyc_document',
                      signal,
                      onProgress: (p) => onProgress(p.ratio),
                    })
                  }
                  onUploaded={(mediaId) => addDoc.mutate({ mediaId, type: docType })}
                  className="flex-1"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {acc.data.status === 'APPROVED' ? (
        <Card>
          <CardHeader>
            <CardTitle>Saque</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>
              Disponível: <strong>{brl(summary.data?.balance.availableCents)}</strong> · a liberar{' '}
              {brl(summary.data?.balance.toReleaseCents)}
            </p>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                withdraw.mutate({
                  amountCents: Math.round(Number(amount.replace(',', '.')) * 100),
                });
              }}
            >
              <Field label="Valor (R$)">
                <Input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Button type="submit" loading={withdraw.isPending}>
                Sacar
              </Button>
            </form>
            <ul className="divide-y divide-border text-sm">
              {(withdrawals.data ?? []).map((w) => (
                <li key={w.id} className="flex justify-between py-2">
                  <span>{fmtDate(w.requestedAt)}</span>
                  <span>{brl(w.amountCents)}</span>
                  <Badge
                    variant={
                      w.status === 'DONE' ? 'success' : w.status === 'FAILED' ? 'danger' : 'warning'
                    }
                  >
                    {w.status === 'DONE'
                      ? 'concluído'
                      : w.status === 'FAILED'
                        ? 'falhou'
                        : 'processando'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Statement({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const client = useVettaClient();
  const { tenantId } = useActiveTenant();
  const st = useApi<{
    items: {
      id: string;
      source: string;
      type: string;
      description: string;
      amountCents: number;
      date: string;
    }[];
  }>(`/v1/finance/statement?month=${month}`);
  const [e, setE] = useState({
    kind: 'EXPENSE',
    description: '',
    category: '',
    amount: '',
    paidOn: localDay(),
  });
  const add = useApiMutation<object>('POST', '/v1/finance/entries', {
    invalidate: ['/v1/finance'],
    success: 'Lançamento salvo.',
  });
  const del = useApiMutation<string>('DELETE', (id) => `/v1/finance/entries/${id}`, {
    invalidate: ['/v1/finance'],
  });
  const download = async () => {
    try {
      const tokens = await Promise.resolve(client.tokens.get());
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/finance/report?month=${month}`, {
        headers: { Authorization: `Bearer ${tokens?.accessToken}`, 'X-Tenant-Id': tenantId ?? '' },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `vetta-financeiro-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <MonthPicker value={month} onChange={setMonth} />
        <Button variant="secondary" onClick={() => void download()}>
          <Download /> Relatório do mês (CSV)
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Despesa ou receita avulsa</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-5"
            onSubmit={(ev) => {
              ev.preventDefault();
              add.mutate({
                kind: e.kind,
                description: e.description,
                category: e.category,
                amountCents: Math.round(Number(e.amount.replace(',', '.')) * 100),
                paidOn: e.paidOn,
              });
              setE({ ...e, description: '', amount: '' });
            }}
          >
            <Field label="Tipo">
              <Select value={e.kind} onValueChange={(v) => setE({ ...e, kind: v })}>
                <SelectTrigger aria-label="Tipo de lançamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="INCOME">Receita</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição">
              <Input
                required
                value={e.description}
                onChange={(x) => setE({ ...e, description: x.target.value })}
              />
            </Field>
            <Field label="Categoria">
              <Input
                required
                value={e.category}
                onChange={(x) => setE({ ...e, category: x.target.value })}
              />
            </Field>
            <Field label="Valor (R$)">
              <Input
                required
                inputMode="decimal"
                value={e.amount}
                onChange={(x) => setE({ ...e, amount: x.target.value })}
              />
            </Field>
            <Field label="Data">
              <Input
                type="date"
                required
                value={e.paidOn}
                onChange={(x) => setE({ ...e, paidOn: x.target.value })}
              />
            </Field>
            <Button
              type="submit"
              loading={add.isPending}
              className="sm:col-span-5 sm:justify-self-start"
            >
              Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>
      {!st.data ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border text-sm">
          {st.data.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="w-24">{fmtDate(i.date)}</span>
              <span className="flex-1">{i.description}</span>
              <span
                className={
                  i.amountCents < 0 ? 'tabular-nums text-danger' : 'tabular-nums text-success'
                }
              >
                {brl(i.amountCents)}
              </span>
              {i.source === 'manual' ? (
                <Button size="sm" variant="ghost" onClick={() => del.mutate(i.id)}>
                  Excluir
                </Button>
              ) : null}
            </li>
          ))}
          {!st.data.items.length ? (
            <li className="p-3 text-muted-foreground">Sem lançamentos neste mês.</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function Settings() {
  const s = useApi<{ blockOverdueStudents: boolean; blockOverdueAfterDays: number }>(
    '/v1/finance/settings',
  );
  const save = useApiMutation<object>('PUT', '/v1/finance/settings', {
    invalidate: ['/v1/finance/settings'],
    success: 'Configuração salva.',
  });
  const [days, setDays] = useState<string | null>(null);
  if (!s.data) return <Skeleton className="h-24" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inadimplência</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center gap-2">
          <Switch
            checked={s.data.blockOverdueStudents}
            onCheckedChange={(v) =>
              save.mutate({
                blockOverdueStudents: v,
                blockOverdueAfterDays: s.data!.blockOverdueAfterDays,
              })
            }
          />
          Pausar o acesso do aluno com cobrança vencida
        </label>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              blockOverdueStudents: s.data!.blockOverdueStudents,
              blockOverdueAfterDays: Number(days ?? s.data!.blockOverdueAfterDays),
            });
          }}
        >
          <Field label="Depois de quantos dias de atraso">
            <Input
              type="number"
              min={1}
              max={90}
              value={days ?? s.data.blockOverdueAfterDays}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary" loading={save.isPending}>
            Salvar
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          O aluno vê uma tela explicando o motivo, com o botão para pagar. Assim que o pagamento é
          confirmado, o acesso volta na hora.
        </p>
      </CardContent>
    </Card>
  );
}

function FinancePage() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'finance.student_billing');
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('aba') ?? 'painel';
  const [month, setMonth] = useState(localDay().slice(0, 7));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Financeiro</h1>
      <LockedFeature
        locked={feature.locked}
        loading={feature.loading}
        title="Cobrança de alunos"
        requiredPlan="PRO"
        description="Receba por Pix, boleto e cartão com repasse automático para sua conta."
      >
        <Tabs value={tab} onValueChange={(v) => router.replace(`/financeiro?aba=${v}`)}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="cobrancas">Cobranças</TabsTrigger>
            <TabsTrigger value="planos">Planos</TabsTrigger>
            <TabsTrigger value="vender">Vender</TabsTrigger>
            <TabsTrigger value="carteira">Carteira</TabsTrigger>
            <TabsTrigger value="extrato">Extrato</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>
          <TabsContent value="painel">
            <Overview month={month} setMonth={setMonth} />
          </TabsContent>
          <TabsContent value="cobrancas">
            <Invoices month={month} setMonth={setMonth} />
          </TabsContent>
          <TabsContent value="planos">
            <Plans />
          </TabsContent>
          <TabsContent value="vender">
            <Sell />
          </TabsContent>
          <TabsContent value="carteira">
            <Wallet />
          </TabsContent>
          <TabsContent value="extrato">
            <Statement month={month} setMonth={setMonth} />
          </TabsContent>
          <TabsContent value="config">
            <Settings />
          </TabsContent>
        </Tabs>
      </LockedFeature>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <FinancePage />
    </Suspense>
  );
}
