'use client';

import {
  CATEGORY_LABEL,
  ExerciseCategory,
  ExerciseLevel,
  LEVEL_LABEL,
  MUSCLE_GROUPS,
} from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  Textarea,
  Uploader,
} from '@vetta/ui';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';
import { YouTubeEmbed, YouTubeField } from './youtube';

export interface ExerciseDetail {
  id: string;
  name: string;
  aliases: string[];
  category: ExerciseCategory;
  level: ExerciseLevel;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string | null;
  tips: string | null;
  commonMistakes: string | null;
  videoMediaId: string | null;
  imageMediaId: string | null;
  gifMediaId: string | null;
  externalVideoUrl: string | null;
  folderId: string | null;
  isGlobal: boolean;
  media: {
    video: string | null;
    thumbnail: string | null;
    gif: string | null;
    image: string | null;
    youtube: { embedUrl: string; watchUrl: string; thumbnail: string } | null;
  };
  equivalents: { id: string; name: string; equipment: string[]; tenantId: string | null }[];
}

const joinList = (l: string[] | undefined) => (l ?? []).join(', ');
const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Vídeo próprio (MP4/GIF), YouTube ou imagem, nessa ordem. */
function ExerciseMedia({ e }: { e: ExerciseDetail }) {
  const { media } = e;
  const playable = media.video && !media.video.endsWith('.m3u8') ? media.video : null;
  if (playable)
    return (
      <video
        src={playable}
        controls
        muted
        loop
        playsInline
        className="aspect-video w-full rounded-card bg-black"
        aria-label={`Vídeo: ${e.name}`}
      />
    );
  if (media.gif)
    return (
      <img
        src={media.gif}
        alt={`Demonstração: ${e.name}`}
        className="w-full rounded-card object-contain"
      />
    );
  if (media.youtube) return <YouTubeEmbed embedUrl={media.youtube.embedUrl} title={e.name} />;
  if (media.image)
    return <img src={media.image} alt={e.name} className="w-full rounded-card object-cover" />;
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-card bg-muted text-sm text-muted-foreground">
      Sem vídeo ou imagem
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="whitespace-pre-line text-sm">{children}</div>
    </section>
  );
}

