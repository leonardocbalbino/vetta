'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vetta/ui';
import { useAdminApi } from '@/lib/api';

interface Usage {
  provider: string;
  model: string;
  months: {
    month: string;
    generations: number;
    failed: number;
    costMicroUsd: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  topTenants: { tenantId: string; tenantName: string; generations: number; costMicroUsd: number }[];
  models: { model: string; generations: number; costMicroUsd: number }[];
}

const usd = (micro: number) =>
  (micro / 1_000_000).toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
const n = (v: number) => v.toLocaleString('pt-BR');

/** Uso e custo da IA de treino por mês, modelo e personal. */
export default function AiUsagePage() {
  const u = useAdminApi<Usage>('/v1/admin/ai/usage', { months: 6 });
  const d = u.data;
  const current = d?.months[0];
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">IA de treino</h1>
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Provedor" value={d.provider} hint={d.model} />
            <StatTile label="Gerações no mês" value={n(current?.generations ?? 0)} />
            <StatTile
              label="Custo no mês"
              value={usd(current?.costMicroUsd ?? 0)}
              hint="estimado pela tabela de preços"
            />
            <StatTile
              label="Falhas no mês"
              value={n(current?.failed ?? 0)}
              hint="recusas, saída inválida ou erro da API"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Por mês</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Gerações</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                    <TableHead className="text-right">Tokens de entrada</TableHead>
                    <TableHead className="text-right">Tokens de saída</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.months.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(m.generations)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(m.failed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(m.inputTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(m.outputTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {usd(m.costMicroUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personais que mais usam</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Personal</TableHead>
                      <TableHead className="text-right">Gerações</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.topTenants.map((t) => (
                      <TableRow key={t.tenantId}>
                        <TableCell>{t.tenantName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(t.generations)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {usd(t.costMicroUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Por modelo</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-right">Gerações</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.models.map((m) => (
                      <TableRow key={m.model}>
                        <TableCell className="font-mono text-sm">{m.model}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(m.generations)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {usd(m.costMicroUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
