'use client';

import { FEATURE_CATALOG, FEATURES_BY_KEY, UNLIMITED } from '@vetta/contracts';
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
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@vetta/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { WEB_URL, fmtBytes, fmtDate, fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface Detail {
  id: string;
  name: string;
  slug: string;
  status: string;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  owner: { id: string; name: string; email: string; lastLoginAt: string | null; createdAt: string };
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: { code: 'FREE' | 'PRO' | 'PRO_PLUS'; name: string };
  } | null;
  storageUsage: { bytesUsed: number } | null;
  featureOverrides: {
    id: string;
    featureKey: string;
    value: string;
    expiresAt: string | null;
    reason: string;
  }[];
  members: { id: string; role: string; user: { name: string; email: string } }[];
  students: Record<string, number>;
  programs: number;
  sessions30d: number;
  recentAccesses: {
    id: string;
    deviceName: string | null;
    platform: string;
    ip: string | null;
    lastUsedAt: string;
    impersonatorAdminId: string | null;
  }[];
}

const showValue = (key: string, raw: string) => {
  const def = FEATURES_BY_KEY[key];
  if (def?.type === 'BOOLEAN') return raw === 'true' ? 'liberado' : 'bloqueado';
  return Number(raw) === UNLIMITED ? 'ilimitado' : raw;
};

