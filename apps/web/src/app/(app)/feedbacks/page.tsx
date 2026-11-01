'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  Switch,
  Textarea,
} from '@vetta/ui';
import { MessageSquareHeart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { fmtDateTime, useApi, useApiMutation } from '@/lib/api';

interface Feedback {
  id: string;
  finishedAt: string;
  rating: number;
  perceivedEffort: number | null;
  hasPain: boolean | null;
  painLocation: string | null;
  feedback: string | null;
  critical: boolean;
  feedbackReadAt: string | null;
  totalVolumeKg: string | null;
  studentLink: { id: string; displayName: string };
  routine: { label: string; name: string | null } | null;
  program: { name: string } | null;
}

function Item({ f }: { f: Feedback }) {
  const [reply, setReply] = useState('');
  const send = useApiMutation<{ message: string }>('POST', `/v1/feedbacks/${f.id}/reply`, {
    invalidate: ['/v1/feedbacks', '/v1/dashboard'],
    success: 'Resposta enviada para o chat do aluno.',
    onSuccess: () => setReply(''),
  });
  const read = useApiMutation<object>('PATCH', `/v1/feedbacks/${f.id}/read`, {
    invalidate: ['/v1/feedbacks', '/v1/dashboard'],
  });
  return (
    <Card className={f.critical ? 'border-danger' : undefined}>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/alunos/${f.studentLink.id}?aba=progress`}
            className="font-semibold hover:underline"
          >
            {f.studentLink.displayName}
          </Link>
          <span className="text-sm text-muted-foreground">
            {f.program?.name} {f.routine ? `· ${f.routine.label}` : ''} ·{' '}
            {fmtDateTime(f.finishedAt)}
          </span>
          {f.critical ? <Badge variant="danger">atenção</Badge> : null}
          {!f.feedbackReadAt ? <Badge variant="action">novo</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span aria-label={`Nota ${f.rating} de 5`}>
            {'★'.repeat(f.rating)}
            {'☆'.repeat(5 - f.rating)}
          </span>
          <span>Esforço {f.perceivedEffort ?? '—'}/10</span>
          <span className={f.hasPain ? 'font-semibold text-danger' : undefined}>
            {f.hasPain ? `Dor: ${f.painLocation ?? 'sim'}` : 'Sem dor'}
          </span>
          {f.totalVolumeKg ? (
            <span>Volume {Number(f.totalVolumeKg).toLocaleString('pt-BR')} kg</span>
          ) : null}
        </div>
        {f.feedback ? <p className="rounded-control bg-muted p-3">“{f.feedback}”</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            placeholder="Responder (vai para o chat do aluno)"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            aria-label="Resposta"
            className="min-h-11"
          />
          <div className="flex gap-2">
            <Button
              disabled={!reply.trim()}
              loading={send.isPending}
              onClick={() => send.mutate({ message: reply })}
            >
              Responder
            </Button>
            {!f.feedbackReadAt ? (
              <Button variant="ghost" onClick={() => read.mutate({})}>
                Marcar como lido
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeedbacksPage() {
  const [unread, setUnread] = useState(true);
  const list = useApi<Feedback[]>(`/v1/feedbacks?unread=${unread}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl">Feedbacks</h1>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={unread} onCheckedChange={setUnread} aria-label="Só não lidos" /> Só não
          lidos
        </label>
      </div>
      {!list.data ? (
        <Skeleton className="h-64" />
      ) : !list.data.length ? (
        <EmptyState
          icon={<MessageSquareHeart />}
          title="Tudo respondido"
          description="Os feedbacks aparecem aqui quando o aluno termina um treino."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.data.map((f) => (
            <Item key={f.id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
