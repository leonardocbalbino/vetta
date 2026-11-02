'use client';

import { BarChart, Skeleton, StatTile } from '@vetta/ui';
import { fmtBytes, useAdminApi } from '@/lib/api';

interface Dashboard {
  tenants: number;
  byPlan: Record<'FREE' | 'PRO' | 'PRO_PLUS', number>;
  activeTrials: number;
  trialConversion: number;
  activeStudents: number;
  workoutsPerDay: { date: string; count: number }[];
  storageBytes: number;
}

export default function Painel() {
  const d = useAdminApi<Dashboard>('/v1/admin/dashboard');
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Painel</h1>
      {!d.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Personais" value={d.data.tenants} />
            <StatTile label="Em teste (trial)" value={d.data.activeTrials} />
            <StatTile
              label="Conversão de trial"
              value={`${d.data.trialConversion.toLocaleString('pt-BR')}%`}
            />
            <StatTile label="Alunos ativos" value={d.data.activeStudents} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Free" value={d.data.byPlan.FREE} />
            <StatTile label="Pro" value={d.data.byPlan.PRO} />
            <StatTile label="Pro Plus" value={d.data.byPlan.PRO_PLUS} />
            <StatTile label="Armazenamento" value={fmtBytes(d.data.storageBytes)} />
          </div>
          <BarChart
            title="Treinos concluídos por dia (30 dias)"
            data={d.data.workoutsPerDay.map((p) => ({ x: p.date, y: p.count }))}
            unit="treinos"
          />
        </>
      )}
    </>
  );
}
