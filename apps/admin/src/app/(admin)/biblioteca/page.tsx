'use client';

import {
  CATEGORY_LABEL,
  EXERCISE_CSV_COLUMNS,
  ExerciseCategory,
  ExerciseLevel,
  type ExerciseInput,
} from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Uploader,
} from '@vetta/ui';
import { useState } from 'react';
import { adminClient } from '@/lib/client';
import { fmtBytes, fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface Exercise {
  id: string;
  code: string | null;
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
  media?: { video: string | null; thumbnail: string | null } | null;
}

const LEVEL: Record<ExerciseLevel, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};
const csv = (l: string[]) => l.join(', ');
const list = (s: string) =>
  s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);

const videoUpload =
  () =>
  ({
    file,
    onProgress,
    signal,
    resumeMediaId,
    onCreated,
  }: Parameters<Parameters<typeof Uploader>[0]['upload']>[0]) =>
    uploadFile(adminClient, file, {
      purpose: 'exercise_video',
      signal,
      onProgress: (p) => onProgress(p.ratio),
      ...(resumeMediaId ? { resumeMediaId } : {}),
      ...(onCreated ? { onCreated } : {}),
    });

function ExerciseDialog({ e, onClose }: { e: Exercise | 'new'; onClose: () => void }) {
  const base = e === 'new' ? null : e;
  const [f, setF] = useState({
    code: base?.code ?? '',
    name: base?.name ?? '',
    aliases: csv(base?.aliases ?? []),
    category: base?.category ?? ('STRENGTH' as ExerciseCategory),
    level: base?.level ?? ('BEGINNER' as ExerciseLevel),
    primaryMuscles: csv(base?.primaryMuscles ?? []),
    secondaryMuscles: csv(base?.secondaryMuscles ?? []),
    equipment: csv(base?.equipment ?? []),
    instructions: base?.instructions ?? '',
    tips: base?.tips ?? '',
    commonMistakes: base?.commonMistakes ?? '',
  });
  const [videoId, setVideoId] = useState<string | null>(base?.videoMediaId ?? null);
  const save = useAdminMutation<ExerciseInput>(
    base ? 'PUT' : 'POST',
    base ? `/v1/admin/exercises/${base.id}` : '/v1/admin/exercises',
    { invalidate: ['/v1/admin/exercises'], success: 'Exercício salvo.', onSuccess: onClose },
  );
  const text = (k: keyof typeof f, label: string, area = false) => (
    <Field label={label}>
      {area ? (
        <Textarea value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />
      ) : (
        <Input value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />
      )}
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{base ? `Editar ${base.name}` : 'Novo exercício global'}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            save.mutate({
              code: f.code || undefined,
              name: f.name,
              aliases: list(f.aliases),
              category: f.category,
              level: f.level,
              primaryMuscles: list(f.primaryMuscles),
              secondaryMuscles: list(f.secondaryMuscles),
              equipment: list(f.equipment),
              instructions: f.instructions || null,
              tips: f.tips || null,
              commonMistakes: f.commonMistakes || null,
              videoMediaId: videoId,
            });
          }}
        >
          {text('name', 'Nome')}
          {text('code', 'Código (único)')}
          <Field label="Tipo">
            <Select
              value={f.category}
              onValueChange={(v) => setF({ ...f, category: v as ExerciseCategory })}
            >
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
            <Select
              value={f.level}
              onValueChange={(v) => setF({ ...f, level: v as ExerciseLevel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ExerciseLevel.map((c) => (
                  <SelectItem key={c} value={c}>
                    {LEVEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {text('aliases', 'Apelidos (separados por vírgula)')}
          {text('equipment', 'Equipamentos')}
          {text('primaryMuscles', 'Músculos primários')}
          {text('secondaryMuscles', 'Músculos secundários')}
          <div className="sm:col-span-2">{text('instructions', 'Instruções', true)}</div>
          {text('tips', 'Dicas', true)}
          {text('commonMistakes', 'Erros comuns', true)}
          <div className="sm:col-span-2">
            <Uploader
              accept="video/mp4,video/quicktime"
              maxBytes={500 * 1024 * 1024}
              label={videoId ? 'Substituir vídeo' : 'Enviar vídeo'}
              hint="MP4 ou MOV até 500 MB. Convertido para HLS 360p/720p no worker."
              upload={videoUpload()}
              onUploaded={(id) => setVideoId(id)}
            />
          </div>
          <Button
            type="submit"
            className="sm:col-span-2"
            disabled={save.isPending || f.name.length < 2}
          >
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportResult {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
}

/** Importador: CSV com as colunas padrão + vídeos enviados antes (casados pelo nome do arquivo). */
function Importer() {
  const [text, setText] = useState('');
  const [videos, setVideos] = useState<{ fileName: string; mediaId: string }[]>([]);
  const [result, setResult] = useState<(ImportResult & { dryRun: boolean }) | null>(null);
  const run = useAdminMutation<
    { csv: string; videos: typeof videos; dryRun: boolean },
    ImportResult
  >('POST', '/v1/admin/exercises/import', { invalidate: ['/v1/admin/exercises'] });
  const go = (dryRun: boolean) =>
    run.mutate({ csv: text, videos, dryRun }, { onSuccess: (r) => setResult({ ...r, dryRun }) });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Colunas: {EXERCISE_CSV_COLUMNS.join(', ')}. A coluna <code>video</code> leva o nome do
        arquivo enviado abaixo. Linhas com o mesmo código são atualizadas.
      </p>
      <Field label="Arquivo CSV">
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
      </Field>
      <Uploader
        multiple
        accept="video/mp4,video/quicktime"
        maxBytes={500 * 1024 * 1024}
        label="Vídeos do lote"
        hint="Envie antes de importar; cada vídeo vira um item da fila de processamento."
        upload={videoUpload()}
        onUploaded={(mediaId, file) => setVideos((v) => [...v, { fileName: file.name, mediaId }])}
      />
      {videos.length ? (
        <p className="text-sm">{videos.length} vídeo(s) prontos para casar com o CSV.</p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!text || run.isPending} onClick={() => go(true)}>
          Validar (simulação)
        </Button>
        <Button disabled={!text || run.isPending} onClick={() => go(false)}>
          Importar
        </Button>
      </div>
      {result ? (
        <div className="rounded-control border border-border p-3 text-sm" role="status">
          {result.dryRun
            ? 'Simulação concluída.'
            : `${result.created} criados, ${result.updated} atualizados.`}{' '}
          {result.errors.length ? `${result.errors.length} aviso(s):` : 'Nenhum erro.'}
          <ul className="mt-2 list-disc pl-5">
            {result.errors.slice(0, 50).map((er, i) => (
              <li key={i}>
                Linha {er.line}: {er.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function VideoQueue() {
  const q = useAdminApi<
    {
      id: string;
      fileName: string;
      status: string;
      failureReason: string | null;
      createdAt: string;
      size: string | number;
    }[]
  >('/v1/admin/exercises/video-queue');
  if (!q.data) return <Skeleton className="h-40" />;
  if (!q.data.length)
    return <EmptyState title="Fila vazia" description="Todos os vídeos foram processados." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Arquivo</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead>Tamanho</TableHead>
          <TableHead>Enviado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {q.data.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{m.fileName}</TableCell>
            <TableCell>
              <Badge variant={m.status === 'FAILED' ? 'danger' : 'neutral'}>
                {m.status.toLowerCase()}
              </Badge>
              {m.failureReason ? (
                <span className="ml-2 text-sm text-danger">{m.failureReason}</span>
              ) : null}
            </TableCell>
            <TableCell>{fmtBytes(Number(m.size))}</TableCell>
            <TableCell>{fmtDateTime(m.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Biblioteca() {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const [withoutVideo, setWithoutVideo] = useState(false);
  const list = useAdminApi<{ items: Exercise[]; nextCursor: string | null }>(
    '/v1/admin/exercises',
    {
      q: q || undefined,
      limit: 100,
    },
  );
  const remove = useAdminMutation<{ id: string }>('DELETE', (b) => `/v1/admin/exercises/${b.id}`, {
    invalidate: ['/v1/admin/exercises'],
    success: 'Exercício removido (pode ser restaurado reimportando o código).',
  });
  const items = (list.data?.items ?? []).filter((e) => !withoutVideo || !e.videoMediaId);
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">Biblioteca global</h1>
        <Button onClick={() => setEditing('new')}>Novo exercício</Button>
      </div>
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Exercícios</TabsTrigger>
          <TabsTrigger value="importar">Importar</TabsTrigger>
          <TabsTrigger value="fila">Fila de vídeos</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Buscar (sem acento funciona)" className="w-80">
              <Input value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Switch checked={withoutVideo} onCheckedChange={setWithoutVideo} /> Só sem vídeo
            </label>
          </div>
          {!list.data ? (
            <Skeleton className="h-64" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercício</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Músculos</TableHead>
                  <TableHead>Vídeo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{e.code ?? '—'}</TableCell>
                    <TableCell>{CATEGORY_LABEL[e.category]}</TableCell>
                    <TableCell>{e.primaryMuscles.join(', ')}</TableCell>
                    <TableCell>{e.videoMediaId ? 'sim' : '—'}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          confirm(`Remover "${e.name}" da biblioteca global?`) &&
                          remove.mutate({ id: e.id })
                        }
                      >
                        Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        <TabsContent value="importar">
          <Importer />
        </TabsContent>
        <TabsContent value="fila">
          <VideoQueue />
        </TabsContent>
      </Tabs>
      {editing ? <ExerciseDialog e={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
