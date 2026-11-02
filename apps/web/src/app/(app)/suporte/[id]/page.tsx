'use client';

import { Badge, Button, Card, CardContent, Field, Skeleton, Textarea } from '@vetta/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { fmtDateTime, useApi, useApiMutation } from '@/lib/api';
import { TICKET_STATUS, type TicketSummary } from '@/components/support-widget';

interface Ticket extends TicketSummary {
  messages: { id: string; body: string; fromSupport: boolean; createdAt: string }[];
}

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const t = useApi<Ticket>(`/v1/support/tickets/${id}`);
  const [body, setBody] = useState('');
  const reply = useApiMutation<{ body: string }>('POST', `/v1/support/tickets/${id}/messages`, {
    invalidate: ['/v1/support/tickets'],
    onSuccess: () => setBody(''),
  });
  if (!t.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/suporte" className="text-sm text-link underline">
        ← Suporte
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl">
          #{t.data.number} · {t.data.subject}
        </h1>
        <Badge variant={TICKET_STATUS[t.data.status].variant}>
          {TICKET_STATUS[t.data.status].label}
        </Badge>
      </div>
      {!t.data.firstRespondedAt ? (
        <p className="text-sm text-muted-foreground">
          Primeira resposta até {fmtDateTime(t.data.firstResponseDueAt)}.
        </p>
      ) : null}
      <ol className="flex flex-col gap-3" aria-live="polite">
        {t.data.messages.map((m) => (
          <li key={m.id}>
            <Card className={m.fromSupport ? 'border-action' : ''}>
              <CardContent className="pt-4">
                <p className="mb-1 text-xs text-muted-foreground">
                  {m.fromSupport ? 'Equipe Vetta' : 'Você'} · {fmtDateTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-line">{m.body}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      {t.data.status !== 'CLOSED' ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            reply.mutate({ body });
          }}
        >
          <Field label="Responder">
            <Textarea required value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Button type="submit" className="self-start" loading={reply.isPending}>
            Enviar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
