'use client';

import { AssessmentProtocol, PERIMETERS, PROTOCOL_LABEL } from '@vetta/contracts';
import { PROTOCOL_SITES, SKINFOLD_LABELS, type Protocol } from '@vetta/fitness';
import {
  Button,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@vetta/ui';
import { useState } from 'react';
import { useApiMutation } from '@/lib/api';

const numberInput = { type: 'number', inputMode: 'decimal' as const, step: '0.1', min: 0 };

/** Formulário por protocolo: só mostra as dobras necessárias para o sexo e protocolo escolhidos. */
export function AssessmentForm({
  studentLinkId,
  defaultSex,
  onSaved,
}: {
  studentLinkId: string;
  defaultSex: 'male' | 'female';
  onSaved: () => void;
}) {
  const [protocol, setProtocol] = useState<(typeof AssessmentProtocol)[number]>('POLLOCK_3');
  const [sex, setSex] = useState<'male' | 'female'>(defaultSex);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [folds, setFolds] = useState<Record<string, string>>({});
  const [perims, setPerims] = useState<Record<string, string>>({});
  const [bio, setBio] = useState('');
  const [next, setNext] = useState('');
  const [notes, setNotes] = useState('');
  const save = useApiMutation<object>('POST', `/v1/students/${studentLinkId}/assessments`, {
    invalidate: [`/v1/students/${studentLinkId}`, `/v1/progress/${studentLinkId}`],
    success: 'Avaliação salva.',
    onSuccess: onSaved,
  });
  const sites = protocol in PROTOCOL_SITES ? PROTOCOL_SITES[protocol as Protocol][sex] : [];
  const nums = (r: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(r)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [k, Number(v.replace(',', '.'))]),
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          protocol,
          sex,
          weightKg: Number(weight.replace(',', '.')),
          heightCm: Number(height.replace(',', '.')),
          skinfolds: Object.fromEntries(
            Object.entries(nums(folds)).filter(([k]) => (sites as string[]).includes(k)),
          ),
          perimeters: nums(perims),
          ...(protocol === 'BIOIMPEDANCE' && bio
            ? { bioimpedance: { bodyFatPct: Number(bio.replace(',', '.')) } }
            : {}),
          ...(next ? { nextAssessmentOn: next } : {}),
          ...(notes ? { notes } : {}),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Protocolo">
          <Select value={protocol} onValueChange={(v) => setProtocol(v as typeof protocol)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AssessmentProtocol.map((p) => (
                <SelectItem key={p} value={p}>
                  {PROTOCOL_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Sexo biológico (para as equações)">
          <Select value={sex} onValueChange={(v) => setSex(v as 'male' | 'female')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Feminino</SelectItem>
              <SelectItem value="male">Masculino</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Peso (kg)">
          <Input
            {...numberInput}
            required
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Altura (cm)">
          <Input
            {...numberInput}
            required
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </Field>
      </div>
      {sites.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Dobras cutâneas (mm)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {sites.map((s) => (
              <Field key={s} label={SKINFOLD_LABELS[s]}>
                <Input
                  {...numberInput}
                  required
                  value={folds[s] ?? ''}
                  onChange={(e) => setFolds((f) => ({ ...f, [s]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ) : null}
      {protocol === 'BIOIMPEDANCE' ? (
        <Field label="% de gordura (bioimpedância)">
          <Input {...numberInput} required value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">
          Perimetria (cm) — cintura e quadril calculam o RCQ
        </legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {PERIMETERS.map((p) => (
            <Field key={p} label={p}>
              <Input
                {...numberInput}
                value={perims[p] ?? ''}
                onChange={(e) => setPerims((f) => ({ ...f, [p]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Próxima avaliação" hint="Você recebe um lembrete 7 dias antes.">
          <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" loading={save.isPending} className="self-start">
        Calcular e salvar
      </Button>
    </form>
  );
}
