'use client';

import type { SyncSessionInput } from '@vetta/contracts';
import type { ApiProgram } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton, toast } from '@vetta/ui';
import { Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { Player, type RecordHit } from '@/components/player';
import { UnreadMessagesAlert } from '@/components/unread-messages';
import { errorMessage, fmtDate, useApi } from '@/lib/api';

/** Treino do dia do aluno: escolhe a rotina (sugerida em rodízio) e abre o player. */
export default function TodayPage() {
  const client = useVettaClient();
  const today = useApi<{
    programs: (ApiProgram & { lastSessionAt: string | null; endsOn: string | null })[];
  }>('/v1/training/today');
  const [selected, setSelected] = useState<{ programId: string; routineId: string } | null>(null);
  if (!today.data) return <Skeleton className="h-96" />;
  if (!today.data.programs.length) {
    return (
      <div className="flex flex-col gap-4">
        <UnreadMessagesAlert />
        <EmptyState
          icon={<Dumbbell />}
          title="Seu treino ainda não chegou"
          description="Assim que seu personal publicar, ele aparece aqui e você recebe um aviso."
        />
      </div>
    );
  }
  if (selected) {
    const program = today.data.programs.find((p) => p.id === selected.programId)!;
    const routine = program.routines.find((r) => r.id === selected.routineId)!;
    return (
      <Player
        program={program}
        routine={routine}
        storageKey={`vetta:player:${routine.id}`}
        equivalents={async (exerciseId) =>
          (
            await client.request<{ equivalents: { id: string; name: string }[] }>(
              'GET',
              `/v1/exercises/${exerciseId}`,
            )
          ).equivalents
        }
        onSubmit={async (s: SyncSessionInput) => {
          try {
            const r = await client.request<{ records: RecordHit[] }>(
              'POST',
              '/v1/training/sessions',
              s,
            );
            void today.refetch();
            return r;
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl">Treino do dia</h1>
      <UnreadMessagesAlert />
      {today.data.programs.map((p) => (
        <section key={p.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            {p.isExtra ? <Badge variant="outline">extra</Badge> : null}
            {p.lastSessionAt ? (
              <span className="text-sm text-muted-foreground">
                último treino {fmtDate(p.lastSessionAt)}
              </span>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.routines.map((r) => (
              <Card
                key={r.id}
                className={
                  r.id === p.nextRoutineId ? 'border-accent ring-2 ring-accent' : undefined
                }
              >
                <CardContent className="flex flex-col gap-2 pt-6">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-2xl">{r.label}</span>
                    <span className="font-medium">{r.name}</span>
                    {r.id === p.nextRoutineId ? (
                      <Badge variant="accent">sugerido hoje</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {r.exercises.map((e) => e.exercise.name).join(' · ')}
                  </p>
                  <Button
                    variant={r.id === p.nextRoutineId ? 'accent' : 'secondary'}
                    onClick={() => setSelected({ programId: p.id, routineId: r.id })}
                  >
                    Começar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
