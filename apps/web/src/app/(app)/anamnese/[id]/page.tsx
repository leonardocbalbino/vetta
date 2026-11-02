'use client';

import { validateAnswers, visibleQuestions, type AnamnesisQuestion } from '@vetta/contracts';
import { ApiRequestError } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import { Button, Card, CardContent, Checkbox, Skeleton, toast } from '@vetta/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AnamnesisField } from '@/components/pro/anamnesis-fields';
import { errorMessage, useApi } from '@/lib/api';

type Value = string | number | boolean | string[] | null | undefined;
interface Response {
  id: string;
  status: string;
  answers: Record<string, Value>;
  template: { name: string; kind: string; schema: { questions: AnamnesisQuestion[] } };
}

/** O aluno responde a anamnese (com perguntas condicionais) e autoriza o uso dos dados de saúde (LGPD). */
export default function AnswerAnamnesis() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useVettaClient();
  const qc = useQueryClient();
  const r = useApi<Response>(`/v1/anamnesis/responses/${id}`);
  const [answers, setAnswers] = useState<Record<string, Value>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!r.data) return <Skeleton className="h-64" />;
  const answered = r.data.status !== 'PENDING';
  const values = answered ? r.data.answers : answers;
  const all = r.data.template.schema.questions.map((q) =>
    r.data!.template.kind === 'PARQ' ? { ...q, required: q.required !== false } : q,
  );
  const visible = visibleQuestions(all, values);

  const submit = async () => {
    // Só envia as respostas das perguntas visíveis (condicionais escondidas são descartadas).
    const payload = Object.fromEntries(visible.map((q) => [q.id, answers[q.id] ?? null]));
    const local = validateAnswers(all, payload);
    setErrors(local);
    if (Object.keys(local).length) return toast.error('Revise as respostas destacadas.');
    setBusy(true);
    try {
      await client.request('POST', `/v1/anamnesis/responses/${id}/answer`, {
        answers: payload,
        acceptHealthDataConsent: consent,
      });
      toast.success('Respostas enviadas ao seu personal.');
      await qc.invalidateQueries();
      router.push('/anamnese');
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        (err.body.details as { errors?: Record<string, string> } | undefined)?.errors
      )
        setErrors((err.body.details as { errors: Record<string, string> }).errors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className="font-display text-3xl">{r.data.template.name}</h1>
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          {visible.map((q) => (
            <fieldset
              key={q.id}
              className="flex flex-col gap-2"
              aria-invalid={!!errors[q.id]}
              aria-describedby={errors[q.id] ? `err-${q.id}` : undefined}
            >
              <legend className="mb-1 font-medium">
                {q.label}
                {q.required ? (
                  <span className="text-danger" aria-hidden>
                    {' '}
                    *
                  </span>
                ) : null}
              </legend>
              {q.help ? <p className="text-sm text-muted-foreground">{q.help}</p> : null}
              <AnamnesisField
                q={q}
                value={values[q.id]}
                disabled={answered}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
              {errors[q.id] ? (
                <p id={`err-${q.id}`} className="text-sm text-danger">
                  {errors[q.id]}
                </p>
              ) : null}
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
          <Button
            type="submit"
            variant="accent"
            disabled={!consent}
            loading={busy}
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
