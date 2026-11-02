'use client';

import type { SyncSessionInput } from '@vetta/contracts';
import type { ApiProgram } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import { Button, Card, CardContent, Logo, Skeleton, toast } from '@vetta/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Player, type RecordHit } from '@/components/player';
import { errorMessage } from '@/lib/api';

/** Link público do treino: sem login, com vídeos e cronômetro. */
export default function PublicWorkoutPage() {
  const { token } = useParams<{ token: string }>();
  const client = useVettaClient();
  const q = useQuery({
    queryKey: ['public-workout', token],
    queryFn: () =>
      client.request<ApiProgram & { tenantName: string; studentFirstName: string | null }>(
        'GET',
        `/v1/public/workouts/${encodeURIComponent(token)}`,
      ),
    retry: false,
  });
  const [routineId, setRoutineId] = useState<string | null>(null);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Logo />
        {q.data ? <span className="text-sm text-muted-foreground">{q.data.tenantName}</span> : null}
      </header>
      {q.isError ? (
        <Card>
          <CardContent className="pt-6">
            Este link não está mais disponível. Peça um novo ao seu personal.
          </CardContent>
        </Card>
      ) : !q.data ? (
        <Skeleton className="h-96" />
      ) : routineId ? (
        <Player
          program={q.data}
          routine={q.data.routines.find((r) => r.id === routineId)!}
          storageKey={`vetta:public:${token}:${routineId}`}
          onSubmit={async (s: SyncSessionInput) => {
            try {
              return await client.request<{ records: RecordHit[] }>(
                'POST',
                `/v1/public/workouts/${encodeURIComponent(token)}/sessions`,
                s,
              );
            } catch (err) {
              toast.error(errorMessage(err));
              throw err;
            }
          }}
        />
      ) : (
        <>
          <h1 className="font-display text-3xl">
            {q.data.studentFirstName ? `${q.data.studentFirstName}, seu treino` : 'Seu treino'}:{' '}
            {q.data.name}
          </h1>
          <div className="flex flex-col gap-3">
            {q.data.routines.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-2 pt-6">
                  <p className="font-display text-xl">
                    {r.label} {r.name ? `· ${r.name}` : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.exercises.map((e) => e.exercise.name).join(' · ')}
                  </p>
                  <Button variant="accent" onClick={() => setRoutineId(r.id)}>
                    Começar treino {r.label}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
