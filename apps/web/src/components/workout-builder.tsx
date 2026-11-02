'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { METHOD_LABEL, SET_TYPE_LABEL, SetType, TrainingMethod } from '@vetta/contracts';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@vetta/ui';
import { Copy, GripVertical, Link2, Link2Off, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

type SetT = (typeof SetType)[number];
interface BSet {
  type: SetT;
  reps: string;
  targetLoadKg: string;
  restSeconds: string;
  rpe: string;
  rir: string;
  cadence: string;
  notes: string;
}
interface BItem {
  key: string;
  id?: string;
  exerciseId: string;
  name: string;
  method: (typeof TrainingMethod)[number];
  groupId: string | null;
  notes: string;
  sets: BSet[];
}
interface BRoutine {
  key: string;
  id?: string;
  label: string;
  name: string;
  notes: string;
  items: BItem[];
}
export interface BuilderProgram {
  id?: string;
  name: string;
  goal: string;
  startsOn: string;
  endsOn: string;
  studentLinkId: string | null;
  isTemplate: boolean;
  isExtra: boolean;
  status?: string;
  publicToken?: string | null;
  /** Gerado pela IA: mostra o aviso de revisão enquanto for rascunho. */
  aiGenerated?: boolean;
  routines: BRoutine[];
}

const uid = () => Math.random().toString(36).slice(2, 10);
const emptySet = (): BSet => ({
  type: 'WORK',
  reps: '10',
  targetLoadKg: '',
  restSeconds: '60',
  rpe: '',
  rir: '',
  cadence: '',
  notes: '',
});
const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Converte a resposta da API para o estado do construtor. */
export function fromApi(p: {
  id: string;
  name: string;
  goal: string | null;
  startsOn: string | null;
  endsOn: string | null;
  studentLinkId: string | null;
  isTemplate: boolean;
  isExtra: boolean;
  status: string;
  publicToken: string | null;
  aiGenerated?: boolean;
  routines: {
    id: string;
    label: string;
    name: string | null;
    notes: string | null;
    exercises: {
      id: string;
      exerciseId: string;
      method: string;
      groupKey: string | null;
      notes: string | null;
      exercise: { name: string };
      sets: Record<string, unknown>[];
    }[];
  }[];
}): BuilderProgram {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id: p.id,
    name: p.name,
    goal: p.goal ?? '',
    startsOn: p.startsOn?.slice(0, 10) ?? '',
    endsOn: p.endsOn?.slice(0, 10) ?? '',
    studentLinkId: p.studentLinkId,
    isTemplate: p.isTemplate,
    isExtra: p.isExtra,
    status: p.status,
    publicToken: p.publicToken,
    aiGenerated: p.aiGenerated ?? false,
    routines: p.routines.map((r) => ({
      key: r.id,
      id: r.id,
      label: r.label,
      name: r.name ?? '',
      notes: r.notes ?? '',
      items: r.exercises.map((i) => ({
        key: i.id,
        id: i.id,
        exerciseId: i.exerciseId,
        name: i.exercise.name,
        method: i.method as BItem['method'],
        groupId: i.groupKey,
        notes: i.notes ?? '',
        sets: i.sets.map((x) => ({
          type: x.type as SetT,
          reps: s(x.reps),
          targetLoadKg: s(x.targetLoadKg),
          restSeconds: s(x.restSeconds),
          rpe: s(x.rpe),
          rir: s(x.rir),
          cadence: s(x.cadence),
          notes: s(x.notes),
        })),
      })),
    })),
  };
}

function toInput(p: BuilderProgram) {
  return {
    name: p.name,
    goal: p.goal || null,
    startsOn: p.startsOn || null,
    endsOn: p.endsOn || null,
    routines: p.routines.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      label: r.label,
      name: r.name || null,
      notes: r.notes || null,
      items: r.items.map((i) => ({
        ...(i.id ? { id: i.id } : {}),
        exerciseId: i.exerciseId,
        method: i.method,
        groupId: i.groupId,
        notes: i.notes || null,
        sets: i.sets.map((s) => ({
          type: s.type,
          reps: s.reps || null,
          targetLoadKg: n(s.targetLoadKg),
          restSeconds: n(s.restSeconds),
          rpe: n(s.rpe),
          rir: n(s.rir),
          cadence: s.cadence || null,
          notes: s.notes || null,
        })),
      })),
    })),
  };
}

