'use client';

import { STUDENT_TABS } from '@vetta/contracts';
import { useEntitlements, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  StatTile,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@vetta/ui';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AssessmentForm } from '@/components/assessment-form';
import { ProgressView } from '@/components/progress-view';
import { fmtDate, fmtDateTime, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';
import { useActiveRole } from '@/lib/role';
import {
  DocumentsPanel,
  PeriodizationPanel,
  PosturePanel,
  StudentChatTab,
  StudentFinancePanel,
} from '@/components/pro/student-tabs';

interface Detail {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  goal: string | null;
  level: string | null;
  restrictions: string | null;
  injuries: string | null;
  whatsapp: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  birthDate: string | null;
  sex: 'FEMALE' | 'MALE' | 'OTHER' | null;
  tags: string[];
  notes?: string | null;
  summary: {
    sessionsLast30Days: number;
    lastSession: { id: string; startedAt: string; rating: number | null } | null;
    activeProgram: { id: string; name: string; endsOn: string | null } | null;
    lastAssessment: { id: string; assessedAt: string; nextAssessmentOn: string | null } | null;
    pendingAnamnesis: number;
  };
}

function Summary({ s }: { s: Detail }) {
  const [form, setForm] = useState({
    goal: s.goal ?? '',
    restrictions: s.restrictions ?? '',
    injuries: s.injuries ?? '',
    whatsapp: s.whatsapp ?? '',
    emergencyContactName: s.emergencyContactName ?? '',
    emergencyContactPhone: s.emergencyContactPhone ?? '',
    birthDate: s.birthDate?.slice(0, 10) ?? '',
    tags: s.tags.join(', '),
    notes: s.notes ?? '',
    level: s.level ?? '',
  });
  const save = useApiMutation<object>('PATCH', `/v1/students/${s.id}`, {
    invalidate: [`/v1/students/${s.id}`],
    success: 'Ficha atualizada.',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Treinos (30 dias)" value={s.summary.sessionsLast30Days} />
        <StatTile
          label="Último treino"
          value={s.summary.lastSession ? fmtDate(s.summary.lastSession.startedAt) : '—'}
        />
        <StatTile
          label="Treino atual"
          value={s.summary.activeProgram?.name ?? '—'}
          hint={
            s.summary.activeProgram?.endsOn
              ? `troca em ${fmtDate(s.summary.activeProgram.endsOn)}`
              : undefined
          }
        />
        <StatTile
          label="Próxima avaliação"
          value={fmtDate(s.summary.lastAssessment?.nextAssessmentOn)}
        />
      </div>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            goal: orNull(form.goal),
            restrictions: orNull(form.restrictions),
            injuries: orNull(form.injuries),
            whatsapp: orNull(form.whatsapp),
            emergencyContactName: orNull(form.emergencyContactName),
            emergencyContactPhone: orNull(form.emergencyContactPhone),
            birthDate: orNull(form.birthDate),
            level: orNull(form.level),
            tags: form.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            notes: orNull(form.notes),
          });
        }}
      >
        <Field label="Objetivo">
          <Input value={form.goal} onChange={set('goal')} />
        </Field>
        <Field label="Nível">
          <Select
            value={form.level || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BEGINNER">Iniciante</SelectItem>
              <SelectItem value="INTERMEDIATE">Intermediário</SelectItem>
              <SelectItem value="ADVANCED">Avançado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Restrições">
          <Textarea value={form.restrictions} onChange={set('restrictions')} />
        </Field>
        <Field label="Lesões">
          <Textarea value={form.injuries} onChange={set('injuries')} />
        </Field>
        <Field label="WhatsApp">
          <Input type="tel" value={form.whatsapp} onChange={set('whatsapp')} />
        </Field>
        <Field label="Data de nascimento">
          <Input type="date" value={form.birthDate} onChange={set('birthDate')} />
        </Field>
        <Field label="Contato de emergência">
          <Input value={form.emergencyContactName} onChange={set('emergencyContactName')} />
        </Field>
        <Field label="Telefone de emergência">
          <Input
            type="tel"
            value={form.emergencyContactPhone}
            onChange={set('emergencyContactPhone')}
          />
        </Field>
        <Field label="Tags (separadas por vírgula)">
          <Input value={form.tags} onChange={set('tags')} />
        </Field>
        <Field label="Observações privadas" hint="Só você e sua equipe veem.">
          <Textarea value={form.notes} onChange={set('notes')} />
        </Field>
        <Button type="submit" loading={save.isPending} className="self-start">
          Salvar ficha
        </Button>
      </form>
    </div>
  );
}

