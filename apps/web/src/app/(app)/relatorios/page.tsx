'use client';

import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  BarChart,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vetta/ui';
import Link from 'next/link';
import { useState } from 'react';
import { brl, useApi } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Overview {
  students: { active: number; total: number };
  retention: { cohort: string; size: number; retention: number[] }[];
  adherence: {
    average: number | null;
    students: {
      studentLinkId: string;
      name: string;
      planned: number;
      completed: number;
      rate: number | null;
    }[];
  };
  revenue: {
    byPlan: {
      planId: string | null;
      name: string;
      paidCents: number;
      netCents: number;
      invoices: number;
    }[];
    byMonth: { month: string; cents: number }[];
  };
  delinquency: { billedCents: number; overdueCents: number; rate: number; students: number };
  atRisk: {
    studentLinkId: string;
    name: string;
    score: number;
    level: 'MEDIUM' | 'HIGH';
    reasons: string[];
  }[];
  topExercises: { exerciseId: string; name: string; count: number }[];
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  return `${mm}/${y!.slice(2)}`;
};

/** Relatórios avançados: retenção, aderência, receita, inadimplência, risco e exercícios. */
export default function ReportsPage() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'finance.advanced_reports');
  const [months, setMonths] = useState('6');
  const r = useApi<Overview>(`/v1/reports/overview?months=${months}`, {
    enabled: !feature.locked && !feature.loading,
  });
  const d = r.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">Relatórios</h1>
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger aria-label="Período" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Últimos 3 meses</SelectItem>
            <SelectItem value="6">Últimos 6 meses</SelectItem>
            <SelectItem value="12">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <LockedFeature
        locked={feature.locked}
        loading={feature.loading}
        title="Relatórios avançados"
        requiredPlan="PRO_PLUS"
      >
        {!d ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Alunos ativos" value={d.students.active} />
              <StatTile label="Aderência média (4 semanas)" value={pct(d.adherence.average)} />
              <StatTile
                label="Inadimplência"
                value={pct(d.delinquency.rate)}
                hint={`${brl(d.delinquency.overdueCents)} em atraso · ${d.delinquency.students} aluno(s)`}
              />
              <StatTile label="Alunos em risco" value={d.atRisk.length} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Receita recebida por mês</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  title="Receita recebida por mês"
                  unit="R$"
                  data={d.revenue.byMonth.map((m) => ({ x: m.month, y: m.cents / 100 }))}
                  formatX={monthLabel}
                  emptyText="Nenhum pagamento no período."
                />
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Receita por plano de consultoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Cobranças</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Líquido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.revenue.byPlan.map((p) => (
                        <TableRow key={p.planId ?? 'avulso'}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.invoices}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {brl(p.paidCents)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {brl(p.netCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Exercícios mais prescritos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-1">
                    {d.topExercises.map((e, i) => (
                      <li key={e.exerciseId} className="flex justify-between gap-2 text-sm">
                        <span>
                          {i + 1}. {e.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{e.count}×</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Retenção por mês de entrada</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">
                    Percentual de alunos que continuam ativos em cada mês desde a entrada
                  </caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entrada</TableHead>
                      <TableHead className="text-right">Alunos</TableHead>
                      {d.retention.map((_, i) => (
                        <TableHead key={i} className="text-right">
                          Mês {i}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.retention.map((row) => (
                      <TableRow key={row.cohort}>
                        <TableCell>{monthLabel(row.cohort)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.size}</TableCell>
                        {d.retention.map((_, i) => (
                          <TableCell key={i} className="text-right tabular-nums">
                            {row.size && row.retention[i] !== undefined
                              ? `${row.retention[i]}%`
                              : ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Alunos em risco de cancelar</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y divide-border">
                    {d.atRisk.map((s) => (
                      <li key={s.studentLinkId} className="flex flex-col gap-1 py-2">
                        <span className="flex items-center gap-2">
                          <Link
                            href={`/alunos/${s.studentLinkId}`}
                            className="font-medium text-link underline"
                          >
                            {s.name}
                          </Link>
                          <Badge variant={s.level === 'HIGH' ? 'danger' : 'warning'}>
                            {s.level === 'HIGH' ? 'risco alto' : 'atenção'}
                          </Badge>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {s.reasons.join(' · ')}
                        </span>
                      </li>
                    ))}
                    {!d.atRisk.length ? (
                      <li className="py-2 text-sm text-muted-foreground">
                        Nenhum aluno em risco agora. Bom trabalho!
                      </li>
                    ) : null}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Aderência nas últimas 4 semanas</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aluno</TableHead>
                        <TableHead className="text-right">Feitos / previstos</TableHead>
                        <TableHead className="text-right">Aderência</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.adherence.students.slice(0, 20).map((s) => (
                        <TableRow key={s.studentLinkId}>
                          <TableCell>{s.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.completed} / {s.planned}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{pct(s.rate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <p className="text-sm text-muted-foreground">
              Precisa dos dados brutos? Exporte em{' '}
              <Link href="/integracoes" className="text-link underline">
                Integrações
              </Link>
              .
            </p>
          </>
        )}
      </LockedFeature>
    </div>
  );
}
