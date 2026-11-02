'use client';

import { Skeleton } from '@vetta/ui';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { WorkoutBuilder, fromApi, type BuilderProgram } from '@/components/workout-builder';
import { useApi } from '@/lib/api';

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const isNew = id === 'novo';
  const p = useApi<Parameters<typeof fromApi>[0]>(isNew ? null : `/v1/programs/${id}`);
  if (isNew) {
    const initial: BuilderProgram = {
      name: '',
      goal: '',
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: '',
      studentLinkId: params.get('aluno'),
      isTemplate: params.get('modelo') === '1',
      isExtra: false,
      routines: [{ key: 'a', label: 'A', name: '', notes: '', items: [] }],
    };
    return <WorkoutBuilder initial={initial} />;
  }
  if (!p.data) return <Skeleton className="h-96" />;
  return <WorkoutBuilder key={p.data.id} initial={fromApi(p.data)} />;
}

export default function Page() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
