'use client';

import { PlanCode } from '@vetta/contracts';
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
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@vetta/ui';
import { useEffect, useState } from 'react';
import { adminClient } from '@/lib/client';
import { fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface Broadcast {
  id: string;
  title: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELED';
  channels: string[];
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  delivered: number;
  opened: number;
  openRate: number | null;
}

const STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativos',
  PAST_DUE: 'Em atraso',
  CANCELED: 'Cancelados',
};
const CHANNELS = [
  { v: 'IN_APP', l: 'No app' },
  { v: 'PUSH', l: 'Push' },
  { v: 'EMAIL', l: 'E-mail' },
] as const;

const toggle = <T,>(list: T[], v: T, on: boolean) =>
  on ? [...list, v] : list.filter((x) => x !== v);

/** Comunicados da plataforma para personais, segmentados por plano, status e cadastro. */
export default function PlatformBroadcasts() {
  const list = useAdminApi<Broadcast[]>('/v1/admin/broadcasts');
  const [f, setF] = useState({
    title: '',
    body: '',
    url: '',
    channels: ['IN_APP'] as string[],
    plans: [] as string[],
    statuses: [] as string[],
    signupFrom: '',
    signupTo: '',
    scheduledAt: '',
  });
  const [reach, setReach] = useState<number | null>(null);
  const segment = {
    plans: f.plans,
    statuses: f.statuses,
    signupFrom: f.signupFrom || null,
    signupTo: f.signupTo || null,
  };
  useEffect(() => {
    const t = setTimeout(() => {
      void adminClient
        .request<{ recipients: number }>('POST', '/v1/admin/broadcasts/preview', segment)
        .then((r) => setReach(r.recipients))
        .catch(() => setReach(null));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.plans, f.statuses, f.signupFrom, f.signupTo]);

  const send = useAdminMutation<{ id: string; scheduledAt: string | null }>(
    'POST',
    (b) => `/v1/admin/broadcasts/${b.id}/send`,
    { invalidate: ['/v1/admin/broadcasts'], success: 'Comunicado enviado ou agendado.' },
  );
  const create = useAdminMutation<object, { id: string }>('POST', '/v1/admin/broadcasts', {
    invalidate: ['/v1/admin/broadcasts'],
    onSuccess: (b) => {
      send.mutate({
        id: b.id,
        scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
      });
      setF({ ...f, title: '', body: '', url: '', scheduledAt: '' });
    },
  });
  const cancel = useAdminMutation<string>('POST', (id) => `/v1/admin/broadcasts/${id}/cancel`, {
    invalidate: ['/v1/admin/broadcasts'],
  });

  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Comunicados da plataforma</h1>
      <Card>
        <CardHeader>
          <CardTitle>Novo comunicado</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                title: f.title,
                body: f.body,
                url: f.url || null,
                channels: f.channels,
                segment,
              });
            }}
          >
            <Field label="Título" className="md:col-span-2">
              <Input
                required
                maxLength={120}
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
              />
            </Field>
            <Field label="Mensagem" className="md:col-span-2">
              <Textarea
                required
                maxLength={4000}
                value={f.body}
                onChange={(e) => setF({ ...f, body: e.target.value })}
              />
            </Field>
            <Field label="Link (opcional)">
              <Input
                type="url"
                value={f.url}
                onChange={(e) => setF({ ...f, url: e.target.value })}
              />
            </Field>
            <Field label="Agendar para (opcional)">
              <Input
                type="datetime-local"
                value={f.scheduledAt}
                onChange={(e) => setF({ ...f, scheduledAt: e.target.value })}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Planos (vazio = todos)</legend>
              {PlanCode.map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <Checkbox
                    id={`plan-${p}`}
                    checked={f.plans.includes(p)}
                    onCheckedChange={(v) => setF({ ...f, plans: toggle(f.plans, p, v === true) })}
                  />
                  <Label htmlFor={`plan-${p}`}>{p.replace('_', ' ')}</Label>
                </div>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Assinatura (vazio = todas)</legend>
              {STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Checkbox
                    id={`st-${s}`}
                    checked={f.statuses.includes(s)}
                    onCheckedChange={(v) =>
                      setF({ ...f, statuses: toggle(f.statuses, s, v === true) })
                    }
                  />
                  <Label htmlFor={`st-${s}`}>{STATUS_LABEL[s]}</Label>
                </div>
              ))}
            </fieldset>
            <Field label="Cadastro a partir de">
              <Input
                type="date"
                value={f.signupFrom}
                onChange={(e) => setF({ ...f, signupFrom: e.target.value })}
              />
            </Field>
            <Field label="Cadastro até">
              <Input
                type="date"
                value={f.signupTo}
                onChange={(e) => setF({ ...f, signupTo: e.target.value })}
              />
            </Field>
            <fieldset className="flex flex-wrap gap-4 md:col-span-2">
              <legend className="mb-1 text-sm font-medium">Canais</legend>
              {CHANNELS.map((c) => (
                <div key={c.v} className="flex items-center gap-2">
                  <Checkbox
                    id={`ch-${c.v}`}
                    checked={f.channels.includes(c.v)}
                    onCheckedChange={(v) =>
                      setF({ ...f, channels: toggle(f.channels, c.v, v === true) })
                    }
                  />
                  <Label htmlFor={`ch-${c.v}`}>{c.l}</Label>
                </div>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button
                type="submit"
                loading={create.isPending || send.isPending}
                disabled={!f.channels.length}
              >
                {f.scheduledAt ? 'Agendar' : 'Enviar agora'}
              </Button>
              {reach !== null ? (
                <span className="text-sm text-muted-foreground">Alcança {reach} personal(is).</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Enviados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Entregues</TableHead>
                <TableHead className="text-right">Abertos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.title}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.status === 'SENT'
                          ? 'success'
                          : b.status === 'CANCELED'
                            ? 'outline'
                            : 'warning'
                      }
                    >
                      {b.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtDateTime(b.sentAt ?? b.scheduledAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.delivered}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.opened} {b.openRate !== null ? `(${b.openRate}%)` : ''}
                  </TableCell>
                  <TableCell>
                    {b.status === 'SCHEDULED' || b.status === 'DRAFT' ? (
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(b.id)}>
                        Cancelar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
