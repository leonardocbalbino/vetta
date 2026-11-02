'use client';

import { CATEGORY_LABEL, ExerciseCategory, MUSCLE_GROUPS } from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  Uploader,
} from '@vetta/ui';
import { BookOpen, Heart, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';
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

function NewExercise({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const client = useVettaClient();
  const { tenantId } = useActiveTenant();
  const videos = useFeature(tenantId, 'library.custom_videos');
  const [f, setF] = useState({
    name: '',
    aliases: '',
    category: 'STRENGTH',
    muscles: '',
    equipment: '',
    instructions: '',
    tips: '',
    commonMistakes: '',
  });
  const [videoId, setVideoId] = useState<string | null>(null);
  const create = useApiMutation<object>('POST', '/v1/exercises', {
    invalidate: ['/v1/exercises'],
    success: 'Exercício criado.',
    onSuccess: () => onOpenChange(false),
  });
  const list = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo exercício</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              name: f.name,
              aliases: list(f.aliases),
              category: f.category,
              primaryMuscles: list(f.muscles),
              equipment: list(f.equipment),
              instructions: f.instructions || null,
              tips: f.tips || null,
              commonMistakes: f.commonMistakes || null,
              ...(videoId ? { videoMediaId: videoId } : {}),
            });
          }}
        >
          <Field label="Nome">
            <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Apelidos (vírgula)">
            <Input value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ExerciseCategory.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Músculos (vírgula)" hint={`Ex.: ${MUSCLE_GROUPS.slice(0, 4).join(', ')}`}>
            <Input value={f.muscles} onChange={(e) => setF({ ...f, muscles: e.target.value })} />
          </Field>
          <Field label="Equipamentos (vírgula)">
            <Input
              value={f.equipment}
              onChange={(e) => setF({ ...f, equipment: e.target.value })}
            />
          </Field>
          <Field label="Instruções">
            <Textarea
              value={f.instructions}
              onChange={(e) => setF({ ...f, instructions: e.target.value })}
            />
          </Field>
          <Field label="Dicas">
            <Textarea value={f.tips} onChange={(e) => setF({ ...f, tips: e.target.value })} />
          </Field>
          <Field label="Erros comuns">
            <Textarea
              value={f.commonMistakes}
              onChange={(e) => setF({ ...f, commonMistakes: e.target.value })}
            />
          </Field>
          <LockedFeature locked={videos.locked} title="Vídeo próprio" requiredPlan="PRO">
            <Uploader
              accept="video/mp4,video/quicktime"
              maxBytes={500 * 1024 * 1024}
              label="Envie o vídeo do exercício"
              hint="MP4 ou MOV até 500 MB. Convertido para HLS 360p/720p."
              upload={({ file, onProgress, signal, resumeMediaId, onCreated }) =>
                uploadFile(client, file, {
                  purpose: 'exercise_video',
                  signal,
                  onProgress: (p) => onProgress(p.ratio),
                  ...(resumeMediaId ? { resumeMediaId } : {}),
                  ...(onCreated ? { onCreated } : {}),
                })
              }
              onUploaded={(id) => setVideoId(id)}
            />
          </LockedFeature>
          <Button type="submit" loading={create.isPending}>
            Salvar exercício
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LibraryPage() {
  const { tenantId } = useActiveTenant();
  const custom = useFeature(tenantId, 'library.custom');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const [category, setCategory] = useState('all');
  const [muscle, setMuscle] = useState('all');
  const [open, setOpen] = useState(false);
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
          <Button onClick={() => setOpen(true)}>
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
              <Card className="flex h-full gap-3 p-3">
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
      <NewExercise open={open} onOpenChange={setOpen} />
    </div>
  );
}
