'use client';

import { Button, Card, CardContent, Field, Input, toast } from '@vetta/ui';
import { useState } from 'react';
import { ProgressView } from '@/components/progress-view';
import { useApi, useApiMutation } from '@/lib/api';

export default function EvolutionPage() {
  const [weight, setWeight] = useState('');
  const records =
    useApi<{ id: string; type: string; value: string; exercise: { name: string } }[]>(
      '/v1/training/records',
    );
  const add = useApiMutation<object>('POST', '/v1/progress/me/measurements', {
    invalidate: ['/v1/progress/me'],
    success: 'Peso registrado.',
    onSuccess: () => setWeight(''),
  });
  const maxLoads = (records.data ?? []).filter((r) => r.type === 'MAX_LOAD').slice(0, 6);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Sua evolução</h1>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-6">
          <Field label="Peso de hoje (kg)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
          <Button
            onClick={() => {
              const v = Number(weight.replace(',', '.'));
              if (!(v > 20)) return toast.error('Informe um peso válido.');
              add.mutate({ weightKg: v });
            }}
          >
            Registrar
          </Button>
        </CardContent>
      </Card>
      {maxLoads.length ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-2 font-semibold">Recordes de carga</h2>
            <ul className="grid gap-2 sm:grid-cols-3">
              {maxLoads.map((r) => (
                <li key={r.id} className="rounded-control bg-muted p-3">
                  <p className="text-sm text-muted-foreground">{r.exercise.name}</p>
                  <p className="font-display text-xl tabular-nums">
                    {Number(r.value).toLocaleString('pt-BR')} kg
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <ProgressView studentLinkId="me" />
    </div>
  );
}
