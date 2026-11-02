'use client';

import {
  CYCLE_LABEL,
  DOCUMENT_CATEGORY_LABEL,
  POSTURE_DEVIATION_LABEL,
  PostureDeviation,
  StudentDocumentCategory,
} from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  cn,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  Uploader,
} from '@vetta/ui';
import { FileText, Grid3x3, MousePointer2, Slash, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { brl, fmtDate, localDay, useApi, useApiMutation } from '@/lib/api';
import { ChatPanel } from './chat';
import { InvoiceStatus } from './payments';

// ─── Documentos ──────────────────────────────────────────────────────────────

export interface StudentDoc {
  id: string;
  title: string;
  category: keyof typeof DOCUMENT_CATEGORY_LABEL;
  visibleToStudent: boolean;
  createdAt: string;
  file: {
    mimeType: string;
    size: number;
    status: string;
    fileName: string;
    url: string | null;
    previewUrl: string | null;
  } | null;
}

/** Pasta de documentos do aluno (exames, plano alimentar, contratos). */
export function DocumentsPanel({
  studentLinkId,
  staff,
}: {
  studentLinkId: string;
  staff: boolean;
}) {
  const client = useVettaClient();
  const docs = useApi<StudentDoc[]>(`/v1/students/${studentLinkId}/documents`);
  const [meta, setMeta] = useState({
    title: '',
    category: 'EXAM' as StudentDoc['category'],
    visible: true,
  });
  const [viewing, setViewing] = useState<StudentDoc | null>(null);
  const add = useApiMutation<object>('POST', `/v1/students/${studentLinkId}/documents`, {
    invalidate: [`/v1/students/${studentLinkId}/documents`],
    success: 'Documento salvo.',
  });
  const toggle = useApiMutation<{ id: string; visibleToStudent: boolean }>(
    'PATCH',
    (b) => `/v1/documents/${b.id}`,
    { invalidate: [`/v1/students/${studentLinkId}/documents`] },
  );
  const del = useApiMutation<string>('DELETE', (id) => `/v1/documents/${id}`, {
    invalidate: [`/v1/students/${studentLinkId}/documents`],
  });
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3">
          <Field label="Título">
            <Input
              value={meta.title}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              placeholder="Ex.: Hemograma março"
            />
          </Field>
          <Field label="Categoria">
            <Select
              value={meta.category}
              onValueChange={(v) => setMeta({ ...meta, category: v as StudentDoc['category'] })}
            >
              <SelectTrigger aria-label="Categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {StudentDocumentCategory.map((c) => (
                  <SelectItem key={c} value={c}>
                    {DOCUMENT_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {staff ? (
            <label className="flex min-h-11 items-center gap-2 self-end">
              <Checkbox
                checked={meta.visible}
                onCheckedChange={(v) => setMeta({ ...meta, visible: !!v })}
              />{' '}
              Visível para o aluno
            </label>
          ) : null}
          <Uploader
            className="md:col-span-3"
            accept="application/pdf,image/jpeg,image/png"
            maxBytes={20 * 1024 * 1024}
            label="Enviar PDF ou imagem (até 20 MB)"
            upload={({ file, onProgress, signal }) =>
              uploadFile(client, file, {
                purpose: 'document',
                studentLinkId,
                signal,
                onProgress: (p) => onProgress(p.ratio),
              })
            }
            onUploaded={(mediaId, file) =>
              add.mutate({
                mediaId,
                title: meta.title.trim() || file.name,
                category: meta.category,
                visibleToStudent: meta.visible,
              })
            }
          />
        </CardContent>
      </Card>
      {!docs.data ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {docs.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <FileText className="size-5 text-muted-foreground" aria-hidden />
              <button
                type="button"
                className="flex-1 text-left font-medium hover:underline"
                onClick={() => setViewing(d)}
                disabled={!d.file?.url}
              >
                {d.title}
              </button>
              <Badge variant="outline">{DOCUMENT_CATEGORY_LABEL[d.category]}</Badge>
              <span className="text-muted-foreground">{fmtDate(d.createdAt)}</span>
              {d.file?.status !== 'READY' ? <Badge variant="warning">processando</Badge> : null}
              {staff ? (
                <label className="flex items-center gap-1">
                  <Checkbox
                    checked={d.visibleToStudent}
                    onCheckedChange={(v) => toggle.mutate({ id: d.id, visibleToStudent: !!v })}
                  />{' '}
                  aluno vê
                </label>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir"
                onClick={() => confirm('Excluir este documento?') && del.mutate(d.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {!docs.data.length ? (
            <li className="p-3 text-muted-foreground">Nenhum documento ainda.</li>
          ) : null}
        </ul>
      )}
      {viewing?.file?.url ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {viewing.title}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setViewing(null)}
              >
                Fechar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {viewing.file.mimeType === 'application/pdf' ? (
              <iframe
                src={viewing.file.url}
                title={viewing.title}
                className="h-[70dvh] w-full rounded-control border border-border"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewing.file.url}
                alt={viewing.title}
                className="max-h-[70dvh] rounded-control"
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ─── Financeiro do aluno ─────────────────────────────────────────────────────

export function StudentFinancePanel({ studentLinkId }: { studentLinkId: string }) {
  const subs = useApi<
    {
      id: string;
      status: string;
      consultingPlan: { name: string; cycle: keyof typeof CYCLE_LABEL };
      priceCents: number;
      endsAt: string | null;
      canceledAt: string | null;
    }[]
  >(`/v1/finance/subscriptions?studentLinkId=${studentLinkId}`);
  const invoices = useApi<
    { id: string; description: string; amountCents: number; status: string; dueDate: string }[]
  >(`/v1/finance/invoices?studentLinkId=${studentLinkId}`);
  const cancel = useApiMutation<string>('POST', (id) => `/v1/finance/subscriptions/${id}/cancel`, {
    invalidate: ['/v1/finance'],
    success: 'Plano cancelado. O acesso vai até o fim do período pago.',
  });
  return (
    <div className="flex flex-col gap-4">
      <Button asChild className="self-start">
        <Link href="/financeiro?aba=vender">Vender um plano</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Planos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {(subs.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  {s.consultingPlan.name} · {brl(s.priceCents)} /{' '}
                  {CYCLE_LABEL[s.consultingPlan.cycle].toLowerCase()}
                </span>
                <Badge
                  variant={
                    s.status === 'ACTIVE'
                      ? 'success'
                      : s.status === 'OVERDUE'
                        ? 'danger'
                        : 'outline'
                  }
                >
                  {s.status === 'ACTIVE'
                    ? 'ativo'
                    : s.status === 'OVERDUE'
                      ? 'em atraso'
                      : s.status === 'PENDING'
                        ? 'aguardando pagamento'
                        : s.status === 'ENDED'
                          ? 'encerrado'
                          : 'cancelado'}
                </Badge>
                {s.endsAt ? (
                  <span className="text-muted-foreground">até {fmtDate(s.endsAt)}</span>
                ) : null}
                {!s.canceledAt && ['ACTIVE', 'OVERDUE', 'PENDING'].includes(s.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => confirm('Cancelar o plano deste aluno?') && cancel.mutate(s.id)}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </li>
            ))}
            {!subs.data?.length ? (
              <li className="text-muted-foreground">Nenhum plano vendido.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {(invoices.data ?? []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex-1">{i.description}</span>
                <span>vence {fmtDate(i.dueDate)}</span>
                <span className="tabular-nums">{brl(i.amountCents)}</span>
                <InvoiceStatus status={i.status} />
              </li>
            ))}
            {!invoices.data?.length ? (
              <li className="py-2 text-muted-foreground">Sem cobranças.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export function StudentChatTab({ studentLinkId, name }: { studentLinkId: string; name: string }) {
  const client = useVettaClient();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    void client
      .request<{ id: string }>('POST', `/v1/chat/students/${studentLinkId}`)
      .then((c) => setId(c.id));
  }, [client, studentLinkId]);
  return id ? <ChatPanel conversationId={id} staff title={name} /> : <Skeleton className="h-96" />;
}

// ─── Avaliação postural ──────────────────────────────────────────────────────

type Marker =
  | { kind: 'point'; x: number; y: number; label?: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; label?: string };
interface PosturePhoto {
  id: string;
  view: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';
  mediaId: string;
  markers: Marker[];
  url: string | null;
  status: string;
}
interface Posture {
  id: string;
  assessedAt: string;
  findings: Record<string, string>;
  notes: string | null;
  photos: PosturePhoto[];
}

const VIEWS: { key: PosturePhoto['view']; label: string }[] = [
  { key: 'FRONT', label: 'Frente' },
  { key: 'BACK', label: 'Costas' },
  { key: 'LEFT', label: 'Perfil esquerdo' },
  { key: 'RIGHT', label: 'Perfil direito' },
];

/** Foto com grade sobreposta; clique marca ponto, ou dois cliques traçam uma linha. */
function MarkerCanvas({
  url,
  markers,
  onChange,
  readOnly,
}: {
  url: string;
  markers: Marker[];
  onChange?: (m: Marker[]) => void;
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<'point' | 'line'>('point');
  const [grid, setGrid] = useState(true);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly || !onChange) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = {
      x: Number(((e.clientX - r.left) / r.width).toFixed(4)),
      y: Number(((e.clientY - r.top) / r.height).toFixed(4)),
    };
    if (mode === 'point') return onChange([...markers, { kind: 'point', ...p }]);
    if (!start) return setStart(p);
    onChange([...markers, { kind: 'line', x1: start.x, y1: start.y, x2: p.x, y2: p.y }]);
    setStart(null);
  };
  return (
    <div className="flex flex-col gap-2">
      {!readOnly ? (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === 'point' ? 'primary' : 'secondary'}
            onClick={() => setMode('point')}
          >
            <MousePointer2 /> Ponto
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'line' ? 'primary' : 'secondary'}
            onClick={() => setMode('line')}
          >
            <Slash /> Linha
          </Button>
          <Button
            type="button"
            size="sm"
            variant={grid ? 'primary' : 'secondary'}
            onClick={() => setGrid(!grid)}
            aria-pressed={grid}
          >
            <Grid3x3 /> Grade
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange?.(markers.slice(0, -1));
              setStart(null);
            }}
            disabled={!markers.length}
          >
            Desfazer
          </Button>
        </div>
      ) : null}
      <div className="relative w-full max-w-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Foto postural" className="w-full rounded-control" />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={cn('absolute inset-0 size-full', !readOnly && 'cursor-crosshair')}
          onClick={click}
          role={readOnly ? 'img' : 'application'}
          aria-label="Marcações posturais"
        >
          {grid
            ? Array.from({ length: 9 }, (_, i) => (
                <g key={i} stroke="#2F5BFF" strokeOpacity="0.35" strokeWidth="0.3">
                  <line x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" />
                  <line x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} />
                </g>
              ))
            : null}
          {grid ? (
            <line x1="50" y1="0" x2="50" y2="100" stroke="#C6F432" strokeWidth="0.6" />
          ) : null}
          {markers.map((m, i) =>
            m.kind === 'point' ? (
              <circle
                key={i}
                cx={m.x * 100}
                cy={m.y * 100}
                r="1.4"
                fill="#D03838"
                stroke="#fff"
                strokeWidth="0.4"
              />
            ) : (
              <line
                key={i}
                x1={m.x1 * 100}
                y1={m.y1 * 100}
                x2={m.x2 * 100}
                y2={m.y2 * 100}
                stroke="#D03838"
                strokeWidth="0.8"
              />
            ),
          )}
          {start ? <circle cx={start.x * 100} cy={start.y * 100} r="1.2" fill="#C98A0B" /> : null}
        </svg>
      </div>
    </div>
  );
}

function PostureEditor({
  studentLinkId,
  existing,
  onDone,
}: {
  studentLinkId: string;
  existing?: Posture;
  onDone: () => void;
}) {
  const client = useVettaClient();
  const [findings, setFindings] = useState<Record<string, string>>(existing?.findings ?? {});
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [photos, setPhotos] = useState<
    Record<string, { mediaId: string; url: string | null; markers: Marker[] }>
  >(
    Object.fromEntries(
      (existing?.photos ?? []).map((p) => [
        p.view,
        { mediaId: p.mediaId, url: p.url, markers: p.markers },
      ]),
    ),
  );
  const save = useApiMutation<object>(
    existing ? 'PUT' : 'POST',
    existing ? `/v1/posture/${existing.id}` : `/v1/students/${studentLinkId}/posture`,
    {
      invalidate: [`/v1/students/${studentLinkId}/posture`, '/v1/posture'],
      success: 'Avaliação postural salva.',
      onSuccess: onDone,
    },
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {VIEWS.map((v) => {
          const p = photos[v.key];
          return (
            <div key={v.key} className="flex flex-col gap-2">
              <p className="font-semibold">{v.label}</p>
              {p?.url ? (
                <MarkerCanvas
                  url={p.url}
                  markers={p.markers}
                  onChange={(m) => setPhotos({ ...photos, [v.key]: { ...p, markers: m } })}
                />
              ) : p ? (
                <p className="text-sm text-muted-foreground">
                  Foto enviada, processando… você pode salvar e marcar depois.
                </p>
              ) : null}
              <Uploader
                accept="image/jpeg,image/png,image/heic"
                maxBytes={15 * 1024 * 1024}
                label={p ? 'Trocar foto' : 'Enviar foto'}
                upload={({ file, onProgress, signal }) =>
                  uploadFile(client, file, {
                    purpose: 'posture_photo',
                    studentLinkId,
                    signal,
                    onProgress: (x) => onProgress(x.ratio),
                  })
                }
                onUploaded={(mediaId, file) =>
                  setPhotos({
                    ...photos,
                    [v.key]: { mediaId, url: URL.createObjectURL(file), markers: [] },
                  })
                }
              />
            </div>
          );
        })}
      </div>
      <fieldset>
        <legend className="mb-2 font-semibold">Checklist de desvios</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PostureDeviation.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <Checkbox
                id={`dev-${d}`}
                checked={!!findings[d]}
                onCheckedChange={(c) => {
                  const f = { ...findings };
                  if (c) f[d] = 'leve';
                  else delete f[d];
                  setFindings(f);
                }}
              />
              <label htmlFor={`dev-${d}`} className="flex-1 text-sm">
                {POSTURE_DEVIATION_LABEL[d]}
              </label>
              {findings[d] ? (
                <Select
                  value={findings[d]}
                  onValueChange={(v) => setFindings({ ...findings, [d]: v })}
                >
                  <SelectTrigger
                    className="h-9 w-32"
                    aria-label={`Grau: ${POSTURE_DEVIATION_LABEL[d]}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leve">Leve</SelectItem>
                    <SelectItem value="moderado">Moderado</SelectItem>
                    <SelectItem value="acentuado">Acentuado</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ))}
        </div>
      </fieldset>
      <Field label="Observações">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button
        className="self-start"
        loading={save.isPending}
        onClick={() =>
          save.mutate({
            findings,
            notes: notes || null,
            photos: Object.entries(photos).map(([view, p]) => ({
              view,
              mediaId: p.mediaId,
              markers: p.markers,
            })),
          })
        }
      >
        Salvar avaliação postural
      </Button>
    </div>
  );
}

interface Compare {
  assessments: Posture[];
  views: { view: string; photos: (PosturePhoto | null)[] }[];
  changes: {
    deviation: string;
    from: string | null;
    to: string | null;
    trend: 'improved' | 'worse' | 'same';
  }[];
}

export function PosturePanel({ studentLinkId, staff }: { studentLinkId: string; staff: boolean }) {
  const list = useApi<Posture[]>(`/v1/students/${studentLinkId}/posture`);
  const [mode, setMode] = useState<'list' | 'new' | Posture>('list');
  const [sel, setSel] = useState<string[]>([]);
  const cmp = useApi<Compare>(sel.length >= 2 ? `/v1/posture/compare?ids=${sel.join(',')}` : null);
  if (mode !== 'list')
    return (
      <PostureEditor
        studentLinkId={studentLinkId}
        existing={mode === 'new' ? undefined : mode}
        onDone={() => setMode('list')}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      {staff ? (
        <Button className="self-start" onClick={() => setMode('new')}>
          Nova avaliação postural
        </Button>
      ) : null}
      {!list.data ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.data.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
            >
              <Checkbox
                aria-label="Comparar"
                checked={sel.includes(a.id)}
                onCheckedChange={(c) =>
                  setSel(c ? [...sel, a.id].slice(-4) : sel.filter((x) => x !== a.id))
                }
              />
              <span className="flex-1">
                {fmtDate(a.assessedAt)} · {Object.keys(a.findings).length} desvios ·{' '}
                {a.photos.length} fotos
              </span>
              {staff ? (
                <Button size="sm" variant="secondary" onClick={() => setMode(a)}>
                  Abrir
                </Button>
              ) : null}
            </li>
          ))}
          {!list.data.length ? (
            <li className="text-muted-foreground">Nenhuma avaliação postural ainda.</li>
          ) : null}
        </ul>
      )}
      {sel.length < 2 && list.data && list.data.length >= 2 ? (
        <p className="text-sm text-muted-foreground">
          Marque duas ou mais avaliações para comparar.
        </p>
      ) : null}
      {cmp.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Comparativo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {cmp.data.views
              .filter((v) => v.photos.some(Boolean))
              .map((v) => (
                <div key={v.view}>
                  <p className="mb-2 font-semibold">{VIEWS.find((x) => x.key === v.view)?.label}</p>
                  <div className="flex flex-wrap gap-3">
                    {v.photos.map((p, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(cmp.data!.assessments[i]!.assessedAt)}
                        </span>
                        {p?.url ? (
                          <MarkerCanvas url={p.url} markers={p.markers} readOnly />
                        ) : (
                          <span className="text-sm text-muted-foreground">sem foto</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            <ul className="text-sm">
              {cmp.data.changes.map((c) => (
                <li key={c.deviation} className="flex gap-2">
                  <span className="flex-1">
                    {POSTURE_DEVIATION_LABEL[c.deviation as keyof typeof POSTURE_DEVIATION_LABEL] ??
                      c.deviation}
                  </span>
                  <span>
                    {c.from ?? '—'} → {c.to ?? '—'}
                  </span>
                  <Badge
                    variant={
                      c.trend === 'improved'
                        ? 'success'
                        : c.trend === 'worse'
                          ? 'danger'
                          : 'outline'
                    }
                  >
                    {c.trend === 'improved' ? 'melhorou' : c.trend === 'worse' ? 'piorou' : 'igual'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ─── Periodização ────────────────────────────────────────────────────────────

interface Phase {
  id?: string;
  name: string;
  focus: string | null;
  weeks: number;
  programId: string | null;
  progression: Progression;
}
interface Progression {
  model: 'LINEAR' | 'UNDULATING' | 'BLOCK';
  base?: Step;
  perWeek?: Step;
  wave?: Step[];
  deloadEvery?: number;
}
interface Step {
  loadPct?: number;
  repsDelta?: number;
  setsDelta?: number;
}
interface PeriodizationView {
  id: string;
  name: string;
  model: Progression['model'];
  startsOn: string;
  isActive: boolean;
  activePhaseId: string | null;
  current: { phaseIndex: number; week: number; overallWeek: number } | null;
  phases: (Phase & {
    id: string;
    startsOn: string;
    endsOn: string;
    program: { id: string; name: string } | null;
    schedule: {
      week: number;
      startsOn: string;
      loadPct: number;
      repsDelta: number;
      setsDelta: number;
      deload: boolean;
    }[];
  })[];
}

const MODEL_LABEL = { LINEAR: 'Linear', UNDULATING: 'Ondulatória', BLOCK: 'Em blocos' } as const;

function PhaseRow({
  p,
  programs,
  onChange,
  onRemove,
}: {
  p: Phase;
  programs: { id: string; name: string }[];
  onChange: (p: Phase) => void;
  onRemove: () => void;
}) {
  const r = p.progression;
  const step = (k: 'perWeek' | 'base', f: keyof Step, v: string) =>
    onChange({
      ...p,
      progression: { ...r, [k]: { ...(r[k] ?? {}), [f]: v === '' ? undefined : Number(v) } },
    });
  return (
    <div className="grid gap-2 rounded-control border border-border p-3 md:grid-cols-6">
      <Field label="Fase">
        <Input value={p.name} onChange={(e) => onChange({ ...p, name: e.target.value })} />
      </Field>
      <Field label="Semanas">
        <Input
          type="number"
          min={1}
          max={26}
          value={p.weeks}
          onChange={(e) => onChange({ ...p, weeks: Number(e.target.value) })}
        />
      </Field>
      <Field label="Programa da fase" className="md:col-span-2">
        <Select
          value={p.programId ?? 'none'}
          onValueChange={(v) => onChange({ ...p, programId: v === 'none' ? null : v })}
        >
          <SelectTrigger aria-label="Programa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem troca de programa</SelectItem>
            {programs.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Modelo">
        <Select
          value={r.model}
          onValueChange={(v) =>
            onChange({
              ...p,
              progression: {
                ...r,
                model: v as Progression['model'],
                ...(v === 'UNDULATING' && !r.wave
                  ? { wave: [{ repsDelta: 2 }, { loadPct: 5 }, { loadPct: 10, repsDelta: -3 }] }
                  : {}),
              },
            })
          }
        >
          <SelectTrigger aria-label="Modelo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODEL_LABEL) as Progression['model'][]).map((m) => (
              <SelectItem key={m} value={m}>
                {MODEL_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remover fase"
        className="self-end"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
      {r.model === 'UNDULATING' ? (
        <Field label="Ondas (carga% / reps, uma por linha: 5/-2)" className="md:col-span-4">
          <Textarea
            value={(r.wave ?? []).map((w) => `${w.loadPct ?? 0}/${w.repsDelta ?? 0}`).join('\n')}
            onChange={(e) =>
              onChange({
                ...p,
                progression: {
                  ...r,
                  wave: e.target.value
                    .split('\n')
                    .filter(Boolean)
                    .map((l) => {
                      const [a, b] = l.split('/');
                      return { loadPct: Number(a) || 0, repsDelta: Number(b) || 0 };
                    }),
                },
              })
            }
          />
        </Field>
      ) : (
        <>
          <Field label="Carga por semana (%)">
            <Input
              type="number"
              step="0.5"
              value={r.perWeek?.loadPct ?? ''}
              onChange={(e) => step('perWeek', 'loadPct', e.target.value)}
            />
          </Field>
          <Field label="Reps por semana">
            <Input
              type="number"
              value={r.perWeek?.repsDelta ?? ''}
              onChange={(e) => step('perWeek', 'repsDelta', e.target.value)}
            />
          </Field>
          <Field label="Séries por semana">
            <Input
              type="number"
              value={r.perWeek?.setsDelta ?? ''}
              onChange={(e) => step('perWeek', 'setsDelta', e.target.value)}
            />
          </Field>
          {r.model === 'BLOCK' ? (
            <Field label="Ênfase do bloco: carga (%)">
              <Input
                type="number"
                value={r.base?.loadPct ?? ''}
                onChange={(e) => step('base', 'loadPct', e.target.value)}
              />
            </Field>
          ) : null}
        </>
      )}
      <Field label="Deload a cada (semanas)">
        <Input
          type="number"
          min={2}
          max={12}
          value={r.deloadEvery ?? ''}
          onChange={(e) =>
            onChange({
              ...p,
              progression: {
                ...r,
                deloadEvery: e.target.value ? Number(e.target.value) : undefined,
              },
            })
          }
        />
      </Field>
    </div>
  );
}

function PeriodizationCalendar({ v }: { v: PeriodizationView }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Começa em {fmtDate(v.startsOn)} · {MODEL_LABEL[v.model]}
        {v.current
          ? ` · agora: ${v.phases[v.current.phaseIndex]?.name}, semana ${v.current.week} (semana ${v.current.overallWeek} do ciclo)`
          : ''}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {v.phases.map((ph, i) => (
          <div
            key={ph.id}
            className={cn(
              'min-w-56 rounded-card border p-3',
              v.current?.phaseIndex === i ? 'border-action' : 'border-border',
            )}
          >
            <p className="font-semibold">{ph.name}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(ph.startsOn)} – {fmtDate(ph.endsOn)}
              {ph.program ? ` · ${ph.program.name}` : ''}
            </p>
            <ol className="mt-2 flex flex-col gap-1">
              {ph.schedule.map((w) => (
                <li
                  key={w.week}
                  className={cn(
                    'flex justify-between rounded px-2 py-1 text-xs',
                    w.deload ? 'bg-warning/20' : 'bg-muted',
                    v.current?.phaseIndex === i &&
                      v.current.week === w.week &&
                      'ring-2 ring-action',
                  )}
                >
                  <span>
                    Sem. {w.week}
                    {w.deload ? ' · deload' : ''}
                  </span>
                  <span className="tabular-nums">
                    {w.loadPct >= 0 ? '+' : ''}
                    {w.loadPct}%{' '}
                    {w.repsDelta ? `· ${w.repsDelta > 0 ? '+' : ''}${w.repsDelta} reps` : ''}{' '}
                    {w.setsDelta ? `· ${w.setsDelta > 0 ? '+' : ''}${w.setsDelta} séries` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PeriodizationPanel({
  studentLinkId,
  staff,
}: {
  studentLinkId: string;
  staff: boolean;
}) {
  const list = useApi<PeriodizationView[]>(`/v1/periodizations?studentLinkId=${studentLinkId}`);
  const active = list.data?.find((p) => p.isActive) ?? list.data?.[0];
  const detail = useApi<PeriodizationView>(active ? `/v1/periodizations/${active.id}` : null);
  const programs = useApi<
    { id: string; name: string }[] | { items: { id: string; name: string }[] }
  >(`/v1/programs?studentLinkId=${studentLinkId}`);
  const programList = Array.isArray(programs.data) ? programs.data : (programs.data?.items ?? []);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<{
    name: string;
    model: Progression['model'];
    startsOn: string;
    phases: Phase[];
  }>({
    name: 'Macrociclo',
    model: 'LINEAR',
    startsOn: localDay(),
    phases: [
      {
        name: 'Adaptação',
        focus: null,
        weeks: 4,
        programId: null,
        progression: { model: 'LINEAR', perWeek: { loadPct: 2.5 }, deloadEvery: 4 },
      },
      {
        name: 'Hipertrofia',
        focus: null,
        weeks: 4,
        programId: null,
        progression: { model: 'LINEAR', perWeek: { loadPct: 5, repsDelta: -1 }, deloadEvery: 4 },
      },
    ],
  });
  const save = useApiMutation<object>(
    detail.data && editing ? 'PUT' : 'POST',
    detail.data && editing ? `/v1/periodizations/${detail.data.id}` : '/v1/periodizations',
    {
      invalidate: ['/v1/periodizations'],
      success: 'Periodização salva. A troca de rotina acontece sozinha na data de cada fase.',
      onSuccess: () => setEditing(false),
    },
  );
  if (!list.data) return <Skeleton className="h-32" />;
  if (editing || !active) {
    if (!staff) return <p className="text-muted-foreground">Sem periodização ativa.</p>;
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            studentLinkId,
            name: f.name,
            model: f.model,
            startsOn: f.startsOn,
            phases: f.phases.map((p) => ({ ...p, progression: { ...p.progression } })),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome">
            <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Modelo geral">
            <Select
              value={f.model}
              onValueChange={(v) => setF({ ...f, model: v as Progression['model'] })}
            >
              <SelectTrigger aria-label="Modelo geral">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODEL_LABEL) as Progression['model'][]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODEL_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Início">
            <Input
              type="date"
              required
              value={f.startsOn}
              onChange={(e) => setF({ ...f, startsOn: e.target.value })}
            />
          </Field>
        </div>
        {f.phases.map((p, i) => (
          <PhaseRow
            key={i}
            p={p}
            programs={programList}
            onChange={(np) => setF({ ...f, phases: f.phases.map((x, j) => (j === i ? np : x)) })}
            onRemove={() => setF({ ...f, phases: f.phases.filter((_, j) => j !== i) })}
          />
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setF({
                ...f,
                phases: [
                  ...f.phases,
                  {
                    name: `Fase ${f.phases.length + 1}`,
                    focus: null,
                    weeks: 4,
                    programId: null,
                    progression: { model: f.model, perWeek: { loadPct: 2.5 } },
                  },
                ],
              })
            }
          >
            Adicionar fase
          </Button>
          <Button type="submit" loading={save.isPending}>
            Salvar periodização
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-display text-xl">{active.name}</p>
        {staff ? (
          <Button
            variant="secondary"
            onClick={() => {
              if (detail.data)
                setF({
                  name: detail.data.name,
                  model: detail.data.model,
                  startsOn: detail.data.startsOn,
                  phases: detail.data.phases.map((p) => ({
                    name: p.name,
                    focus: p.focus,
                    weeks: p.weeks,
                    programId: p.program?.id ?? null,
                    progression: p.progression,
                  })),
                });
              setEditing(true);
            }}
          >
            Editar
          </Button>
        ) : null}
      </div>
      {detail.data ? <PeriodizationCalendar v={detail.data} /> : <Skeleton className="h-40" />}
    </div>
  );
}