function LibraryItem({
  e,
}: {
  e: { id: string; name: string; primaryMuscles: string[]; isGlobal: boolean };
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${e.id}`,
    data: e,
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-control border border-border bg-surface p-2 text-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="font-medium">{e.name}</p>
      <p className="text-xs text-muted-foreground">{e.primaryMuscles.join(', ')}</p>
    </li>
  );
}

function ItemCard({
  item,
  index,
  total,
  onChange,
  onRemove,
  onCombine,
  groupLabel,
}: {
  item: BItem;
  index: number;
  total: number;
  onChange: (i: BItem) => void;
  onRemove: () => void;
  onCombine: () => void;
  groupLabel: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `item:${item.key}`,
  });
  const setSet = (si: number, patch: Partial<BSet>) =>
    onChange({ ...item, sets: item.sets.map((s, k) => (k === si ? { ...s, ...patch } : s)) });
  const cell = 'h-9 w-full rounded-sm border border-input bg-surface px-2 text-sm';
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <Card className={`p-3 ${item.groupId ? 'border-l-4 border-l-action' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="cursor-grab p-2 text-muted-foreground"
            aria-label={`Arrastar ${item.name}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="font-semibold">
            {index + 1}. {item.name}
          </span>
          {groupLabel ? <Badge variant="action">{groupLabel}</Badge> : null}
          <div className="ml-auto flex items-center gap-1">
            <Select
              value={item.method}
              onValueChange={(v) => onChange({ ...item, method: v as BItem['method'] })}
            >
              <SelectTrigger className="h-9 w-36" aria-label="Método">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TrainingMethod.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {index < total - 1 || item.groupId ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCombine}
                aria-label={item.groupId ? 'Separar do grupo' : 'Combinar com o próximo (bi-set)'}
                title={item.groupId ? 'Separar' : 'Combinar com o próximo'}
              >
                {item.groupId ? <Link2Off /> : <Link2 />}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remover ${item.name}`}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-8">#</th>
                <th>Tipo</th>
                <th>Reps</th>
                <th>Carga (kg)</th>
                <th>Intervalo (s)</th>
                <th>RPE</th>
                <th>RIR</th>
                <th>Cadência</th>
                <th>Obs.</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {item.sets.map((s, si) => (
                <tr key={si}>
                  <td className="text-muted-foreground">{si + 1}</td>
                  <td>
                    <select
                      className={cell}
                      value={s.type}
                      onChange={(e) => setSet(si, { type: e.target.value as SetT })}
                      aria-label={`Tipo da série ${si + 1}`}
                    >
                      {SetType.map((t) => (
                        <option key={t} value={t}>
                          {SET_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(
                    [
                      'reps',
                      'targetLoadKg',
                      'restSeconds',
                      'rpe',
                      'rir',
                      'cadence',
                      'notes',
                    ] as const
                  ).map((k) => (
                    <td key={k}>
                      <input
                        className={cell}
                        value={s[k]}
                        inputMode={
                          ['targetLoadKg', 'restSeconds', 'rpe', 'rir'].includes(k)
                            ? 'decimal'
                            : undefined
                        }
                        onChange={(e) => setSet(si, { [k]: e.target.value })}
                        onKeyDown={(e) => {
                          // Enter na última série replica a série (atalho de teclado)
                          if (e.key === 'Enter' && si === item.sets.length - 1) {
                            e.preventDefault();
                            onChange({ ...item, sets: [...item.sets, { ...s }] });
                          }
                        }}
                        aria-label={`${k} da série ${si + 1}`}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="p-1 text-muted-foreground"
                      onClick={() =>
                        onChange({ ...item, sets: item.sets.filter((_, k) => k !== si) })
                      }
                      aria-label={`Remover série ${si + 1}`}
                      disabled={item.sets.length === 1}
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({ ...item, sets: [...item.sets, { ...(item.sets.at(-1) ?? emptySet()) }] })
            }
          >
            <Copy /> Replicar série
          </Button>
          <Input
            className="h-9 flex-1"
            placeholder="Observação do exercício"
            value={item.notes}
            onChange={(e) => onChange({ ...item, notes: e.target.value })}
            aria-label="Observação do exercício"
          />
        </div>
      </Card>
    </li>
  );
}

function RoutineDrop({ routine, children }: { routine: BRoutine; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `routine:${routine.key}` });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-40 rounded-card border-2 border-dashed p-3 ${isOver ? 'border-action bg-action/5' : 'border-transparent'}`}
    >
      {children}
    </div>
  );
}

export function WorkoutBuilder({ initial }: { initial: BuilderProgram }) {
  const client = useVettaClient();
  const router = useRouter();
  const { tenantId } = useActiveTenant();
  const templatesF = useFeature(tenantId, 'workouts.templates');
  const linkF = useFeature(tenantId, 'workouts.public_link');
  const applyF = useFeature(tenantId, 'workouts.group_apply');
  const [p, setP] = useState<BuilderProgram>(initial);
  const [active, setActive] = useState(initial.routines[0]?.key ?? '');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragName, setDragName] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const lib = useApi<{
    items: { id: string; name: string; primaryMuscles: string[]; isGlobal: boolean }[];
  }>(`/v1/exercises?limit=40${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    p.id && !p.studentLinkId ? '/v1/students' : initial.id ? null : '/v1/students',
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const routine = p.routines.find((r) => r.key === active);

  const setRoutine = (r: BRoutine) =>
    setP((cur) => ({ ...cur, routines: cur.routines.map((x) => (x.key === r.key ? r : x)) }));
  const addExercise = (e: { id: string; name: string }, at?: number) => {
    if (!routine) return;
    const item: BItem = {
      key: uid(),
      exerciseId: e.id,
      name: e.name,
      method: 'STANDARD',
      groupId: null,
      notes: '',
      sets: [emptySet(), emptySet(), emptySet()],
    };
    const items = [...routine.items];
    items.splice(at ?? items.length, 0, item);
    setRoutine({ ...routine, items });
  };

  const groupLabels = useMemo(() => {
    const out = new Map<string, string>();
    if (!routine) return out;
    const groups = new Map<string, number>();
    for (const i of routine.items)
      if (i.groupId) groups.set(i.groupId, (groups.get(i.groupId) ?? 0) + 1);
    for (const [g, count] of groups)
      out.set(g, count === 2 ? 'Bi-set' : count === 3 ? 'Tri-set' : 'Circuito');
    return out;
  }, [routine]);

  const onDragEnd = (ev: DragEndEvent) => {
    setDragName(null);
    if (!routine || !ev.over) return;
    const a = String(ev.active.id);
    const o = String(ev.over.id);
    if (a.startsWith('lib:')) {
      const at = o.startsWith('item:')
        ? routine.items.findIndex((i) => `item:${i.key}` === o)
        : undefined;
      addExercise(ev.active.data.current as { id: string; name: string }, at);
    } else if (a.startsWith('item:') && o.startsWith('item:') && a !== o) {
      const from = routine.items.findIndex((i) => `item:${i.key}` === a);
      const to = routine.items.findIndex((i) => `item:${i.key}` === o);
      setRoutine({ ...routine, items: arrayMove(routine.items, from, to) });
    }
  };

  const combine = (idx: number) => {
    if (!routine) return;
    const items = [...routine.items];
    const cur = items[idx]!;
    if (cur.groupId) {
      items[idx] = { ...cur, groupId: null, method: 'STANDARD' };
    } else {
      const g = items[idx + 1]?.groupId ?? uid();
      items[idx] = { ...cur, groupId: g, method: 'BI_SET' };
      items[idx + 1] = { ...items[idx + 1]!, groupId: g, method: 'BI_SET' };
    }
    setRoutine({ ...routine, items });
  };

  async function save(publish = false) {
    if (!p.name.trim()) return toast.error('Dê um nome ao treino.');
    setSaving(true);
    try {
      const body = toInput(p);
      if (p.id) {
        const r = await client.request<Parameters<typeof fromApi>[0]>(
          'PUT',
          `/v1/programs/${p.id}`,
          body,
        );
        let next = r;
        if (publish)
          next = await client.request<Parameters<typeof fromApi>[0]>(
            'POST',
            `/v1/programs/${p.id}/publish`,
          );
        setP(fromApi(next));
        toast.success(publish ? 'Treino publicado. O aluno foi avisado.' : 'Treino salvo.');
      } else {
        const r = await client.request<{ id: string }>('POST', '/v1/programs', {
          ...body,
          studentLinkId: p.studentLinkId,
          isTemplate: p.isTemplate,
          isExtra: p.isExtra,
          publish,
        });
        toast.success(publish ? 'Treino publicado. O aluno foi avisado.' : 'Treino criado.');
        router.replace(`/treinos/${r.id}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function publicLink() {
    try {
      const r = await client.request<{ url: string; whatsappUrl: string }>(
        'POST',
        `/v1/programs/${p.id}/public-link`,
      );
      await navigator.clipboard.writeText(r.url).catch(() => undefined);
      toast.success('Link copiado.', {
        action: {
          label: 'Enviar no WhatsApp',
          onClick: () => window.open(r.whatsappUrl, '_blank'),
        },
      });
      setP((cur) => ({ ...cur, publicToken: r.url.split('/t/')[1] ?? 'x' }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {p.aiGenerated && p.status === 'DRAFT' ? (
        <div role="note" className="rounded-card border border-warning bg-warning/10 p-3 text-sm">
          <strong>Rascunho gerado pela IA.</strong> As justificativas estão nas observações de cada
          rotina e exercício. Revise, ajuste o que precisar e só então publique para o aluno.
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nome do treino" className="min-w-64 flex-1">
          <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <Field label="Objetivo">
          <Input value={p.goal} onChange={(e) => setP({ ...p, goal: e.target.value })} />
        </Field>
        <Field label="Início">
          <Input
            type="date"
            value={p.startsOn}
            onChange={(e) => setP({ ...p, startsOn: e.target.value })}
          />
        </Field>
        <Field label="Troca prevista">
          <Input
            type="date"
            value={p.endsOn}
            onChange={(e) => setP({ ...p, endsOn: e.target.value })}
          />
        </Field>
      </div>
      {!p.id ? (
        <div className="flex flex-wrap items-end gap-4">
          {!p.isTemplate ? (
            <Field label="Aluno" className="min-w-64">
              <Select
                value={p.studentLinkId ?? undefined}
                onValueChange={(v) => setP({ ...p, studentLinkId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o aluno" />
                </SelectTrigger>
                <SelectContent>
                  {(students.data?.items ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <label className="flex min-h-11 items-center gap-2">
            <Checkbox
              checked={p.isTemplate}
              disabled={templatesF.locked}
              onCheckedChange={(v) => setP({ ...p, isTemplate: !!v, studentLinkId: null })}
            />{' '}
            Salvar como modelo
            {templatesF.locked ? <Badge variant="outline">Pro</Badge> : null}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <Checkbox checked={p.isExtra} onCheckedChange={(v) => setP({ ...p, isExtra: !!v })} />{' '}
            Treino extra temporário (expira na data de troca)
          </label>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(e) =>
          setDragName((e.active.data.current as { name?: string } | undefined)?.name ?? null)
        }
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="flex flex-col gap-2 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
            <Input
              placeholder="Buscar exercício (sem acento)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar exercício"
            />
            <p className="text-xs text-muted-foreground">Arraste para a rotina ou clique em +.</p>
            <ul className="flex flex-col gap-2 overflow-y-auto">
              {(lib.data?.items ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-1">
                  <div className="flex-1">
                    <LibraryItem e={e} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => addExercise(e)}
                    aria-label={`Adicionar ${e.name}`}
                  >
                    <Plus />
                  </Button>
                </div>
              ))}
            </ul>
          </aside>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Rotinas">
              {p.routines.map((r) => (
                <Button
                  key={r.key}
                  role="tab"
                  aria-selected={r.key === active}
                  variant={r.key === active ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setActive(r.key)}
                >
                  {r.label}
                  {r.name ? ` · ${r.name}` : ''}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const label = String.fromCharCode(65 + p.routines.length);
                  const r: BRoutine = { key: uid(), label, name: '', notes: '', items: [] };
                  setP({ ...p, routines: [...p.routines, r] });
                  setActive(r.key);
                }}
              >
                <Plus /> Rotina
              </Button>
            </div>
            {routine ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-xs"
                    placeholder="Nome da rotina (ex.: Inferiores)"
                    value={routine.name}
                    onChange={(e) => setRoutine({ ...routine, name: e.target.value })}
                    aria-label="Nome da rotina"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setP({ ...p, routines: p.routines.filter((r) => r.key !== routine.key) });
                      setActive(p.routines[0]?.key ?? '');
                    }}
                  >
                    <Trash2 /> Remover rotina
                  </Button>
                </div>
                <Textarea
                  placeholder="Observações da rotina"
                  value={routine.notes}
                  onChange={(e) => setRoutine({ ...routine, notes: e.target.value })}
                  aria-label="Observações da rotina"
                />
                <RoutineDrop routine={routine}>
                  <SortableContext
                    items={routine.items.map((i) => `item:${i.key}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex flex-col gap-3">
                      {routine.items.map((i, idx) => (
                        <ItemCard
                          key={i.key}
                          item={i}
                          index={idx}
                          total={routine.items.length}
                          groupLabel={i.groupId ? (groupLabels.get(i.groupId) ?? null) : null}
                          onChange={(ni) =>
                            setRoutine({
                              ...routine,
                              items: routine.items.map((x) => (x.key === i.key ? ni : x)),
                            })
                          }
                          onRemove={() =>
                            setRoutine({
                              ...routine,
                              items: routine.items.filter((x) => x.key !== i.key),
                            })
                          }
                          onCombine={() => combine(idx)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                  {!routine.items.length ? (
                    <p className="py-10 text-center text-muted-foreground">
                      Arraste exercícios da biblioteca para cá.
                    </p>
                  ) : null}
                </RoutineDrop>
              </>
            ) : (
              <p className="text-muted-foreground">Crie a primeira rotina (A).</p>
            )}
          </section>
        </div>
        <DragOverlay>
          {dragName ? (
            <div className="rounded-control border border-action bg-surface p-2 text-sm shadow-lg">
              {dragName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="sticky bottom-0 z-20 flex flex-wrap gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button variant="secondary" loading={saving} onClick={() => save(false)}>
          Salvar
        </Button>
        {!p.isTemplate ? (
          <Button variant="accent" loading={saving} onClick={() => save(true)}>
            {p.status === 'ACTIVE' ? 'Salvar e avisar o aluno' : 'Publicar para o aluno'}
          </Button>
        ) : null}
        {p.id ? (
          <>
            <LockedFeature
              locked={templatesF.locked}
              title="Salvar como modelo"
              mode="inline"
              requiredPlan="PRO"
            >
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    const r = await client.request<{ id: string }>(
                      'POST',
                      `/v1/programs/${p.id}/clone`,
                      { asTemplate: true, name: `${p.name} (modelo)` },
                    );
                    toast.success('Modelo criado.', {
                      action: { label: 'Abrir', onClick: () => router.push(`/treinos/${r.id}`) },
                    });
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                Salvar como modelo
              </Button>
            </LockedFeature>
            <Button variant="ghost" onClick={() => setApplyOpen(true)}>
              Aplicar a alunos
            </Button>
            {!p.isTemplate && p.studentLinkId ? (
              <LockedFeature
                locked={linkF.locked}
                title="Link público"
                mode="inline"
                requiredPlan="PRO"
              >
                <Button variant="ghost" onClick={publicLink}>
                  <MessageCircle /> Link público / WhatsApp
                </Button>
                {p.publicToken ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await client.request('DELETE', `/v1/programs/${p.id}/public-link`);
                      setP({ ...p, publicToken: null });
                      toast.success('Link revogado.');
                    }}
                  >
                    Revogar link
                  </Button>
                ) : null}
              </LockedFeature>
            ) : null}
          </>
        ) : null}
      </div>
      {p.id ? (
        <ApplyDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          programId={p.id}
          multiLocked={applyF.locked}
        />
      ) : null}
    </div>
  );
}

function ApplyDialog({
  open,
  onOpenChange,
  programId,
  multiLocked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  programId: string;
  multiLocked: boolean;
}) {
  const client = useVettaClient();
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    open ? '/v1/students?status=ACTIVE' : null,
  );
  const groups = useApi<{ id: string; name: string }[]>(open ? '/v1/student-groups' : null);
  const [ids, setIds] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar treino</DialogTitle>
        </DialogHeader>
        {multiLocked ? (
          <p className="text-sm text-muted-foreground">
            No seu plano, aplique a um aluno por vez. Aplicar a vários ou a um grupo é do plano Pro.
          </p>
        ) : null}
        {!multiLocked && groups.data?.length ? (
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger aria-label="Grupo">
              <SelectValue placeholder="Aplicar a um grupo" />
            </SelectTrigger>
            <SelectContent>
              {groups.data.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {(students.data?.items ?? []).map((s) => (
            <li key={s.id}>
              <label className="flex min-h-11 items-center gap-2">
                <Checkbox
                  checked={ids.includes(s.id)}
                  onCheckedChange={(v) =>
                    setIds((cur) =>
                      v ? (multiLocked ? [s.id] : [...cur, s.id]) : cur.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.displayName}
              </label>
            </li>
          ))}
        </ul>
        <Button
          loading={busy}
          disabled={!ids.length && !groupId}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await client.request<{ created: number }>(
                'POST',
                `/v1/programs/${programId}/apply`,
                { studentLinkIds: ids, ...(groupId ? { groupId } : {}), publish: true },
              );
              toast.success(`Treino publicado para ${r.created} aluno(s).`);
              onOpenChange(false);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Aplicar e publicar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
