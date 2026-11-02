'use client';

import { uploadFile } from '@vetta/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Uploader,
} from '@vetta/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { adminClient } from '@/lib/client';
import { fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface Lesson {
  id?: string;
  title: string;
  body: string | null;
  videoMediaId: string | null;
}
interface Content {
  id: string;
  type: 'COURSE' | 'EBOOK' | 'POST';
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  coverMediaId: string | null;
  fileMediaId: string | null;
  requiredPlan: 'PRO' | 'PRO_PLUS' | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  updatedAt: string;
  lessons: Lesson[];
}

const EMPTY = {
  type: 'POST' as Content['type'],
  slug: '',
  title: '',
  summary: '',
  body: '',
  coverMediaId: null as string | null,
  fileMediaId: null as string | null,
  requiredPlan: 'ALL',
  tags: '',
  status: 'DRAFT' as Content['status'],
  lessons: [] as Lesson[],
};
const TYPE_LABEL = { COURSE: 'Curso', EBOOK: 'E-book', POST: 'Post' };
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Conteúdos da Academy: cursos com aulas, e-books e posts, com plano mínimo. */
export default function AcademyAdmin() {
  const list = useAdminApi<Content[]>('/v1/admin/academy');
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const save = useAdminMutation<object>(
    editing && editing !== 'new' ? 'PUT' : 'POST',
    editing && editing !== 'new' ? `/v1/admin/academy/${editing}` : '/v1/admin/academy',
    {
      invalidate: ['/v1/admin/academy'],
      success: 'Conteúdo salvo.',
      onSuccess: () => setEditing(null),
    },
  );
  const remove = useAdminMutation<string>('DELETE', (id) => `/v1/admin/academy/${id}`, {
    invalidate: ['/v1/admin/academy'],
  });
  const open = (c?: Content) => {
    setEditing(c?.id ?? 'new');
    setF(
      c
        ? {
            type: c.type,
            slug: c.slug,
            title: c.title,
            summary: c.summary ?? '',
            body: c.body ?? '',
            coverMediaId: c.coverMediaId,
            fileMediaId: c.fileMediaId,
            requiredPlan: c.requiredPlan ?? 'ALL',
            tags: c.tags.join(', '),
            status: c.status,
            lessons: c.lessons,
          }
        : EMPTY,
    );
  };
  const upload = (onDone: (id: string) => void) => ({
    upload: ({
      file,
      onProgress,
      signal,
    }: {
      file: File;
      onProgress: (r: number) => void;
      signal: AbortSignal;
    }) =>
      uploadFile(adminClient, file, {
        purpose: 'academy_content',
        signal,
        onProgress: (x) => onProgress(x.ratio),
      }),
    onUploaded: onDone,
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">Academy</h1>
        <Button onClick={() => open()}>
          <Plus aria-hidden /> Novo conteúdo
        </Button>
      </div>
      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'Novo conteúdo' : 'Editar conteúdo'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate({
                  type: f.type,
                  slug: f.slug || slugify(f.title),
                  title: f.title,
                  summary: f.summary || null,
                  body: f.body || null,
                  coverMediaId: f.coverMediaId,
                  fileMediaId: f.fileMediaId,
                  requiredPlan: f.requiredPlan === 'ALL' ? null : f.requiredPlan,
                  tags: f.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                  status: f.status,
                  lessons: f.type === 'COURSE' ? f.lessons : [],
                });
              }}
            >
              <Field label="Tipo">
                <Select
                  value={f.type}
                  onValueChange={(v) => setF({ ...f, type: v as Content['type'] })}
                >
                  <SelectTrigger aria-label="Tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Acesso">
                <Select
                  value={f.requiredPlan}
                  onValueChange={(v) => setF({ ...f, requiredPlan: v })}
                >
                  <SelectTrigger aria-label="Acesso">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os planos</SelectItem>
                    <SelectItem value="PRO">Pro e Pro Plus</SelectItem>
                    <SelectItem value="PRO_PLUS">Só Pro Plus</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Título" className="md:col-span-2">
                <Input
                  required
                  value={f.title}
                  onChange={(e) => setF({ ...f, title: e.target.value })}
                />
              </Field>
              <Field label="Endereço (slug)" hint="Em branco = gerado do título">
                <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
              </Field>
              <Field label="Tags" hint="Separe por vírgula">
                <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
              </Field>
              <Field label="Resumo" className="md:col-span-2">
                <Textarea
                  maxLength={500}
                  value={f.summary}
                  onChange={(e) => setF({ ...f, summary: e.target.value })}
                />
              </Field>
              <Field label="Texto" className="md:col-span-2">
                <Textarea
                  rows={8}
                  value={f.body}
                  onChange={(e) => setF({ ...f, body: e.target.value })}
                />
              </Field>
              <div>
                <p className="mb-1 text-sm font-medium">Capa {f.coverMediaId ? '(enviada)' : ''}</p>
                <Uploader
                  accept="image/*"
                  label="Enviar capa"
                  {...upload((id) => setF((x) => ({ ...x, coverMediaId: id })))}
                />
              </div>
              {f.type === 'EBOOK' ? (
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Arquivo do e-book {f.fileMediaId ? '(enviado)' : ''}
                  </p>
                  <Uploader
                    accept="application/pdf"
                    label="Enviar PDF"
                    {...upload((id) => setF((x) => ({ ...x, fileMediaId: id })))}
                  />
                </div>
              ) : null}
              {f.type === 'COURSE' ? (
                <fieldset className="flex flex-col gap-3 md:col-span-2">
                  <legend className="mb-1 font-medium">Aulas</legend>
                  {f.lessons.map((l, i) => (
                    <div
                      key={l.id ?? i}
                      className="flex flex-col gap-2 rounded-control border border-border p-3"
                    >
                      <div className="flex items-end gap-2">
                        <Field label={`Aula ${i + 1}`} className="flex-1">
                          <Input
                            required
                            value={l.title}
                            onChange={(e) =>
                              setF({
                                ...f,
                                lessons: f.lessons.map((x, j) =>
                                  j === i ? { ...x, title: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remover aula ${i + 1}`}
                          onClick={() =>
                            setF({ ...f, lessons: f.lessons.filter((_, j) => j !== i) })
                          }
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                      <Uploader
                        accept="video/*"
                        label={l.videoMediaId ? 'Trocar vídeo' : 'Enviar vídeo da aula'}
                        {...upload((id) =>
                          setF((x) => ({
                            ...x,
                            lessons: x.lessons.map((y, j) =>
                              j === i ? { ...y, videoMediaId: id } : y,
                            ),
                          })),
                        )}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    className="self-start"
                    onClick={() =>
                      setF({
                        ...f,
                        lessons: [...f.lessons, { title: '', body: null, videoMediaId: null }],
                      })
                    }
                  >
                    <Plus aria-hidden /> Adicionar aula
                  </Button>
                </fieldset>
              ) : null}
              <Field label="Situação">
                <Select
                  value={f.status}
                  onValueChange={(v) => setF({ ...f, status: v as Content['status'] })}
                >
                  <SelectTrigger aria-label="Situação">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Rascunho</SelectItem>
                    <SelectItem value="PUBLISHED">Publicado</SelectItem>
                    <SelectItem value="ARCHIVED">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" loading={save.isPending}>
                  Salvar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="pt-4">
          <ul className="flex flex-col divide-y divide-border">
            {(list.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-3">
                <Badge variant="outline">{TYPE_LABEL[c.type]}</Badge>
                <span className="flex-1 font-medium">{c.title}</span>
                {c.requiredPlan ? (
                  <Badge variant="neutral">{c.requiredPlan.replace('_', ' ')}</Badge>
                ) : null}
                <Badge variant={c.status === 'PUBLISHED' ? 'success' : 'warning'}>
                  {c.status.toLowerCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">{fmtDateTime(c.updatedAt)}</span>
                <Button size="sm" variant="secondary" onClick={() => open(c)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Arquivar "${c.title}"?`)) remove.mutate(c.id);
                  }}
                >
                  Arquivar
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
