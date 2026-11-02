'use client';

import {
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetta/ui';
import { Dumbbell, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { fmtDate, useApi } from '@/lib/api';

interface Row {
  id: string;
  name: string;
  status: string;
  isTemplate: boolean;
  isExtra: boolean;
  updatedAt: string;
  endsOn: string | null;
  studentLink: { id: string; displayName: string } | null;
  _count: { routines: number };
}

function List({ templates, q }: { templates: boolean; q: string }) {
  const r = useApi<Row[]>(
    `/v1/programs?templates=${templates}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
  );
  if (!r.data) return <Skeleton className="h-48" />;
  if (!r.data.length) {
    return (
      <EmptyState
        icon={<Dumbbell />}
        title={templates ? 'Nenhum modelo' : 'Nenhum treino'}
        description={
          templates
            ? 'Salve um treino como modelo para reaproveitar.'
            : 'Crie o primeiro treino de um aluno.'
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {r.data.map((p) => (
        <li key={p.id}>
          <Link
            href={`/treinos/${p.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3 hover:bg-muted"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted-foreground">
                {p.studentLink?.displayName ?? 'Modelo'} · {p._count.routines} rotina(s) ·
                atualizado {fmtDate(p.updatedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              {p.isExtra ? <Badge variant="outline">extra</Badge> : null}
              {!p.isTemplate ? (
                <Badge variant={p.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {p.status === 'ACTIVE' ? 'Publicado' : 'Rascunho'}
                </Badge>
              ) : null}
              {p.endsOn ? <Badge variant="outline">troca {fmtDate(p.endsOn)}</Badge> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function WorkoutsPage() {
  const [q, setQ] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">Treinos</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/treinos/ia">
              <Sparkles aria-hidden /> Gerar com IA
            </Link>
          </Button>
          <Button asChild>
            <Link href="/treinos/novo">Novo treino</Link>
          </Button>
        </div>
      </div>
      <Input
        placeholder="Buscar treino"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar treino"
        className="max-w-sm"
      />
      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Dos alunos</TabsTrigger>
          <TabsTrigger value="templates">Modelos</TabsTrigger>
        </TabsList>
        <TabsContent value="programs">
          <List templates={false} q={q} />
        </TabsContent>
        <TabsContent value="templates">
          <List templates q={q} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