function Workouts({ id }: { id: string }) {
  const list = useApi<
    {
      id: string;
      name: string;
      status: string;
      isExtra: boolean;
      publishedAt: string | null;
      endsOn: string | null;
    }[]
  >(`/v1/programs?studentLinkId=${id}`);
  return (
    <div className="flex flex-col gap-3">
      <Button asChild className="self-start">
        <Link href={`/treinos/novo?aluno=${id}`}>Novo treino</Link>
      </Button>
      {(list.data ?? []).map((p) => (
        <Link
          key={p.id}
          href={`/treinos/${p.id}`}
          className="flex items-center justify-between rounded-control border border-border p-3 hover:bg-muted"
        >
          <span className="font-medium">{p.name}</span>
          <span className="flex gap-2">
            {p.isExtra ? <Badge variant="outline">extra</Badge> : null}
            <Badge variant={p.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {p.status === 'ACTIVE'
                ? 'Publicado'
                : p.status === 'DRAFT'
                  ? 'Rascunho'
                  : 'Arquivado'}
            </Badge>
          </span>
        </Link>
      ))}
      {list.data && !list.data.length ? (
        <EmptyState title="Sem treinos ainda" description="Crie do zero ou aplique um modelo." />
      ) : null}
    </div>
  );
}

function Assessments({ s }: { s: Detail }) {
  const client = useVettaClient();
  const list = useApi<
    {
      id: string;
      assessedAt: string;
      protocol: string;
      weightKg: string | null;
      results: Record<string, number | string>;
    }[]
  >(`/v1/students/${s.id}/assessments`);
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>Nova avaliação física</CardTitle>
          </CardHeader>
          <CardContent>
            <AssessmentForm
              studentLinkId={s.id}
              defaultSex={s.sex === 'MALE' ? 'male' : 'female'}
              onSaved={() => {
                setCreating(false);
                void list.refetch();
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Button className="self-start" onClick={() => setCreating(true)}>
          Nova avaliação
        </Button>
      )}
      {(list.data ?? []).map((a) => (
        <Card key={a.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <p className="font-semibold">{fmtDate(a.assessedAt)}</p>
              <p className="text-sm text-muted-foreground">{a.protocol.replace(/_/g, ' ')}</p>
            </div>
            <div className="flex gap-6 text-sm tabular-nums">
              <span>Peso {a.weightKg ?? '—'} kg</span>
              <span>IMC {String(a.results.bmi ?? '—')}</span>
              <span>
                Gordura {a.results.bodyFatPct !== undefined ? `${a.results.bodyFatPct}%` : '—'}
              </span>
              <span>Massa magra {a.results.leanMassKg ?? '—'} kg</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await client.request('POST', `/v1/assessments/${a.id}/pdf`);
                toast.success('Gerando o PDF. Ele aparece em instantes.');
                setTimeout(async () => {
                  const r = await client.request<{ pdfUrl: string | null }>(
                    'GET',
                    `/v1/assessments/${a.id}`,
                  );
                  if (r.pdfUrl) window.open(r.pdfUrl, '_blank');
                }, 4000);
              }}
            >
              Baixar PDF
            </Button>
          </CardContent>
        </Card>
      ))}
      {list.data && list.data.length > 1 ? <ProgressView studentLinkId={s.id} /> : null}
    </div>
  );
}

