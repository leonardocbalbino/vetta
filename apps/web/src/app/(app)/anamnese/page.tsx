'use client';

import { Badge, EmptyState, Skeleton } from '@vetta/ui';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { fmtDate, useApi } from '@/lib/api';

export default function AnamnesisList() {
  const r =
    useApi<
      {
        id: string;
        status: string;
        dueAt: string | null;
        answeredAt: string | null;
        template: { name: string };
      }[]
    >('/v1/anamnesis/responses');
  if (!r.data) return <Skeleton className="h-48" />;
  if (!r.data.length)
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="Nenhuma anamnese"
        description="Quando seu personal enviar, ela aparece aqui."
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-3xl">Anamnese</h1>
      {r.data.map((x) => (
        <Link
          key={x.id}
          href={`/anamnese/${x.id}`}
          className="flex items-center justify-between rounded-control border border-border p-4 hover:bg-muted"
        >
          <span className="font-medium">{x.template.name}</span>
          <Badge variant={x.status === 'PENDING' ? 'accent' : 'success'}>
            {x.status === 'PENDING'
              ? x.dueAt
                ? `responder até ${fmtDate(x.dueAt)}`
                : 'pendente'
              : `respondida ${fmtDate(x.answeredAt)}`}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
