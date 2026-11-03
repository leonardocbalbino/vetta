'use client';

import { CATEGORY_LABEL, ExerciseCategory, MUSCLE_GROUPS } from '@vetta/contracts';
import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@vetta/ui';
import { BookOpen, Heart, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';
import { ExerciseSheet } from '@/components/exercise-sheet';
import { useActiveTenant } from '@/lib/session';

interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  category: (typeof ExerciseCategory)[number];
  level: string;
  primaryMuscles: string[];
  equipment: string[];
  isGlobal: boolean;
  isFavorite: boolean;
  media: { thumbnail: string | null; gif: string | null };
}

export default function LibraryPage() {
  const { tenantId } = useActiveTenant();
  const custom = useFeature(tenantId, 'library.custom');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const [category, setCategory] = useState('all');
  const [muscle, setMuscle] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const qs = new URLSearchParams({ scope, limit: '60' });
  if (q) qs.set('q', q);
  if (category !== 'all') qs.set('category', category);
  if (muscle !== 'all') qs.set('muscle', muscle);
  const list = useApi<{ items: Exercise[] }>(`/v1/exercises?${qs.toString()}`);
  const fav = useApiMutation<{ id: string; on: boolean }>(
    'POST',
    (b) => `/v1/exercises/${b.id}/favorite`,
    { invalidate: ['/v1/exercises'] },
  );
  const unfav = useApiMutation<{ id: string }>('DELETE', (b) => `/v1/exercises/${b.id}/favorite`, {
    invalidate: ['/v1/exercises'],
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">Biblioteca</h1>
        <LockedFeature
          locked={custom.locked}
          title="Exercícios próprios"
          mode="inline"
          requiredPlan="PRO"
        >
          <Button onClick={() => setSelected('new')}>
            <Plus /> Novo exercício
          </Button>
        </LockedFeature>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <Input
          placeholder="Buscar (acentos não importam)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar exercício"
        />
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger aria-label="Origem">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="global">Biblioteca Vetta</SelectItem>
            <SelectItem value="mine">Meus exercícios</SelectItem>
            <SelectItem value="favorites">Favoritos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {ExerciseCategory.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={muscle} onValueChange={setMuscle}>
          <SelectTrigger aria-label="Músculo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os músculos</SelectItem>
            {MUSCLE_GROUPS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!list.data ? (
        <Skeleton className="h-64" />
      ) : !list.data.items.length ? (
        <EmptyState
          icon={<BookOpen />}
          title="Nenhum exercício encontrado"
          description="Tente outro termo ou limpe os filtros."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.items.map((e) => (
            <li key={e.id}>
              <Card className="flex h-full gap-3 p-3 transition-colors hover:bg-muted/50">
                <button
                  type="button"
                  onClick={() => setSelected(e.id)}
                  className="flex min-w-0 flex-1 gap-3 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-control bg-muted">
                    {e.media.thumbnail ? (
                      <img src={e.media.thumbnail} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {e.primaryMuscles.join(', ')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline">{CATEGORY_LABEL[e.category]}</Badge>
                      {!e.isGlobal ? <Badge variant="action">meu</Badge> : null}
                    </div>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-pressed={e.isFavorite}
                  aria-label={
                    e.isFavorite ? `Remover ${e.name} dos favoritos` : `Favoritar ${e.name}`
                  }
                  onClick={() =>
                    e.isFavorite ? unfav.mutate({ id: e.id }) : fav.mutate({ id: e.id, on: true })
                  }
                >
                  <Heart className={e.isFavorite ? 'fill-danger text-danger' : ''} />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ExerciseSheet id={selected} onOpenChange={setSelected} />
    </div>
  );
}
