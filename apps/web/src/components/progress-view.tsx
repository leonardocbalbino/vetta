'use client';

import {
  BarChart,
  LineChart,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@vetta/ui';
import { useState } from 'react';
import { useApi } from '@/lib/api';

interface Overview {
  weight: { date: string; value: number }[];
  bodyFat: { date: string; value: number }[];
  measures: Record<string, { date: string; value: number }[]>;
  exercises: {
    exerciseId: string;
    name: string;
    points: { date: string; maxLoadKg: number; oneRmKg: number; volumeKg: number }[];
  }[];
  weeklyVolume: { weekStart: string; volumeKg: number }[];
}

const pts = (a: { date: string; value: number }[]) => a.map((p) => ({ x: p.date, y: p.value }));

/** Gráficos de evolução: peso, % gordura, medidas, carga por exercício e volume semanal. */
export function ProgressView({ studentLinkId }: { studentLinkId: string }) {
  const o = useApi<Overview>(`/v1/progress/${studentLinkId}`);
  const [exercise, setExercise] = useState<string | null>(null);
  const [measure, setMeasure] = useState<string | null>(null);
  if (!o.data) return <Skeleton className="h-80" />;
  const ex = o.data.exercises.find((e) => e.exerciseId === exercise) ?? o.data.exercises[0];
  const measureKeys = Object.keys(o.data.measures);
  const m = measure ?? measureKeys[0];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LineChart
        title="Peso"
        unit="kg"
        data={pts(o.data.weight)}
        emptyText="Registre o peso em uma avaliação ou medida."
      />
      <LineChart
        title="% de gordura"
        unit="%"
        data={pts(o.data.bodyFat)}
        emptyText="Aparece após a primeira avaliação com dobras ou bioimpedância."
      />
      <div className="flex flex-col gap-2">
        {o.data.exercises.length > 1 ? (
          <Select value={ex?.exerciseId} onValueChange={setExercise}>
            <SelectTrigger aria-label="Exercício">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {o.data.exercises.map((e) => (
                <SelectItem key={e.exerciseId} value={e.exerciseId}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <LineChart
          title={ex ? `Carga máxima · ${ex.name}` : 'Carga por exercício'}
          unit="kg"
          data={(ex?.points ?? []).map((p) => ({ x: p.date, y: p.maxLoadKg }))}
          emptyText="Aparece depois dos primeiros treinos com carga."
        />
      </div>
      <BarChart
        title="Volume semanal"
        unit="kg"
        data={o.data.weeklyVolume.map((w) => ({ x: w.weekStart, y: w.volumeKg }))}
        emptyText="Sem treinos registrados ainda."
      />
      {measureKeys.length ? (
        <div className="flex flex-col gap-2 lg:col-span-2">
          <Select value={m} onValueChange={setMeasure}>
            <SelectTrigger aria-label="Medida" className="max-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {measureKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <LineChart title={`Perimetria · ${m}`} unit="cm" data={pts(o.data.measures[m!] ?? [])} />
        </div>
      ) : null}
    </div>
  );
}
