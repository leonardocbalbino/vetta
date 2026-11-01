'use client';

import { Button, Card, CardContent, Checkbox, Field, Input, Skeleton, Textarea } from '@vetta/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';

type Question = {
  id: string;
  type: string;
  label: string;
  options?: string[];
  min?: number;
  max?: number;
};
interface Response {
  id: string;
  status: string;
  answers: Record<string, unknown>;
  template: { name: string; kind: string; schema: { questions: Question[] } };
}

/** O aluno responde a anamnese e autoriza o uso dos dados de saúde (LGPD). */
export default function AnswerAnamnesis() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const r = useApi<Response>(`/v1/anamnesis/responses/${id}`);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [consent, setConsent] = useState(false);
  const send = useApiMutation<object, { hasRisk: boolean }>(
    'POST',
    `/v1/anamnesis/responses/${id}/answer`,
    {
      invalidate: ['/v1/anamnesis'],
      success: 'Respostas enviadas ao seu personal.',
      onSuccess: () => router.push('/anamnese'),
    },
  );
  if (!r.data) return <Skeleton className="h-64" />;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  const answered = r.data.status !== 'PENDING';
  const values = answered ? r.data.answers : answers;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate({ answers, acceptHealthDataConsent: consent });
      }}
    >
      <h1 className="font-display text-3xl">{r.data.template.name}</h1>
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          {r.data.template.schema.questions.map((q) => (
            <fieldset key={q.id} disabled={answered} className="flex flex-col gap-2">
              <legend className="mb-1 font-medium">{q.label}</legend>
              {q.type === 'yes_no' ? (
                <div className="flex gap-2" role="radiogroup">
                  {[true, false].map((v) => (
                    <Button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={values[q.id] === v}
                      variant={values[q.id] === v ? 'primary' : 'secondary'}
                      onClick={() => set(q.id, v)}
                    >
                      {v ? 'Sim' : 'Não'}
                    </Button>
                  ))}
                </div>
              ) : q.type === 'multi_choice' || q.type === 'single_choice' ? (
                <div className="flex flex-wrap gap-2">
                  {(q.options ?? []).map((o) => {
                    const cur = values[q.id];
                    const on = Array.isArray(cur) ? cur.includes(o) : cur === o;
                    return (
                      <Button
                        key={o}
                        type="button"
                        aria-pressed={on}
                        variant={on ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          if (q.type === 'single_choice') return set(q.id, o);
                          const arr = Array.isArray(cur) ? (cur as string[]) : [];
                          set(q.id, on ? arr.filter((x) => x !== o) : [...arr, o]);
                        }}
                      >
                        {o}
                      </Button>
                    );
                  })}
                </div>
              ) : q.type === 'number' || q.type === 'scale' ? (
                <Input
                  type="number"
                  min={q.min}
                  max={q.max}
                  value={(values[q.id] as number | undefined) ?? ''}
                  onChange={(e) => set(q.id, e.target.value === '' ? null : Number(e.target.value))}
                  aria-label={q.label}
                  className="max-w-32"
                />
              ) : (
                <Textarea
                  value={(values[q.id] as string | undefined) ?? ''}
                  onChange={(e) => set(q.id, e.target.value)}
                  aria-label={q.label}
                />
              )}
            </fieldset>
          ))}
        </CardContent>
      </Card>
      {!answered ? (
        <>
          <label className="flex items-start gap-3">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(!!v)}
              aria-label="Consentimento para dados de saúde"
              className="mt-1"
            />
            <span className="text-sm">
              Autorizo o uso destas informações de saúde pelo meu personal para planejar meus
              treinos, conforme a{' '}
              <Link
                href="https://vettafit.com.br/privacidade"
                className="text-link underline"
                target="_blank"
              >
                Política de privacidade
              </Link>
              .
            </span>
          </label>
          <Field label="" className="hidden">
            <span />
          </Field>
          <Button
            type="submit"
            variant="accent"
            disabled={!consent}
            loading={send.isPending}
            className="self-start"
          >
            Enviar respostas
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">Você já respondeu esta anamnese.</p>
      )}
    </form>
  );
}