function BlockDialog({ t }: { t: Detail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const blocked = !!t.blockedAt;
  const m = useAdminMutation<{ reason?: string }>(
    'POST',
    `/v1/admin/tenants/${t.id}/${blocked ? 'unblock' : 'block'}`,
    {
      invalidate: ['/v1/admin/tenants'],
      success: blocked ? 'Personal reativado.' : 'Personal bloqueado.',
      onSuccess: () => setOpen(false),
    },
  );
  return (
    <>
      <Button variant={blocked ? 'secondary' : 'destructive'} onClick={() => setOpen(true)}>
        {blocked ? 'Reativar' : 'Bloquear'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blocked ? 'Reativar personal' : 'Bloquear personal'}</DialogTitle>
            <DialogDescription>
              {blocked
                ? 'A equipe e os alunos voltam a ter acesso.'
                : 'A equipe e os alunos perdem o acesso e as sessões do dono são encerradas. Nenhum dado é apagado.'}
            </DialogDescription>
          </DialogHeader>
          {!blocked ? (
            <Field label="Motivo (registrado na auditoria)">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
          <DialogFooter>
            <Button
              variant={blocked ? 'primary' : 'destructive'}
              disabled={!blocked && reason.trim().length < 5}
              onClick={() => m.mutate(blocked ? {} : { reason })}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImpersonateDialog({ t }: { t: Detail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const m = useAdminMutation<
    object,
    { accessToken: string; refreshToken: string; expiresAt: string }
  >('POST', '/v1/admin/impersonations', {
    onSuccess: (tokens) => {
      setOpen(false);
      // Tokens vão no fragmento (#), que não é enviado a servidores nem fica em logs.
      const payload = btoa(JSON.stringify({ ...tokens, tenantId: t.id }));
      window.open(`${WEB_URL}/impersonar#${payload}`, '_blank', 'noopener');
    },
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Entrar como o personal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonar {t.owner.name}</DialogTitle>
            <DialogDescription>
              Sessão de 30 minutos, com banner visível para você e registro na auditoria.
            </DialogDescription>
          </DialogHeader>
          <Field label="Motivo (mín. 10 caracteres)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button
              disabled={reason.trim().length < 10 || m.isPending}
              onClick={() => m.mutate({ userId: t.owner.id, reason, minutes: 30 })}
            >
              Abrir sessão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OverrideForm({ tenantId }: { tenantId: string }) {
  const [key, setKey] = useState<string>(FEATURE_CATALOG[0]!.key);
  const [value, setValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const def = FEATURES_BY_KEY[key]!;
  const m = useAdminMutation<object>('PUT', `/v1/admin/tenants/${tenantId}/overrides`, {
    invalidate: [`/v1/admin/tenants/${tenantId}`],
    success: 'Override salvo.',
    onSuccess: () => (setValue(''), setReason('')),
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({
          featureKey: key,
          value: def.type === 'BOOLEAN' ? value === 'true' : Number(value),
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59-03:00`).toISOString() : null,
          reason,
        });
      }}
    >
      <Field label="Feature">
        <Select value={key} onValueChange={(v) => (setKey(v), setValue(''))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEATURE_CATALOG.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.name} ({f.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {def.type === 'BOOLEAN' ? (
        <Field label="Valor">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Liberado</SelectItem>
              <SelectItem value="false">Bloqueado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <Field label={`Limite${def.unit ? ` (${def.unit})` : ''}`} hint="-1 = ilimitado">
          <Input type="number" min={-1} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      <Field label="Expira em (opcional)">
        <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </Field>
      <Field label="Motivo">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" className="self-end" disabled={!value || reason.trim().length < 3}>
        Aplicar override
      </Button>
    </form>
  );
}

export default function PersonalDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useAdminApi<Detail>(`/v1/admin/tenants/${id}`);
  const remove = useAdminMutation<{ key: string }>(
    'DELETE',
    (b) => `/v1/admin/tenants/${id}/overrides/${encodeURIComponent(b.key)}`,
    { invalidate: [`/v1/admin/tenants/${id}`], success: 'Override removido.' },
  );
  if (!d.data) return <Skeleton className="h-96" />;
  const t = d.data;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{t.name}</h1>
          <p className="text-muted-foreground">
            {t.owner.name} · {t.owner.email} · vettafit.com.br/p/{t.slug}
          </p>
        </div>
        <div className="flex gap-2">
          <ImpersonateDialog t={t} />
          <BlockDialog t={t} />
        </div>
      </div>
      {t.blockedAt ? (
        <Card className="border-danger">
          <CardContent className="pt-6">
            Bloqueado em {fmtDateTime(t.blockedAt)}: {t.blockedReason}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
          <span className="text-sm text-muted-foreground">Plano</span>
          {t.subscription ? <PlanBadge plan={t.subscription.plan.code} /> : '—'}
          <span className="text-sm text-muted-foreground">
            {t.subscription?.status === 'TRIALING'
              ? `teste até ${fmtDate(t.subscription.trialEndsAt)}`
              : t.subscription?.status.toLowerCase()}
          </span>
        </div>
        <StatTile
          label="Alunos ativos"
          value={t.students.ACTIVE ?? 0}
          hint={`${t.students.ARCHIVED ?? 0} arquivados`}
        />
        <StatTile
          label="Treinos (30 dias)"
          value={t.sessions30d}
          hint={`${t.programs} programas`}
        />
        <StatTile label="Armazenamento" value={fmtBytes(t.storageUsage?.bytesUsed ?? 0)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Overrides de feature</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {t.featureOverrides.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.featureOverrides.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{FEATURES_BY_KEY[o.featureKey]?.name ?? o.featureKey}</TableCell>
                    <TableCell>{showValue(o.featureKey, o.value)}</TableCell>
                    <TableCell>{o.expiresAt ? fmtDate(o.expiresAt) : 'sem expiração'}</TableCell>
                    <TableCell>{o.reason}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove.mutate({ key: o.featureKey })}
                      >
                        Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum override: vale o plano.</p>
          )}
          <OverrideForm tenantId={t.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Equipe</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {t.members.map((m) => (
            <span key={m.id}>
              {m.user.name} · {m.user.email} <Badge variant="outline">{m.role.toLowerCase()}</Badge>
            </span>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Acessos recentes do dono</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.recentAccesses.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{fmtDateTime(s.lastUsedAt)}</TableCell>
                  <TableCell>
                    {s.deviceName ?? s.platform}
                    {s.impersonatorAdminId ? (
                      <Badge variant="warning" className="ml-2">
                        impersonação
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{s.ip ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
