'use client';

import { Card, CardContent, EmptyState, Skeleton } from '@vetta/ui';
import { History } from 'lucide-react';
import { fmtDateTime, useApi } from '@/lib/api';

interface Session {
  id: string;
  startedAt: string;
  durationSeconds: number | null;
  rating: number | null;
  totalVolumeKg: string | null;
  routine: { label: string; name: string | null } | null;
  program: { name: string } | null;
  setLogs: {
    exercise: { name: string };
    reps: number | null;
    loadKg: string | null;
    completed: boolean;
  }[];
}

export default function HistoryPage() {
  const s = useApi<Session[]>('/v1/training/sessions');
  if (!s.data) return <Skeleton className="h-64" />;
  if (!s.data.length)
    return (
      <EmptyState
        icon={<History />}
        title="Nenhum treino ainda"
        description="Seus treinos concluídos aparecem aqui."
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-2xl">Histórico</h1>
      {s.data.map((x) => {
        const byExercise = new Map<string, string[]>();
        for (const l of x.setLogs.filter((l) => l.completed)) {
          const arr = byExercise.get(l.exercise.name) ?? [];
          arr.push(`${l.loadKg ? `${Number(l.loadKg)}kg×` : ''}${l.reps ?? '—'}`);
          byExercise.set(l.exercise.name, arr);
        }
        return (
          <Card key={x.id}>
            <CardContent className="flex flex-col gap-2 pt-6">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">
                  {x.program?.name} {x.routine ? `· ${x.routine.label}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {fmtDateTime(x.startedAt)} ·{' '}
                  {x.durationSeconds ? `${Math.round(x.durationSeconds / 60)} min` : ''}{' '}
                  {x.rating ? `· nota ${x.rating}` : ''}
                </p>
              </div>
              <ul className="text-sm">
                {[...byExercise.entries()].map(([name, sets]) => (
                  <li key={name}>
                    <span className="font-medium">{name}:</span> {sets.join(', ')}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
