'use client';

import { BillingCycle, FEATURE_CATALOG, UNLIMITED, type PlanCode } from '@vetta/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  PlanBadge,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@vetta/ui';
import { useEffect, useState } from 'react';
import { adminClient } from '@/lib/client';
import { fmtBRL, useAdminApi, useAdminMutation } from '@/lib/api';

interface Plan {
  code: PlanCode;
  name: string;
  description: string | null;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  prices: { cycle: BillingCycle; amountCents: number }[];
  features: Record<string, number | boolean>;
}
interface Impact {
  feature: string;
  current: number | boolean;
  next: number | boolean;
  tenantsOnPlan: number;
  affectedTenants: number;
  withOverride: number;
  loses: number;
  overLimit: { tenantId: string; name: string; used: number }[];
}

const CYCLE: Record<BillingCycle, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

function PlanCard({ p }: { p: Plan }) {
  const [f, setF] = useState(() => ({
    name: p.name,
    description: p.description ?? '',
    isPublic: p.isPublic,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    prices: Object.fromEntries(
      BillingCycle.map((c) => {
        const v = p.prices.find((x) => x.cycle === c);
        return [c, v ? (v.amountCents / 100).toFixed(2).replace('.', ',') : ''];
      }),
    ) as Record<BillingCycle, string>,
  }));
  const save = useAdminMutation<object>('PUT', `/v1/admin/plans/${p.code}`, {
    invalidate: ['/v1/admin/plans'],
    success: 'Plano salvo.',
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlanBadge plan={p.code} /> {p.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              name: f.name,
              description: f.description || null,
              isPublic: f.isPublic,
              isActive: f.isActive,
              sortOrder: f.sortOrder,
              prices: BillingCycle.filter((c) => f.prices[c] !== '').map((c) => ({
                cycle: c,
                amountCents: Math.round(
                  Number(f.prices[c].replace(/\./g, '').replace(',', '.')) * 100,
                ),
                isActive: true,
              })),
            });
          }}
        >
          <Field label="Nome">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Descrição">
            <Textarea
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {BillingCycle.map((c) => (
              <Field
                key={c}
                label={`${CYCLE[c]} (R$)`}
                hint={c === 'MONTHLY' ? undefined : 'Vazio = não oferecido'}
              >
                <Input
                  inputMode="decimal"
                  value={f.prices[c]}
                  onChange={(e) => setF({ ...f, prices: { ...f.prices, [c]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Switch checked={f.isPublic} onCheckedChange={(v) => setF({ ...f, isPublic: v })} />
            Visível no site
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
            Ativo para novas assinaturas
          </label>
          <Button type="submit" disabled={save.isPending}>
            Salvar plano
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type Changes = Record<PlanCode, Record<string, number | boolean>>;

/** Matriz plano × feature. Alterações passam por prévia de impacto antes de salvar. */
function Matrix({ plans }: { plans: Plan[] }) {
  const [changes, setChanges] = useState<Changes>({ FREE: {}, PRO: {}, PRO_PLUS: {} });
  const [review, setReview] = useState<{ plan: PlanCode; impacts: Impact[] }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const save = useAdminMutation<{ code: PlanCode; values: Record<string, number | boolean> }>(
    'PATCH',
    (b) => `/v1/admin/plans/${b.code}/features`,
    { invalidate: ['/v1/admin/plans'] },
  );
  const value = (p: Plan, key: string) =>
    changes[p.code][key] ??
    p.features[key] ??
    FEATURE_CATALOG.find((f) => f.key === key)!.defaultValue;
  const set = (code: PlanCode, key: string, v: number | boolean) =>
    setChanges((c) => ({ ...c, [code]: { ...c[code], [key]: v } }));
  const pending = Object.values(changes).reduce((n, c) => n + Object.keys(c).length, 0);
  const modules = [...new Set(FEATURE_CATALOG.map((f) => f.module))];

  const openReview = async () => {
    const out: { plan: PlanCode; impacts: Impact[] }[] = [];
    for (const [plan, vals] of Object.entries(changes) as [
      PlanCode,
      Record<string, number | boolean>,
    ][]) {
      const impacts = await Promise.all(
        Object.entries(vals).map(([feature, v]) =>
          adminClient.request<Impact>('GET', `/v1/admin/plans/${plan}/impact`, undefined, {
            feature,
            value: String(v),
          }),
        ),
      );
      if (impacts.length) out.push({ plan, impacts });
    }
    setReview(out);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button disabled={!pending} onClick={() => void openReview()}>
          Revisar {pending ? `${pending} alteração(ões)` : 'alterações'}
        </Button>
        {pending ? (
          <Button variant="ghost" onClick={() => setChanges({ FREE: {}, PRO: {}, PRO_PLUS: {} })}>
            Descartar
          </Button>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Feature</TableHead>
            {plans.map((p) => (
              <TableHead key={p.code}>
                <PlanBadge plan={p.code} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.flatMap((m) => [
            <TableRow key={m}>
              <TableCell colSpan={plans.length + 1} className="bg-muted font-semibold">
                {m}
              </TableCell>
            </TableRow>,
            ...FEATURE_CATALOG.filter((f) => f.module === m).map((f) => (
              <TableRow key={f.key}>
                <TableCell>
                  {f.name}
                  <span className="block text-xs text-muted-foreground">{f.key}</span>
                </TableCell>
                {plans.map((p) => {
                  const v = value(p, f.key);
                  const changed = f.key in changes[p.code];
                  return (
                    <TableCell key={p.code} className={changed ? 'bg-warning/15' : undefined}>
                      {f.type === 'BOOLEAN' ? (
                        <Checkbox
                          aria-label={`${f.name} no ${p.name}`}
                          checked={v === true}
                          onCheckedChange={(c) => set(p.code, f.key, c === true)}
                        />
                      ) : (
                        <Input
                          aria-label={`${f.name} no ${p.name}`}
                          type="number"
                          min={-1}
                          className="w-28"
                          value={String(v)}
                          onChange={(e) => set(p.code, f.key, Number(e.target.value))}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            )),
          ])}
        </TableBody>
      </Table>
      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prévia de impacto</DialogTitle>
            <DialogDescription>
              Downgrade nunca apaga dados: o que sai do plano fica somente leitura. Tenants com
              override não são afetados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {(review ?? []).flatMap((r) =>
              r.impacts.map((i) => (
                <div
                  key={r.plan + i.feature}
                  className="rounded-control border border-border p-3 text-sm"
                >
                  <strong>
                    {r.plan} · {i.feature}
                  </strong>
                  : {fmt(i.current)} → {fmt(i.next)}
                  <br />
                  {i.affectedTenants} de {i.tenantsOnPlan} personais afetados ({i.withOverride} com
                  override)
                  {i.loses ? (
                    <span className="text-danger"> · {i.loses} perdem o recurso</span>
                  ) : null}
                  {i.overLimit.length ? (
                    <span className="block text-danger">
                      Acima do novo limite:{' '}
                      {i.overLimit.map((o) => `${o.name} (${o.used})`).join(', ')}
                    </span>
                  ) : null}
                </div>
              )),
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                for (const [code, values] of Object.entries(changes) as [
                  PlanCode,
                  Changes[PlanCode],
                ][]) {
                  if (Object.keys(values).length) await save.mutateAsync({ code, values });
                }
                setSaving(false);
                setChanges({ FREE: {}, PRO: {}, PRO_PLUS: {} });
                setReview(null);
              }}
            >
              Confirmar e aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const fmt = (v: number | boolean) =>
  typeof v === 'boolean'
    ? v
      ? 'liberado'
      : 'bloqueado'
    : v === UNLIMITED
      ? 'ilimitado'
      : String(v);

export default function Planos() {
  const plans = useAdminApi<Plan[]>('/v1/admin/plans');
  const [key, setKey] = useState(0);
  useEffect(() => setKey((k) => k + 1), [plans.dataUpdatedAt]);
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Planos</h1>
      {!plans.data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Preços e dados</TabsTrigger>
            <TabsTrigger value="matriz">Matriz de features</TabsTrigger>
          </TabsList>
          <TabsContent value="dados">
            <div className="grid gap-4 lg:grid-cols-3" key={key}>
              {plans.data.map((p) => (
                <PlanCard key={p.code} p={p} />
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Preço mensal atual:{' '}
              {plans.data
                .map(
                  (p) =>
                    `${p.name} ${fmtBRL(p.prices.find((x) => x.cycle === 'MONTHLY')?.amountCents ?? 0)}`,
                )
                .join(' · ')}
            </p>
          </TabsContent>
          <TabsContent value="matriz">
            <Matrix plans={plans.data} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
