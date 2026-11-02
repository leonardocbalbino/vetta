'use client';

import { Badge, Button, Card, CardContent, Skeleton } from '@vetta/ui';
import { useParams } from 'next/navigation';
import { fmtDateTime, useApi, useApiMutation } from '@/lib/api';

interface Response {
  id: string;
  status: string;
  hasRisk: boolean;
  answeredAt: string | null;
  reviewedAt: string | null;
  answers: Record<string, unknown>;
  studentLink: { displayName: string };
  template: { name: string; schema: { questions: { id: string; label: string; type: string }[] } };
}

const show = (v: unknown) =>
  v === true
    ? 'Sim'
    : v === false
      ? 'Não'
      : Array.isArray(v)
        ? v.join(', ')
        : v === undefined || v === null || v === ''
          ? '—'
          : String(v);

/** Respostas da anamnese para o personal (com marcação de revisão). */
export default function AnamnesisResponsePage() {
  const { id } = useParams<{ id: string }>();
  const r = useApi<Response>(`/v1/anamnesis/responses/${id}`);
  const review = useApiMutation<object>('POST', `/v1/anamnesis/responses/${id}/review`, {
    invalidate: [`/v1/anamnesis/responses/${id}`],
    success: 'Marcada como revisada.',
  });
  if (!r.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl">{r.data.template.name}</h1>
      <p className="text-muted-foreground">
        {r.data.studentLink.displayName} ·{' '}
        {r.data.answeredAt
          ? `respondida em ${fmtDateTime(r.data.answeredAt)}`
          : 'aguardando resposta'}
      </p>
      {r.data.hasRisk ? (
        <div role="alert" className="rounded-control bg-danger p-3 text-danger-foreground">
          Resposta de risco. Peça liberação médica antes de intensificar o treino.
        </div>
      ) : null}
      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {r.data.template.schema.questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
              <span>{q.label}</span>
              <span
                className={
                  r.data!.answers[q.id] === true && q.type === 'yes_no'
                    ? 'font-semibold text-danger'
                    : 'font-medium'
                }
              >
                {show(r.data!.answers[q.id])}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      {r.data.status === 'ANSWERED' ? (
        r.data.reviewedAt ? (
          <Badge variant="success">Revisada em {fmtDateTime(r.data.reviewedAt)}</Badge>
        ) : (
          <Button className="self-start" onClick={() => review.mutate({})}>
            Marcar como revisada
          </Button>
        )
      ) : null}
    </div>
  );
}
