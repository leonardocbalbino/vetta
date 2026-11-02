'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@vetta/ui';
import Link from 'next/link';
import { SupportForm, TICKET_STATUS, type TicketSummary } from '@/components/support-widget';
import { fmtDateTime, useApi } from '@/lib/api';

/** Chamados do personal com a Vetta. */
export default function SupportPage() {
  const list = useApi<TicketSummary[]>('/v1/support/tickets');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Suporte</h1>
        <p className="text-muted-foreground">
          Antes de abrir um chamado, veja a{' '}
          <a className="text-link underline" href="https://vettafit.com.br/ajuda">
            central de ajuda
          </a>
          .
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Meus chamados</CardTitle>
          </CardHeader>
          <CardContent>
            {!list.data?.length ? (
              <EmptyState title="Nenhum chamado" description="Quando precisar, estamos aqui." />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {list.data.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/suporte/${t.id}`}
                      className="flex min-h-11 flex-wrap items-center gap-2 py-3 hover:bg-muted"
                    >
                      <span className="text-sm text-muted-foreground">#{t.number}</span>
                      <span className="flex-1 font-medium">{t.subject}</span>
                      <Badge variant={TICKET_STATUS[t.status].variant}>
                        {TICKET_STATUS[t.status].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(t.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Abrir chamado</CardTitle>
          </CardHeader>
          <CardContent>
            <SupportForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
