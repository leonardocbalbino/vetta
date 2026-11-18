'use client';

import { AI_LEVEL, AI_LEVEL_LABEL, type AiProgramDraft } from '@vetta/contracts';
import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Label,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@vetta/ui';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Generated {
  programId: string;
  generationId: string;
  status: 'DRAFT';
  draft: AiProgramDraft;
}

interface Usage {
  enabled: boolean;
  used: number;
  limit: number;
}

const NONE = '__modelo__';

function AiProgramForm() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'workouts.ai_assistant');
  const params = useSearchParams();
  const router = useRouter();
  const ready = !feature.locked && !feature.loading;
  const usage = useApi<Usage>('/v1/ai/usage', { enabled: ready });
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    '/v1/students?limit=200',
    { enabled: ready },
  );
  const [f, setF] = useState({
    studentLinkId: params.get('aluno') ?? NONE,
    objective: '',
    level: 'BEGINNER' as (typeof AI_LEVEL)[number],
    daysPerWeek: '3',
    minutesPerSession: '60',
    equipment: '',
    injuries: '',
    notes: '',
    useAnamnesis: true,
    useLoadHistory: true,
  });
  const [result, setResult] = useState<Generated | null>(null);
  const generate = useApiMutation<object, Generated>('POST', '/v1/ai/programs', {
    invalidate: ['/v1/ai/usage', '/v1/programs'],
    onSuccess: setResult,
  });
  const left = usage.data ? Math.max(0, usage.data.limit - usage.data.used) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl">
          <Sparkles className="size-7" aria-hidden /> Treino com IA
        </h1>
        <p className="text-muted-foreground">
          A IA monta um rascunho só com exercícios da sua biblioteca e explica cada escolha. Nada
          chega ao aluno sem a sua revisão.
        </p>
      </div>
      <LockedFeature
        locked={feature.locked}
        loading={feature.loading}
        title="Assistente de treino com IA"
        requiredPlan="PRO_PLUS"
      >
        {!result ? (
          <Card>
            <CardHeader>
              <CardTitle>O que o aluno precisa?</CardTitle>
              {left !== null ? (
                <CardDescription>
                  {left} de {usage.data!.limit} gerações disponíveis neste mês.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  generate.mutate({
                    ...(f.studentLinkId !== NONE ? { studentLinkId: f.studentLinkId } : {}),
                    objective: f.objective,
                    level: f.level,
                    daysPerWeek: Number(f.daysPerWeek),
                    minutesPerSession: Number(f.minutesPerSession),
                    equipment: f.equipment
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                    injuries: f.injuries || null,
                    notes: f.notes || null,
                    useAnamnesis: f.useAnamnesis,
                    useLoadHistory: f.useLoadHistory,
                  });
                }}
              >
                <Field label="Aluno" className="sm:col-span-2">
                  <Select
                    value={f.studentLinkId}
                    onValueChange={(v) => setF({ ...f, studentLinkId: v })}
                  >
                    <SelectTrigger aria-label="Aluno">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem aluno (salvar como modelo)</SelectItem>
                      {(students.data?.items ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Objetivo" className="sm:col-span-2">
                  <Input
                    required
                    minLength={3}
                    maxLength={300}
                    placeholder="Ex.: hipertrofia com foco em glúteos"
                    value={f.objective}
                    onChange={(e) => setF({ ...f, objective: e.target.value })}
                  />
                </Field>
                <Field label="Nível">
                  <Select
                    value={f.level}
                    onValueChange={(v) => setF({ ...f, level: v as typeof f.level })}
                  >
                    <SelectTrigger aria-label="Nível">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_LEVEL.map((l) => (
                        <SelectItem key={l} value={l}>
                          {AI_LEVEL_LABEL[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dias por semana">
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      required
                      value={f.daysPerWeek}
                      onChange={(e) => setF({ ...f, daysPerWeek: e.target.value })}
                    />
                  </Field>
                  <Field label="Minutos por treino">
                    <Input
                      type="number"
                      min={15}
                      max={240}
                      required
                      value={f.minutesPerSession}
                      onChange={(e) => setF({ ...f, minutesPerSession: e.target.value })}
                    />
                  </Field>
                </div>
                <Field
                  label="Equipamentos disponíveis"
                  hint="Separe por vírgula. Em branco = academia completa."
                  className="sm:col-span-2"
                >
                  <Input
                    value={f.equipment}
                    placeholder="halteres, elástico, banco"
                    onChange={(e) => setF({ ...f, equipment: e.target.value })}
                  />
                </Field>
                <Field label="Lesões e restrições" className="sm:col-span-2">
                  <Textarea
                    maxLength={1000}
                    value={f.injuries}
                    onChange={(e) => setF({ ...f, injuries: e.target.value })}
                  />
                </Field>
                <Field label="Observações para a IA" className="sm:col-span-2">
                  <Textarea
                    maxLength={1000}
                    value={f.notes}
                    onChange={(e) => setF({ ...f, notes: e.target.value })}
                  />
                </Field>
                {f.studentLinkId !== NONE ? (
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="ai-anamnese"
                        checked={f.useAnamnesis}
                        onCheckedChange={(v) => setF({ ...f, useAnamnesis: v === true })}
                      />
                      <Label htmlFor="ai-anamnese">Usar anamnese e lesões do aluno</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="ai-cargas"
                        checked={f.useLoadHistory}
                        onCheckedChange={(v) => setF({ ...f, useLoadHistory: v === true })}
                      />
                      <Label htmlFor="ai-cargas">Usar histórico de cargas</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      A IA não recebe nome, e-mail, telefone nem documentos. A idade vai em faixa.
                    </p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={generate.isPending || left === 0}>
                    <Sparkles aria-hidden />
                    {generate.isPending ? 'Montando o treino…' : 'Gerar rascunho'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{result.draft.name}</CardTitle>
                <Badge variant="warning">rascunho</Badge>
              </div>
              <CardDescription>{result.draft.rationale}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {result.draft.routines.map((r) => (
                <section key={r.label} className="rounded-card border border-border p-4">
                  <h2 className="font-display text-lg">
                    {r.label} · {r.name}
                  </h2>
                  <p className="mb-2 text-sm text-muted-foreground">{r.rationale}</p>
                  <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
                    {r.items.map((i, idx) => (
                      <li key={idx}>
                        <span className="font-medium">
                          {i.sets.length}× {i.sets[0]?.reps ?? ''}
                        </span>{' '}
                        <span className="text-muted-foreground">— {i.rationale}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              <p className="text-sm text-muted-foreground">
                Os nomes dos exercícios e as justificativas aparecem no construtor. Revise, ajuste e
                publique quando estiver tudo certo.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => router.push(`/treinos/${result.programId}`)}>
                  Revisar no construtor
                </Button>
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Gerar outro
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/treinos">Voltar aos treinos</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </LockedFeature>
    </div>
  );
}

export default function AiProgramPage() {
  return (
    <Suspense>
      <AiProgramForm />
    </Suspense>
  );
}