function ExerciseView({
  e,
  onEdit,
  onDuplicate,
  onDelete,
  onOpen,
  busy,
}: {
  e: ExerciseDetail;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpen: (id: string) => void;
  busy: boolean;
}) {
  const { tenantId } = useActiveTenant();
  const custom = useFeature(tenantId, 'library.custom');
  return (
    <div className="flex flex-col gap-5">
      <ExerciseMedia e={e} />
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline">{CATEGORY_LABEL[e.category]}</Badge>
        <Badge variant="outline">{LEVEL_LABEL[e.level]}</Badge>
        {e.isGlobal ? (
          <Badge variant="outline">Biblioteca Vetta</Badge>
        ) : (
          <Badge variant="action">meu</Badge>
        )}
      </div>

      <LockedFeature
        locked={custom.locked}
        title="Editar exercícios"
        mode="inline"
        requiredPlan="PRO"
      >
        <div className="flex flex-wrap gap-2">
          {e.isGlobal ? (
            <Button onClick={onDuplicate} loading={busy}>
              <Copy /> Duplicar e editar
            </Button>
          ) : (
            <>
              <Button onClick={onEdit}>
                <Pencil /> Editar
              </Button>
              <Button variant="secondary" onClick={onDuplicate} loading={busy}>
                <Copy /> Duplicar
              </Button>
              <Button variant="ghost" onClick={onDelete}>
                <Trash2 /> Excluir
              </Button>
            </>
          )}
        </div>
      </LockedFeature>
      {e.isGlobal ? (
        <p className="text-sm text-muted-foreground">
          Os exercícios da biblioteca Vetta valem para todos. Duplique para ter a sua versão e
          editar à vontade.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Músculos principais">{joinList(e.primaryMuscles) || '—'}</Section>
        <Section title="Músculos auxiliares">{joinList(e.secondaryMuscles) || '—'}</Section>
        <Section title="Equipamentos">{joinList(e.equipment) || 'Peso do corpo'}</Section>
        {e.aliases.length ? (
          <Section title="Também chamado de">{joinList(e.aliases)}</Section>
        ) : null}
      </div>
      {e.instructions ? <Section title="Como fazer">{e.instructions}</Section> : null}
      {e.tips ? <Section title="Dicas">{e.tips}</Section> : null}
      {e.commonMistakes ? <Section title="Erros comuns">{e.commonMistakes}</Section> : null}
      {e.media.youtube ? (
        <a
          href={e.media.youtube.watchUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-action underline-offset-4 hover:underline"
        >
          Abrir no YouTube
        </a>
      ) : null}

      {e.equivalents.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Exercícios parecidos</h3>
          <ul className="flex flex-wrap gap-2">
            {e.equivalents.map((q) => (
              <li key={q.id}>
                <Button variant="secondary" size="sm" onClick={() => onOpen(q.id)}>
                  {q.name}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Formulário de exercício próprio: cria (sem `initial`) ou edita mantendo pasta e mídias. */
export function ExerciseForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: ExerciseDetail;
  onDone: (id: string) => void;
  onCancel?: () => void;
}) {
  const client = useVettaClient();
  const { tenantId } = useActiveTenant();
  const videos = useFeature(tenantId, 'library.custom_videos');
  const [f, setF] = useState(() => ({
    name: initial?.name ?? '',
    aliases: joinList(initial?.aliases),
    category: initial?.category ?? 'STRENGTH',
    level: initial?.level ?? 'BEGINNER',
    muscles: joinList(initial?.primaryMuscles),
    secondary: joinList(initial?.secondaryMuscles),
    equipment: joinList(initial?.equipment),
    instructions: initial?.instructions ?? '',
    tips: initial?.tips ?? '',
    commonMistakes: initial?.commonMistakes ?? '',
  }));
  const [youtube, setYoutube] = useState(initial?.externalVideoUrl ?? '');
  const [videoId, setVideoId] = useState<string | null>(initial?.videoMediaId ?? null);
  const [imageId, setImageId] = useState<string | null>(initial?.imageMediaId ?? null);
  const save = useApiMutation<object, { id: string }>(
    initial ? 'PUT' : 'POST',
    initial ? `/v1/exercises/${initial.id}` : '/v1/exercises',
    {
      invalidate: ['/v1/exercises'],
      success: initial ? 'Exercício atualizado.' : 'Exercício criado.',
      onSuccess: (r) => onDone(r.id),
    },
  );
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const upload =
    (purpose: 'exercise_video' | 'exercise_image') =>
    ({
      file,
      onProgress,
      signal,
      resumeMediaId,
      onCreated,
    }: Parameters<React.ComponentProps<typeof Uploader>['upload']>[0]) =>
      uploadFile(client, file, {
        purpose,
        signal,
        onProgress: (p) => onProgress(p.ratio),
        ...(resumeMediaId ? { resumeMediaId } : {}),
        ...(onCreated ? { onCreated } : {}),
      });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          name: f.name,
          aliases: splitList(f.aliases),
          category: f.category,
          level: f.level,
          primaryMuscles: splitList(f.muscles),
          secondaryMuscles: splitList(f.secondary),
          equipment: splitList(f.equipment),
          instructions: f.instructions || null,
          tips: f.tips || null,
          commonMistakes: f.commonMistakes || null,
          videoMediaId: videoId,
          imageMediaId: imageId,
          gifMediaId: initial?.gifMediaId ?? null,
          externalVideoUrl: youtube.trim() || null,
          folderId: initial?.folderId ?? null,
        });
      }}
    >
      <Field label="Nome">
        <Input required value={f.name} onChange={(e) => set('name')(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={f.category} onValueChange={set('category')}>
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
        <Field label="Nível">
          <Select value={f.level} onValueChange={set('level')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ExerciseLevel.map((l) => (
                <SelectItem key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field
        label="Músculos principais (vírgula)"
        hint={`Ex.: ${MUSCLE_GROUPS.slice(0, 4).join(', ')}`}
      >
        <Input value={f.muscles} onChange={(e) => set('muscles')(e.target.value)} />
      </Field>
      <Field label="Músculos auxiliares (vírgula)">
        <Input value={f.secondary} onChange={(e) => set('secondary')(e.target.value)} />
      </Field>
      <Field label="Equipamentos (vírgula)">
        <Input value={f.equipment} onChange={(e) => set('equipment')(e.target.value)} />
      </Field>
      <Field label="Apelidos (vírgula)" hint="Outros nomes usados na busca.">
        <Input value={f.aliases} onChange={(e) => set('aliases')(e.target.value)} />
      </Field>
      <Field label="Como fazer">
        <Textarea value={f.instructions} onChange={(e) => set('instructions')(e.target.value)} />
      </Field>
      <Field label="Dicas">
        <Textarea value={f.tips} onChange={(e) => set('tips')(e.target.value)} />
      </Field>
      <Field label="Erros comuns">
        <Textarea
          value={f.commonMistakes}
          onChange={(e) => set('commonMistakes')(e.target.value)}
        />
      </Field>

      <YouTubeField value={youtube} onChange={setYoutube} />

      <LockedFeature locked={videos.locked} title="Vídeo e foto próprios" requiredPlan="PRO">
        <div className="flex flex-col gap-3">
          {videoId ? (
            <div className="flex items-center justify-between gap-2 rounded-control border border-border p-3 text-sm">
              <span>Vídeo próprio enviado.</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setVideoId(null)}>
                Remover
              </Button>
            </div>
          ) : (
            <Uploader
              accept="video/mp4,video/quicktime"
              maxBytes={500 * 1024 * 1024}
              label="Envie o vídeo do exercício"
              hint="MP4 ou MOV até 500 MB. Tem prioridade sobre o YouTube."
              upload={upload('exercise_video')}
              onUploaded={(id) => setVideoId(id)}
            />
          )}
          {imageId ? (
            <div className="flex items-center justify-between gap-2 rounded-control border border-border p-3 text-sm">
              <span>Foto própria enviada.</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setImageId(null)}>
                Remover
              </Button>
            </div>
          ) : (
            <Uploader
              accept="image/jpeg,image/png,image/webp"
              maxBytes={10 * 1024 * 1024}
              label="Envie uma foto do exercício"
              hint="JPG, PNG ou WEBP até 10 MB. Sem foto, a capa do vídeo é usada."
              upload={upload('exercise_image')}
              onUploaded={(id) => setImageId(id)}
            />
          )}
        </div>
      </LockedFeature>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={save.isPending}>
          {initial ? 'Salvar alterações' : 'Salvar exercício'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Painel lateral do exercício: detalhes e, para os próprios, edição. Os da biblioteca Vetta
 * são duplicados antes de editar (a API não deixa alterar o global).
 * `id === 'new'` abre direto o formulário de criação.
 */
export function ExerciseSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isNew = id === 'new';
  const detail = useApi<ExerciseDetail>(id && !isNew ? `/v1/exercises/${id}` : null);
  // Ao trocar de exercício volta para os detalhes, salvo quando é a cópia recém-criada.
  const editNext = useRef(false);
  useEffect(() => {
    setEditing(editNext.current);
    editNext.current = false;
  }, [id]);

  const duplicate = useApiMutation<{ id: string }, { id: string }>(
    'POST',
    (b) => `/v1/exercises/${b.id}/duplicate`,
    {
      invalidate: ['/v1/exercises'],
      success: 'Cópia criada na sua biblioteca. Agora é só editar.',
      onSuccess: (r) => {
        editNext.current = true;
        onOpenChange(r.id);
      },
    },
  );
  const remove = useApiMutation<{ id: string }>('DELETE', (b) => `/v1/exercises/${b.id}`, {
    invalidate: ['/v1/exercises'],
    success: 'Exercício excluído.',
    onSuccess: () => onOpenChange(null),
  });

  const e = detail.data;
  const title = isNew ? 'Novo exercício' : (e?.name ?? 'Exercício');
  return (
    <Sheet open={!!id} onOpenChange={(o) => (o ? null : onOpenChange(null))}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <div className="pr-10">
          <SheetTitle className="font-display text-xl break-words">
            {editing ? `Editar: ${title}` : title}
          </SheetTitle>
          <SheetDescription>
            {isNew
              ? 'Crie um exercício só seu, com vídeo próprio ou do YouTube.'
              : e
                ? joinList(e.primaryMuscles)
                : 'Carregando…'}
          </SheetDescription>
        </div>
        {isNew ? (
          <ExerciseForm
            onDone={(newId) => onOpenChange(newId)}
            onCancel={() => onOpenChange(null)}
          />
        ) : !e ? (
          <Skeleton className="h-96" />
        ) : editing ? (
          <ExerciseForm
            key={e.id}
            initial={e}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ExerciseView
            e={e}
            busy={duplicate.isPending}
            onEdit={() => setEditing(true)}
            onDuplicate={() => duplicate.mutate({ id: e.id })}
            onDelete={() => {
              if (confirm(`Excluir "${e.name}" da sua biblioteca?`)) remove.mutate({ id: e.id });
            }}
            onOpen={(other) => onOpenChange(other)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