function Anamnesis({ id }: { id: string }) {
  const templates = useApi<{ id: string; name: string; kind: string }[]>('/v1/anamnesis/templates');
  const responses = useApi<
    {
      id: string;
      status: string;
      hasRisk: boolean;
      answeredAt: string | null;
      dueAt: string | null;
      template: { name: string };
    }[]
  >(`/v1/anamnesis/responses?studentLinkId=${id}`);
  const [template, setTemplate] = useState<string>();
  const [due, setDue] = useState('');
  const send = useApiMutation<object>('POST', '/v1/anamnesis/requests', {
    invalidate: ['/v1/anamnesis'],
    success: 'Anamnese enviada ao aluno.',
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Modelo" className="min-w-64">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um modelo" />
            </SelectTrigger>
            <SelectContent>
              {(templates.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prazo">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Button
          disabled={!template}
          loading={send.isPending}
          onClick={() =>
            send.mutate({
              templateId: template,
              studentLinkIds: [id],
              ...(due ? { dueAt: new Date(`${due}T23:59:00`).toISOString() } : {}),
            })
          }
        >
          Enviar ao aluno
        </Button>
      </div>
      {(responses.data ?? []).map((r) => (
        <Link
          key={r.id}
          href={`/anamnese-respostas/${r.id}`}
          className="flex items-center justify-between rounded-control border border-border p-3 hover:bg-muted"
        >
          <span>{r.template.name}</span>
          <span className="flex gap-2">
            {r.hasRisk ? <Badge variant="danger">risco</Badge> : null}
            <Badge variant={r.status === 'ANSWERED' ? 'success' : 'outline'}>
              {r.status === 'ANSWERED'
                ? `respondida ${fmtDate(r.answeredAt)}`
                : r.dueAt
                  ? `até ${fmtDate(r.dueAt)}`
                  : 'pendente'}
            </Badge>
          </span>
        </Link>
      ))}
    </div>
  );
}

function Photos({ id }: { id: string }) {
  const photos = useApi<{ id: string; url: string | null; takenAt: string; view: string | null }[]>(
    `/v1/progress/${id}/photos`,
  );
  const [pair, setPair] = useState<string[]>([]);
  const list = photos.data ?? [];
  const chosen = list.filter((p) => pair.includes(p.id));
  return (
    <div className="flex flex-col gap-4">
      {chosen.length === 2 ? (
        <div className="grid grid-cols-2 gap-2" aria-label="Comparação lado a lado">
          {chosen.map((p) => (
            <figure key={p.id}>
              {p.url ? (
                <img
                  src={p.url}
                  alt={`Foto de ${fmtDate(p.takenAt)}`}
                  className="w-full rounded-card object-cover"
                />
              ) : null}
              <figcaption className="text-center text-sm text-muted-foreground">
                {fmtDate(p.takenAt)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Selecione duas fotos para comparar lado a lado.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pair.includes(p.id)}
            onClick={() =>
              setPair((cur) =>
                cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id].slice(-2),
              )
            }
            className={pair.includes(p.id) ? 'rounded-card ring-2 ring-action' : 'rounded-card'}
          >
            {p.url ? (
              <img
                src={p.url}
                alt={`Foto ${p.view ?? ''} de ${fmtDate(p.takenAt)}`}
                className="aspect-[3/4] w-full rounded-card object-cover"
              />
            ) : null}
          </button>
        ))}
      </div>
      {!list.length ? (
        <EmptyState
          title="Sem fotos"
          description="O aluno envia as fotos de progresso pelo app, com guia de pose."
        />
      ) : null}
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const tl = useApi<{ items: { type: string; title: string; at: string; ref: string }[] }>(
    `/v1/students/${id}/timeline`,
  );
  return (
    <ol className="flex flex-col gap-2 border-l-2 border-border pl-4">
      {(tl.data?.items ?? []).map((i) => (
        <li key={`${i.type}-${i.ref}`}>
          <p className="font-medium">{i.title}</p>
          <p className="text-xs text-muted-foreground">{fmtDateTime(i.at)}</p>
        </li>
      ))}
    </ol>
  );
}

function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const s = useApi<Detail>(`/v1/students/${id}`);
  const role = useActiveRole();
  if (!s.data) return <Skeleton className="h-96" />;
  const tab = params.get('aba') ?? 'summary';
  const has = (f: string | null) => !f || ent.data?.features[f] !== false;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">{s.data.displayName}</h1>
        {s.data.tags.map((t) => (
          <Badge key={t} variant="outline">
            #{t}
          </Badge>
        ))}
      </div>
      <Tabs value={tab} onValueChange={(v) => router.replace(`/alunos/${id}?aba=${v}`)}>
        <TabsList className="flex h-auto flex-wrap">
          {STUDENT_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="summary">
          <Summary s={s.data} />
        </TabsContent>
        <TabsContent value="workouts">
          <Workouts id={id} />
        </TabsContent>
        <TabsContent value="assessments">
          <Assessments s={s.data} />
        </TabsContent>
        <TabsContent value="anamnesis">
          <Anamnesis id={id} />
        </TabsContent>
        <TabsContent value="progress">
          <ProgressView studentLinkId={id} />
        </TabsContent>
        <TabsContent value="photos">
          <LockedFeature
            locked={!has('progress.photos')}
            title="Fotos de progresso"
            requiredPlan="PRO"
          >
            <Photos id={id} />
          </LockedFeature>
        </TabsContent>
        <TabsContent value="posture">
          <LockedFeature
            locked={!has('assessment.posture')}
            title="Avaliação postural"
            requiredPlan="PRO"
          >
            <PosturePanel studentLinkId={id} staff />
          </LockedFeature>
        </TabsContent>
        <TabsContent value="periodization">
          <LockedFeature
            locked={!has('workouts.periodization')}
            title="Periodização"
            requiredPlan="PRO"
          >
            <PeriodizationPanel studentLinkId={id} staff />
          </LockedFeature>
        </TabsContent>
        <TabsContent value="documents">
          <LockedFeature
            locked={!has('docs.student_folder')}
            title="Documentos do aluno"
            requiredPlan="PRO"
          >
            <DocumentsPanel studentLinkId={id} staff />
          </LockedFeature>
        </TabsContent>
        <TabsContent value="finance">
          <LockedFeature
            locked={!has('finance.student_billing') || role !== 'PERSONAL'}
            title="Financeiro do aluno"
            requiredPlan="PRO"
            description={
              role !== 'PERSONAL' ? 'Disponível só para o personal responsável.' : undefined
            }
          >
            <StudentFinancePanel studentLinkId={id} />
          </LockedFeature>
        </TabsContent>
        <TabsContent value="chat">
          <StudentChatTab studentLinkId={id} name={s.data.displayName} />
        </TabsContent>
        <TabsContent value="timeline">
          <Timeline id={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <StudentDetail />
    </Suspense>
  );
}
