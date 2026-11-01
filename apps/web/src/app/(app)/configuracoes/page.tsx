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
import { useApi, useApiMutation } from '@/lib/api';

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
  const [form, setForm] = useState({ name: '', cref: '', crefState: '', bio: '', days: '5' });
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
      <h1 className="font-display text-3xl">Configurações</h1>
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
    </div>
  );
}
