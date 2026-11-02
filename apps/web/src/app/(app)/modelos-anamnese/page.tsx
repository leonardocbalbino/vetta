'use client';

import {
  ANAMNESIS_QUESTION_LABEL,
  AnamnesisQuestionType,
  visibleQuestions,
  type AnamnesisQuestion,
} from '@vetta/contracts';
import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
} from '@vetta/ui';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AnamnesisField } from '@/components/pro/anamnesis-fields';
import { fmtDate, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Template {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  version: number;
  tenantId: string | null;
  schema: { questions: AnamnesisQuestion[] };
}
interface Assignment {
  id: string;
  template: { name: string };
  studentLink: { displayName: string };
  repeatEveryDays: number;
  nextDueOn: string;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'pergunta';

function Builder({ initial, onDone }: { initial?: Template; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [qs, setQs] = useState<AnamnesisQuestion[]>(
    initial?.schema.questions ?? [{ id: 'pergunta_1', type: 'yes_no', label: '', required: true }],
  );
  const [preview, setPreview] = useState<
    Record<string, string | number | boolean | string[] | null | undefined>
  >({});
  const save = useApiMutation<object>(
    initial ? 'PUT' : 'POST',
    initial ? `/v1/anamnesis/templates/${initial.id}` : '/v1/anamnesis/templates',
    {
      invalidate: ['/v1/anamnesis/templates'],
      success: initial ? 'Modelo atualizado (nova versão).' : 'Modelo criado.',
      onSuccess: onDone,
    },
  );
  const update = (i: number, patch: Partial<AnamnesisQuestion>) =>
    setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...qs];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    setQs(next);
  };
  const ids = new Set<string>();
  const normalized = qs.map((q, i) => {
    let id = q.id || slug(q.label) || `pergunta_${i + 1}`;
    while (ids.has(id)) id = `${id}_${i + 1}`;
    ids.add(id);
    return { ...q, id };
  });
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ name, description: description || null, questions: normalized });
        }}
      >
        <Field label="Nome do modelo">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {qs.map((q, i) => {
          const earlier = normalized.slice(0, i);
          const cond = q.showIf ? earlier.find((x) => x.id === q.showIf!.questionId) : undefined;
          return (
            <Card key={i}>
              <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
                <Field label={`Pergunta ${i + 1}`} className="sm:col-span-2">
                  <Input
                    required
                    value={q.label}
                    onChange={(e) =>
                      update(i, {
                        label: e.target.value,
                        ...(initial ? {} : { id: slug(e.target.value) }),
                      })
                    }
                  />
                </Field>
                <Field label="Tipo">
                  <Select
                    value={q.type}
                    onValueChange={(v) =>
                      update(i, {
                        type: v as AnamnesisQuestion['type'],
                        ...(v === 'scale' ? { min: 0, max: 10 } : {}),
                      })
                    }
                  >
                    <SelectTrigger aria-label="Tipo de resposta">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AnamnesisQuestionType.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ANAMNESIS_QUESTION_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <label className="flex min-h-11 items-center gap-2 self-end">
                  <Checkbox
                    checked={!!q.required}
                    onCheckedChange={(v) => update(i, { required: !!v })}
                  />{' '}
                  Obrigatória
                </label>
                {q.type === 'single_choice' || q.type === 'multi_choice' ? (
                  <Field label="Opções (uma por linha)" className="sm:col-span-2">
                    <Textarea
                      value={(q.options ?? []).join('\n')}
                      onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                    />
                  </Field>
                ) : null}
                {q.type === 'number' || q.type === 'scale' ? (
                  <>
                    <Field label="Mínimo">
                      <Input
                        type="number"
                        value={q.min ?? ''}
                        onChange={(e) =>
                          update(i, {
                            min: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Máximo">
                      <Input
                        type="number"
                        value={q.max ?? ''}
                        onChange={(e) =>
                          update(i, {
                            max: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </>
                ) : null}
                <Field label="Texto de ajuda" className="sm:col-span-2">
                  <Input
                    value={q.help ?? ''}
                    onChange={(e) => update(i, { help: e.target.value || undefined })}
                  />
                </Field>
                {earlier.length ? (
                  <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                    <Field label="Mostrar só se a pergunta">
                      <Select
                        value={q.showIf?.questionId ?? 'always'}
                        onValueChange={(v) =>
                          update(i, {
                            showIf: v === 'always' ? undefined : { questionId: v, equals: true },
                          })
                        }
                      >
                        <SelectTrigger aria-label="Condição">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="always">Sempre mostrar</SelectItem>
                          {earlier
                            .filter((x) =>
                              ['yes_no', 'single_choice', 'multi_choice'].includes(x.type),
                            )
                            .map((x) => (
                              <SelectItem key={x.id} value={x.id}>
                                {x.label || x.id}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {cond ? (
                      <Field label="for igual a">
                        {cond.type === 'yes_no' ? (
                          <Select
                            value={String(q.showIf!.equals)}
                            onValueChange={(v) =>
                              update(i, { showIf: { questionId: cond.id, equals: v === 'true' } })
                            }
                          >
                            <SelectTrigger aria-label="Valor da condição">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Sim</SelectItem>
                              <SelectItem value="false">Não</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={String(q.showIf!.equals)}
                            onValueChange={(v) =>
                              update(i, { showIf: { questionId: cond.id, equals: v } })
                            }
                          >
                            <SelectTrigger aria-label="Valor da condição">
                              <SelectValue placeholder="Escolha" />
                            </SelectTrigger>
                            <SelectContent>
                              {(cond.options ?? []).filter(Boolean).map((o) => (
                                <SelectItem key={o} value={o}>
                                  {o}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </Field>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex gap-1 sm:col-span-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Descer"
                    disabled={i === qs.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remover pergunta"
                    onClick={() => setQs(qs.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setQs([...qs, { id: `pergunta_${qs.length + 1}`, type: 'text', label: '' }])
            }
          >
            <Plus /> Pergunta
          </Button>
          <Button type="submit" loading={save.isPending}>
            Salvar modelo
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Prévia (como o aluno vê)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {visibleQuestions(normalized, preview).map((q) => (
            <div key={q.id} className="flex flex-col gap-2">
              <p className="font-medium">
                {q.label || '(sem texto)'}
                {q.required ? ' *' : ''}
              </p>
              <AnamnesisField
                q={q}
                value={preview[q.id]}
                onChange={(v) => setPreview({ ...preview, [q.id]: v })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Assignments({ templates }: { templates: Template[] }) {
  const list = useApi<Assignment[]>('/v1/anamnesis/assignments');
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    '/v1/students?status=ACTIVE',
  );
  const [f, setF] = useState({ templateId: '', days: '90', students: [] as string[] });
  const assign = useApiMutation<object>('POST', '/v1/anamnesis/assignments', {
    invalidate: ['/v1/anamnesis/assignments'],
    success: 'Reaplicação programada.',
  });
  const remove = useApiMutation<string>('DELETE', (id) => `/v1/anamnesis/assignments/${id}`, {
    invalidate: ['/v1/anamnesis/assignments'],
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reaplicação periódica</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            assign.mutate({
              templateId: f.templateId,
              studentLinkIds: f.students,
              repeatEveryDays: Number(f.days),
            });
          }}
        >
          <Field label="Modelo">
            <Select value={f.templateId} onValueChange={(v) => setF({ ...f, templateId: v })}>
              <SelectTrigger aria-label="Modelo">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Repetir a cada (dias)">
            <Input
              type="number"
              min={7}
              max={730}
              value={f.days}
              onChange={(e) => setF({ ...f, days: e.target.value })}
            />
          </Field>
          <Button
            type="submit"
            className="self-end"
            loading={assign.isPending}
            disabled={!f.templateId || !f.students.length}
          >
            Programar
          </Button>
          <fieldset className="flex max-h-40 flex-wrap gap-x-4 overflow-y-auto sm:col-span-3">
            <legend className="mb-1 text-sm font-medium">Alunos</legend>
            {(students.data?.items ?? []).map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-2">
                <Checkbox
                  checked={f.students.includes(s.id)}
                  onCheckedChange={(c) =>
                    setF({
                      ...f,
                      students: c ? [...f.students, s.id] : f.students.filter((x) => x !== s.id),
                    })
                  }
                />
                {s.displayName}
              </label>
            ))}
          </fieldset>
        </form>
        <ul className="divide-y divide-border text-sm">
          {(list.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">
                {a.studentLink.displayName} · {a.template.name} · a cada {a.repeatEveryDays} dias ·
                próxima {fmtDate(a.nextDueOn)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Parar reaplicação"
                onClick={() => remove.mutate(a.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Construtor de anamnese (texto, número, escolhas, escala, data, arquivo, assinatura e condicionais). */
export default function TemplatesPage() {
  const { tenantId } = useActiveTenant();
  const custom = useFeature(tenantId, 'assessment.anamnesis_custom');
  const templates = useApi<Template[]>('/v1/anamnesis/templates');
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const del = useApiMutation<string>('DELETE', (id) => `/v1/anamnesis/templates/${id}`, {
    invalidate: ['/v1/anamnesis/templates'],
  });
  if (!templates.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Modelos de anamnese</h1>
      {editing ? (
        <Builder
          initial={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <>
          <LockedFeature
            locked={custom.locked}
            title="Anamnese personalizada"
            requiredPlan="PRO"
            mode="card"
          >
            <Button className="self-start" onClick={() => setEditing('new')}>
              <Plus /> Novo modelo
            </Button>
          </LockedFeature>
          <ul className="grid gap-3 md:grid-cols-2">
            {templates.data.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 rounded-card border border-border p-4">
                <p className="flex items-center gap-2 font-semibold">
                  {t.name}{' '}
                  {t.tenantId ? (
                    <Badge variant="outline">v{t.version}</Badge>
                  ) : (
                    <Badge variant="neutral">pronto</Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.schema.questions.length} perguntas
                </p>
                {t.tenantId && !custom.locked ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        confirm(
                          'Excluir este modelo? Respostas já enviadas continuam guardadas.',
                        ) && del.mutate(t.id)
                      }
                    >
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Assignments templates={templates.data} />
        </>
      )}
    </div>
  );
}
