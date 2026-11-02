'use client';

import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PlanBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vetta/ui';
import Link from 'next/link';
import { useState } from 'react';
import { fmtDate, fmtDateTime, useAdminApi } from '@/lib/api';

interface Row {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  blockedAt: string | null;
  owner: { name: string; email: string; lastLoginAt: string | null };
  subscription: {
    status: string;
    trialEndsAt: string | null;
    plan: { code: 'FREE' | 'PRO' | 'PRO_PLUS' };
  } | null;
  _count: { studentLinks: number };
}

const ALL = '__all';

export default function Personais() {
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [cursor, setCursor] = useState<string | undefined>();
  const list = useAdminApi<{ items: Row[]; nextCursor: string | null }>(
    '/v1/admin/tenants/search',
    {
      q: q || undefined,
      plan: plan === ALL ? undefined : plan,
      status: status === ALL ? undefined : status,
      cursor,
      limit: 50,
    },
  );
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Personais</h1>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Buscar (nome, slug ou e-mail)" className="w-72">
          <Input value={q} onChange={(e) => (setQ(e.target.value), setCursor(undefined))} />
        </Field>
        <Field label="Plano" className="w-40">
          <Select value={plan} onValueChange={(v) => (setPlan(v), setCursor(undefined))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="PRO">Pro</SelectItem>
              <SelectItem value="PRO_PLUS">Pro Plus</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Situação" className="w-44">
          <Select value={status} onValueChange={(v) => (setStatus(v), setCursor(undefined))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="ACTIVE">Ativos</SelectItem>
              <SelectItem value="TRIALING">Em teste</SelectItem>
              <SelectItem value="SUSPENDED">Bloqueados</SelectItem>
              <SelectItem value="CANCELED">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : !list.data?.items.length ? (
        <EmptyState title="Nenhum personal encontrado" description="Ajuste os filtros." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negócio</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Alunos ativos</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Desde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Link href={`/personais/${t.id}`} className="text-action hover:underline">
                      {t.name}
                    </Link>
                    {t.blockedAt ? (
                      <Badge variant="danger" className="ml-2">
                        bloqueado
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {t.owner.name}
                    <span className="block text-sm text-muted-foreground">{t.owner.email}</span>
                  </TableCell>
                  <TableCell>
                    {t.subscription ? <PlanBadge plan={t.subscription.plan.code} /> : '—'}
                    {t.subscription?.status === 'TRIALING' ? (
                      <span className="ml-2 text-sm text-muted-foreground">
                        teste até {fmtDate(t.subscription.trialEndsAt)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{t._count.studentLinks}</TableCell>
                  <TableCell>{fmtDateTime(t.owner.lastLoginAt)}</TableCell>
                  <TableCell>{fmtDate(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2">
            {cursor ? (
              <Button variant="ghost" onClick={() => setCursor(undefined)}>
                Voltar ao início
              </Button>
            ) : null}
            {list.data.nextCursor ? (
              <Button variant="secondary" onClick={() => setCursor(list.data.nextCursor!)}>
                Próxima página
              </Button>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
