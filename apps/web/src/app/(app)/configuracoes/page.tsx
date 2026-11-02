'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '@vetta/ui';
import { useEffect, useState } from 'react';
import { UNLIMITED } from '@vetta/contracts';
import { useEntitlements } from '@vetta/sdk/react';
import { useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Tenant {
  id: string;
  name: string;
  cref: string | null;
  crefState: string | null;
  timezone: string;
}

export default function SettingsPage() {
  const t = useApi<Tenant>('/v1/tenants/current');
  const d = useApi<{ alerts: { inactivityDays: number } }>('/v1/dashboard');
  const [form, setForm] = useState({
    name: '',
    cref: '',
    crefState: '',
    bio: '',
    days: '5',
    reassess: '',
  });
  useEffect(() => {
    if (t.data)
      setForm((f) => ({
        ...f,
        name: t.data!.name,
        cref: t.data!.cref ?? '',
        crefState: t.data!.crefState ?? '',
      }));
  }, [t.data]);
  useEffect(() => {
    if (d.data) setForm((f) => ({ ...f, days: String(d.data!.alerts.inactivityDays) }));
  }, [d.data]);
  const saveTenant = useApiMutation<object>('PATCH', '/v1/tenants/current', {
    invalidate: ['/v1/tenants', '/v1/dashboard'],
  });
  const saveSettings = useApiMutation<object>('PATCH', '/v1/tenants/current/settings', {
    invalidate: ['/v1/dashboard'],
    success: 'Configurações salvas.',
  });
  if (!t.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl">Configurações</h1>
      <Card>
        <CardHeader>
          <CardTitle>Perfil profissional</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveTenant.mutate({
                name: form.name,
                cref: form.cref || null,
                crefState: form.crefState ? form.crefState.toUpperCase() : null,
              });
              saveSettings.mutate({
                bio: form.bio || null,
                inactivityAlertDays: Number(form.days),
                reassessmentDays: form.reassess ? Number(form.reassess) : null,
              });
            }}
          >
            <Field label="Nome do negócio">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Field label="CREF">
                <Input
                  value={form.cref}
                  onChange={(e) => setForm({ ...form, cref: e.target.value })}
                />
              </Field>
              <Field label="UF">
                <Input
                  maxLength={2}
                  value={form.crefState}
                  onChange={(e) => setForm({ ...form, crefState: e.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Apresentação"
              hint="Aparece para os alunos e, depois, na sua página de vendas."
              className="sm:col-span-2"
            >
              <Textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
            <Field label="Alerta de aluno sem treinar (dias)">
              <Input
                type="number"
                min={1}
                max={60}
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
              />
            </Field>
            <Field
              label="Lembrete de reavaliação a cada (dias)"
              hint="Vazio desliga. Vale para as próximas avaliações."
            >
              <Input
                type="number"
                min={15}
                max={365}
                value={form.reassess}
                onChange={(e) => setForm({ ...form, reassess: e.target.value })}
              />
            </Field>
            <Button
              type="submit"
              className="self-end"
              loading={saveTenant.isPending || saveSettings.isPending}
            >
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
      <StorageCard />
    </div>
  );
}

/** Uso do armazenamento de mídias próprias (aviso em 80%, bloqueio em 100%). */
function StorageCard() {
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const l = ent.data?.limits['storage.quota_mb'];
  if (!l) return null;
  const unlimited = l.max === UNLIMITED;
  const pct = unlimited || !l.max ? 0 : Math.min(100, Math.round((l.used / l.max) * 100));
  const gb = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${mb} MB`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Armazenamento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm">
          {gb(l.used)} de {unlimited ? 'ilimitado' : gb(l.max)} usados (vídeos, fotos e documentos)
        </p>
        {!unlimited ? (
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Uso do armazenamento"
            className="h-3 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={
                pct >= 100
                  ? 'h-full bg-danger'
                  : pct >= 80
                    ? 'h-full bg-warning'
                    : 'h-full bg-action'
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        {pct >= 100 ? (
          <p className="text-sm text-danger">
            Espaço esgotado: novos envios estão bloqueados. Libere espaço ou faça upgrade.
          </p>
        ) : pct >= 80 ? (
          <p className="text-sm text-warning">Você já usou {pct}% do espaço do seu plano.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
