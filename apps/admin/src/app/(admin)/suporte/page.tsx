'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@vetta/ui';
import { useState } from 'react';
import { fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: 'OPEN' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  planCode: string;
  tenantName: string | null;
  slaDueAt: string;
  slaLate: boolean;
}

interface TicketDetail extends Ticket {
  pageUrl: string | null;
  tenant: { name: string; slug: string } | null;
  user: { name: string; email: string } | null;
  messages: {
    id: string;
    body: string;
    internal: boolean;
    authorAdminId: string | null;
    createdAt: string;
  }[];
}

const PRIORITY: Record<
  Ticket['priority'],
  { label: string; variant: 'danger' | 'warning' | 'neutral' | 'outline' }
> = {
  URGENT: { label: 'urgente', variant: 'danger' },
  HIGH: { label: 'alta', variant: 'warning' },
  NORMAL: { label: 'normal', variant: 'neutral' },
  LOW: { label: 'baixa', variant: 'outline' },
};
const STATUS_LABEL: Record<Ticket['status'], string> = {
  OPEN: 'Aberto',
  WAITING_USER: 'Aguardando personal',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
};

function Detail({ id }: { id: string }) {
  const t = useAdminApi<TicketDetail>(`/v1/admin/support/tickets/${id}`);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const reply = useAdminMutation<object>('POST', `/v1/admin/support/tickets/${id}/messages`, {
    invalidate: ['/v1/admin/support'],
    onSuccess: () => setBody(''),
  });
  const update = useAdminMutation<object>('PATCH', `/v1/admin/support/tickets/${id}`, {
    invalidate: ['/v1/admin/support'],
    success: 'Chamado atualizado.',
  });
  if (!t.data) return <Skeleton className="h-64" />;
  const d = t.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          #{d.number} · {d.subject}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {d.tenant?.name} ({d.planCode}) · {d.user?.name} &lt;{d.user?.email}&gt;
          {d.pageUrl ? ` · página ${d.pageUrl}` : ''}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Field label="Situação" className="w-56">
            <Select value={d.status} onValueChange={(v) => update.mutate({ status: v })}>
              <SelectTrigger aria-label="Situação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Prioridade" className="w-40">
            <Select value={d.priority} onValueChange={(v) => update.mutate({ priority: v })}>
              <SelectTrigger aria-label="Prioridade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <ol className="flex flex-col gap-2">
          {d.messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-control border p-3 ${
                m.internal
                  ? 'border-warning bg-warning/10'
                  : m.authorAdminId
                    ? 'border-action'
                    : 'border-border'
              }`}
            >
              <p className="mb-1 text-xs text-muted-foreground">
                {m.internal ? 'Nota interna' : m.authorAdminId ? 'Equipe Vetta' : 'Personal'} ·{' '}
                {fmtDateTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-line text-sm">{m.body}</p>
            </li>
          ))}
        </ol>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            reply.mutate({ body, internal });
          }}
        >
          <Field label="Resposta">
            <Textarea required value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id="internal"
              checked={internal}
              onCheckedChange={(v) => setInternal(v === true)}
            />
            <Label htmlFor="internal">Nota interna (o personal não vê)</Label>
          </div>
          <Button type="submit" className="self-start" loading={reply.isPending}>
            {internal ? 'Salvar nota' : 'Responder'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Fila de chamados: prioridade pelo plano e prazo de SLA. */
export default function SupportQueue() {
  const [status, setStatus] = useState('queue');
  const [selected, setSelected] = useState<string | null>(null);
  const list = useAdminApi<{ items: Ticket[] }>('/v1/admin/support/tickets', {
    ...(status === 'queue' ? {} : status === 'late' ? { breached: 'true' } : { status }),
    limit: 100,
  });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-extrabold">Suporte</h1>
        <Select value={status} onValueChange={(v) => (setStatus(v), setSelected(null))}>
          <SelectTrigger aria-label="Filtro" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="queue">Fila (abertos)</SelectItem>
            <SelectItem value="late">SLA estourado</SelectItem>
            <SelectItem value="RESOLVED">Resolvidos</SelectItem>
            <SelectItem value="CLOSED">Encerrados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardContent className="pt-4">
            {!list.data?.items.length ? (
              <EmptyState title="Nenhum chamado" description="Fila limpa." />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {list.data.items.map((t) => (
                  <li key={t.id}>
                    <button
                      className={`flex w-full flex-col gap-1 px-2 py-3 text-left hover:bg-muted ${
                        selected === t.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => setSelected(t.id)}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">#{t.number}</span>
                        <Badge variant={PRIORITY[t.priority].variant}>
                          {PRIORITY[t.priority].label}
                        </Badge>
                        <Badge variant="outline">{t.planCode}</Badge>
                        {t.slaLate ? <Badge variant="danger">SLA estourado</Badge> : null}
                      </span>
                      <span className="font-medium">{t.subject}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.tenantName} · prazo {fmtDateTime(t.slaDueAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {selected ? <Detail id={selected} /> : null}
      </div>
    </>
  );
}
