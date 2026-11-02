'use client';

import { useFeature, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@vetta/ui';
import { useEffect, useState } from 'react';
import { fmtDateTime, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Broadcast {
  id: string;
  title: string;
  body: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELED';
  scheduledAt: string | null;
  sentAt: string | null;
  recipientsCount: number;
  openedCount: number;
  openRate: number;
  channels: string[];
}

const STATUS: Record<
  Broadcast['status'],
  { label: string; variant: 'success' | 'warning' | 'outline' | 'neutral' }
> = {
  DRAFT: { label: 'rascunho', variant: 'neutral' },
  SCHEDULED: { label: 'agendado', variant: 'warning' },
  SENDING: { label: 'enviando', variant: 'warning' },
  SENT: { label: 'enviado', variant: 'success' },
  CANCELED: { label: 'cancelado', variant: 'outline' },
};

type AudienceKind = 'all' | 'group' | 'filter';

/** Comunicados em massa: para todos, um grupo ou por filtro; imediato ou agendado; com taxa de abertura. */
export default function BroadcastsPage() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'comms.broadcast');
  const client = useVettaClient();
  const list = useApi<Broadcast[]>('/v1/broadcasts', { enabled: !feature.locked });
  const groups = useApi<{ id: string; name: string }[]>('/v1/student-groups', {
    enabled: !feature.locked,
  });
  const [f, setF] = useState({
    title: '',
    body: '',
    kind: 'all' as AudienceKind,
    groupId: '',
    inactiveDays: '',
    tags: '',
    status: 'ACTIVE',
    schedule: '',
    push: true,
    email: false,
  });
  const [count, setCount] = useState<number | null>(null);
  const audience = () =>
    f.kind === 'all'
      ? { all: true }
      : f.kind === 'group'
        ? { groupIds: [f.groupId] }
        : {
            filter: {
              status: [f.status],
              ...(f.inactiveDays ? { inactiveDays: Number(f.inactiveDays) } : {}),
              ...(f.tags.trim()
                ? {
                    tags: f.tags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }
                : {}),
            },
          };
  useEffect(() => {
    if (feature.locked || (f.kind === 'group' && !f.groupId)) return setCount(null);
    const t = setTimeout(() => {
      void client
        .request<{ count: number }>('POST', '/v1/broadcasts/audience', { audience: audience() })
        .then((r) => setCount(r.count))
        .catch(() => setCount(null));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.kind, f.groupId, f.inactiveDays, f.tags, f.status, feature.locked]);
  const create = useApiMutation<object>('POST', '/v1/broadcasts', {
    invalidate: ['/v1/broadcasts'],
    success: 'Comunicado salvo.',
    onSuccess: () => setF({ ...f, title: '', body: '', schedule: '' }),
  });
  const cancel = useApiMutation<string>('PATCH', (id) => `/v1/broadcasts/${id}/cancel`, {
    invalidate: ['/v1/broadcasts'],
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Comunicados</h1>
      <LockedFeature locked={feature.locked} title="Comunicados em massa" requiredPlan="PRO">
        <Card>
          <CardHeader>
            <CardTitle>Novo comunicado</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate({
                  title: f.title,
                  body: f.body,
                  audience: audience(),
                  channels: ['IN_APP', ...(f.push ? ['PUSH'] : []), ...(f.email ? ['EMAIL'] : [])],
                  ...(f.schedule ? { scheduledAt: new Date(f.schedule).toISOString() } : {}),
                });
              }}
            >
              <Field label="Título" className="sm:col-span-2">
                <Input
                  required
                  maxLength={80}
                  value={f.title}
                  onChange={(e) => setF({ ...f, title: e.target.value })}
                />
              </Field>
              <Field label="Mensagem" className="sm:col-span-2">
                <Textarea
                  required
                  maxLength={1000}
                  value={f.body}
                  onChange={(e) => setF({ ...f, body: e.target.value })}
                />
              </Field>
              <Field label="Para quem">
                <Select
                  value={f.kind}
                  onValueChange={(v) => setF({ ...f, kind: v as AudienceKind })}
                >
                  <SelectTrigger aria-label="Para quem">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os alunos</SelectItem>
                    <SelectItem value="group">Um grupo</SelectItem>
                    <SelectItem value="filter">Por filtro</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {f.kind === 'group' ? (
                <Field label="Grupo">
                  <Select value={f.groupId} onValueChange={(v) => setF({ ...f, groupId: v })}>
                    <SelectTrigger aria-label="Grupo">
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {(groups.data ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              {f.kind === 'filter' ? (
                <>
                  <Field label="Situação">
                    <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                      <SelectTrigger aria-label="Situação">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Ativos</SelectItem>
                        <SelectItem value="PAUSED">Pausados</SelectItem>
                        <SelectItem value="OVERDUE">Inadimplentes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Sem treinar há (dias)">
                    <Input
                      type="number"
                      min={1}
                      value={f.inactiveDays}
                      onChange={(e) => setF({ ...f, inactiveDays: e.target.value })}
                    />
                  </Field>
                  <Field label="Com as tags (vírgula)">
                    <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
                  </Field>
                </>
              ) : null}
              <Field label="Agendar (opcional)" hint="Vazio envia agora">
                <Input
                  type="datetime-local"
                  value={f.schedule}
                  onChange={(e) => setF({ ...f, schedule: e.target.value })}
                />
              </Field>
              <fieldset className="flex flex-wrap items-center gap-4 sm:col-span-2">
                <legend className="sr-only">Canais</legend>
                <span className="text-sm">No app (sempre)</span>
                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox checked={f.push} onCheckedChange={(v) => setF({ ...f, push: !!v })} />{' '}
                  Push
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox checked={f.email} onCheckedChange={(v) => setF({ ...f, email: !!v })} />{' '}
                  E-mail
                </label>
              </fieldset>
              <p className="text-sm text-muted-foreground sm:col-span-2" aria-live="polite">
                {count === null
                  ? ''
                  : `${count} ${count === 1 ? 'aluno recebe' : 'alunos recebem'} este comunicado.`}
              </p>
              <Button type="submit" loading={create.isPending} className="sm:col-span-2">
                {f.schedule ? 'Agendar' : 'Enviar agora'}
              </Button>
            </form>
          </CardContent>
        </Card>
        {!list.data ? (
          <Skeleton className="h-32" />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data.map((b) => (
              <li key={b.id} className="rounded-card border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 font-semibold">{b.title}</p>
                  <Badge variant={STATUS[b.status].variant}>{STATUS[b.status].label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{b.body}</p>
                <p className="mt-2 text-sm">
                  {b.status === 'SENT'
                    ? `Enviado ${fmtDateTime(b.sentAt)} · ${b.recipientsCount} destinatários · ${b.openRate}% abriram (${b.openedCount})`
                    : b.status === 'SCHEDULED'
                      ? `Agendado para ${fmtDateTime(b.scheduledAt)}`
                      : ''}
                </p>
                {b.status === 'SCHEDULED' ? (
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate(b.id)}>
                    Cancelar agendamento
                  </Button>
                ) : null}
              </li>
            ))}
            {!list.data.length ? (
              <li className="text-muted-foreground">Nenhum comunicado ainda.</li>
            ) : null}
          </ul>
        )}
      </LockedFeature>
    </div>
  );
}
