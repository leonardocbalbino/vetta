'use client';

import { EXPORT_KINDS, type ExportKind } from '@vetta/contracts';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LockedFeature,
  toast,
} from '@vetta/ui';
import { CalendarDays, Download, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { errorMessage, fmtDateTime, localDay, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';
import { WhatsAppCard } from '@/components/whatsapp-optin';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const EXPORT_LABEL: Record<ExportKind, string> = {
  students: 'Alunos',
  workouts: 'Treinos realizados',
  loads: 'Cargas registradas',
  finance: 'Cobranças',
};

function GoogleCard() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'schedule.google_calendar');
  const client = useVettaClient();
  const status = useApi<GoogleStatus>('/v1/integrations/google', {
    enabled: !feature.locked && !feature.loading,
  });
  const sync = useApiMutation<undefined, { updated: number; blocks: number }>(
    'POST',
    '/v1/integrations/google/sync',
    {
      invalidate: ['/v1/integrations/google', '/v1/schedule'],
      onSuccess: (r) =>
        toast.success(`Sincronizado: ${r.updated} aula(s) atualizada(s), ${r.blocks} bloqueio(s).`),
    },
  );
  const disconnect = useApiMutation<undefined>('DELETE', '/v1/integrations/google', {
    invalidate: ['/v1/integrations/google'],
    success: 'Google Calendar desconectado.',
  });
  const s = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5" aria-hidden /> Google Calendar
        </CardTitle>
        <CardDescription>
          Suas aulas aparecem no Google e o que você marca por lá bloqueia horários na Vetta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LockedFeature
          locked={feature.locked}
          loading={feature.loading}
          title="Google Calendar"
          requiredPlan="PRO_PLUS"
        >
          {s?.connected ? (
            <div className="flex flex-col gap-3">
              <p>
                Conectado como <strong>{s.email}</strong>
                <Badge variant="success" className="ml-2">
                  ativo
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                Última sincronização: {fmtDateTime(s.lastSyncedAt)}
              </p>
              {s.lastError ? <p className="text-sm text-danger">{s.lastError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={sync.isPending}
                  onClick={() => sync.mutate(undefined)}
                >
                  <RefreshCw aria-hidden /> Sincronizar agora
                </Button>
                <Button variant="ghost" onClick={() => disconnect.mutate(undefined)}>
                  Desconectar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              disabled={s ? !s.configured : true}
              onClick={async () => {
                try {
                  const r = await client.request<{ url: string }>(
                    'POST',
                    '/v1/integrations/google/connect',
                  );
                  window.location.href = r.url;
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Conectar com Google
            </Button>
          )}
          {s && !s.configured ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Integração ainda não disponível neste ambiente.
            </p>
          ) : null}
        </LockedFeature>
      </CardContent>
    </Card>
  );
}

function ExportsCard() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'finance.advanced_reports');
  const client = useVettaClient();
  const [from, setFrom] = useState(localDay(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(localDay());
  const download = async (kind: ExportKind, format: 'csv' | 'pdf') => {
    try {
      const blob = await client.download(
        `/v1/exports/${kind}?format=${format}&from=${from}&to=${to}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vetta-${kind}-${to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-5" aria-hidden /> Exportações
        </CardTitle>
        <CardDescription>CSV (abre no Excel) ou PDF com o seu nome.</CardDescription>
      </CardHeader>
      <CardContent>
        <LockedFeature
          locked={feature.locked}
          loading={feature.loading}
          title="Exportações"
          requiredPlan="PRO_PLUS"
        >
          <div className="mb-4 flex flex-wrap gap-3">
            <Field label="De">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Até">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {EXPORT_KINDS.map((k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{EXPORT_LABEL[k]}</span>
                <span className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void download(k, 'csv')}>
                    CSV
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void download(k, 'pdf')}>
                    PDF
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </LockedFeature>
      </CardContent>
    </Card>
  );
}

function Feedback() {
  const params = useSearchParams();
  useEffect(() => {
    const g = params.get('google');
    if (g === 'ok') toast.success('Google Calendar conectado.');
    else if (g === 'erro') toast.error('Não foi possível conectar o Google Calendar.');
  }, [params]);
  return null;
}

/** Integrações: Google Calendar, WhatsApp e exportações. */
export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <Feedback />
      </Suspense>
      <h1 className="font-display text-3xl">Integrações</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <GoogleCard />
        <WhatsAppCard />
      </div>
      <ExportsCard />
    </div>
  );
}
