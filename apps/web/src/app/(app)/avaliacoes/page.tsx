'use client';

import { EmptyState, Input, Skeleton } from '@vetta/ui';
import { Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { fmtDate, useApi } from '@/lib/api';

/** Avaliações começam pela ficha do aluno; aqui é o atalho para escolher quem avaliar. */
export default function AssessmentsPage() {
  const [q, setQ] = useState('');
  const list = useApi<{
    items: { id: string; displayName: string; lastWorkoutAt: string | null }[];
  }>(`/v1/students?status=ACTIVE${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl">Avaliações</h1>
      <p className="text-muted-foreground">
        Escolha o aluno para fazer uma avaliação física, comparar resultados ou baixar o PDF.
      </p>
      <Input
        placeholder="Buscar aluno"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
        aria-label="Buscar aluno"
      />
      {!list.data ? (
        <Skeleton className="h-48" />
      ) : !list.data.items.length ? (
        <EmptyState icon={<Stethoscope />} title="Nenhum aluno ativo" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.data.items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/alunos/${s.id}?aba=assessments`}
                className="flex justify-between rounded-control border border-border p-3 hover:bg-muted"
              >
                <span className="font-medium">{s.displayName}</span>
                <span className="text-sm text-muted-foreground">
                  último treino {fmtDate(s.lastWorkoutAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
