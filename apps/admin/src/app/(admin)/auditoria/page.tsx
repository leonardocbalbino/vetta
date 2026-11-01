'use client';

import {
  Button,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vetta/ui';
import { useState } from 'react';
import { fmtDateTime, useAdminApi } from '@/lib/api';

interface Log {
  id: string;
  createdAt: string;
  action: string;
  resource: string;
  resourceId: string | null;
  tenantId: string | null;
  actorUserId: string | null;
  actorAdminId: string | null;
  ip: string | null;
  metadata: unknown;
}

const iso = (d: string, end = false) =>
  d ? new Date(`${d}T${end ? '23:59:59' : '00:00:00'}-03:00`).toISOString() : undefined;

/** Audit log pesquisável: por texto, ação, tenant e período. */
export default function Auditoria() {
  const [f, setF] = useState({ q: '', action: '', tenantId: '', from: '', to: '' });
  const [cursor, setCursor] = useState<string | undefined>();
  const list = useAdminApi<{ items: Log[]; nextCursor: string | null }>('/v1/admin/audit', {
    q: f.q || undefined,
    action: f.action || undefined,
    tenantId: /^[0-9a-f-]{36}$/i.test(f.tenantId) ? f.tenantId : undefined,
    from: iso(f.from),
    to: iso(f.to, true),
    cursor,
    limit: 50,
  });
  const input = (k: keyof typeof f, label: string, type = 'text') => (
    <Field label={label} className="w-48">
      <Input
        type={type}
        value={f[k]}
        onChange={(e) => (setF({ ...f, [k]: e.target.value }), setCursor(undefined))}
      />
    </Field>
  );
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Auditoria</h1>
      <div className="flex flex-wrap items-end gap-3">
        {input('q', 'Busca (recurso ou id)')}
        {input('action', 'Ação (prefixo)')}
        {input('tenantId', 'Tenant (id)')}
        {input('from', 'De', 'date')}
        {input('to', 'Até', 'date')}
      </div>
      {!list.data ? (
        <Skeleton className="h-64" />
      ) : !list.data.items.length ? (
        <EmptyState title="Nenhum registro" description="Ajuste os filtros." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{l.action}</TableCell>
                  <TableCell className="text-xs">
                    {l.resource}
                    {l.resourceId ? (
                      <span className="block text-muted-foreground">{l.resourceId}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.actorAdminId
                      ? `admin ${l.actorAdminId.slice(0, 8)}`
                      : l.actorUserId
                        ? `usuário ${l.actorUserId.slice(0, 8)}`
                        : 'sistema'}
                  </TableCell>
                  <TableCell className="text-xs">{l.ip ?? '—'}</TableCell>
                  <TableCell>
                    {l.metadata ? (
                      <details>
                        <summary className="cursor-pointer text-sm">ver</summary>
                        <pre className="max-w-md overflow-x-auto text-xs">
                          {JSON.stringify(l.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </TableCell>
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
                Mais antigos
              </Button>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
