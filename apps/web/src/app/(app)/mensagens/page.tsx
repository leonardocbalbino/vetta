'use client';

import { Badge, cn, Input, Skeleton } from '@vetta/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ChatPanel } from '@/components/pro/chat';
import { fmtDateTime, useApi } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useActiveRole } from '@/lib/role';

interface Conversation {
  id: string;
  studentLink: { id: string; displayName: string };
  tenantName?: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
}

function Messages() {
  const role = useActiveRole();
  const staff = role !== 'ALUNO';
  const [q, setQ] = useState('');
  const params = useSearchParams();
  const router = useRouter();
  const list = useApi<Conversation[]>(
    `/v1/chat/conversations${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
  );
  useRealtime('chat:message', () => void list.refetch());
  const selected = params.get('c') ?? (staff ? null : list.data?.[0]?.id) ?? null;
  const current = list.data?.find((c) => c.id === selected);

  if (!list.data) return <Skeleton className="h-96" />;
  if (!staff) {
    const c = list.data[0];
    return c ? (
      <ChatPanel conversationId={c.id} staff={false} title={c.tenantName ?? 'Seu personal'} />
    ) : null;
  }
  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
      <aside className="flex flex-col gap-2">
        <Input
          aria-label="Buscar aluno"
          placeholder="Buscar aluno"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="flex max-h-[70dvh] flex-col gap-1 overflow-y-auto">
          {list.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => router.replace(`/mensagens?c=${c.id}`)}
                className={cn(
                  'flex min-h-11 w-full flex-col rounded-control p-3 text-left hover:bg-muted',
                  c.id === selected && 'bg-muted',
                )}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <span className="flex-1 truncate">{c.studentLink.displayName}</span>
                  {c.unread ? <Badge variant="action">{c.unread}</Badge> : null}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {c.lastMessagePreview ?? 'Sem mensagens'}
                </span>
                {c.lastMessageAt ? (
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(c.lastMessageAt)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {!list.data.length ? (
            <li className="p-3 text-muted-foreground">
              Nenhuma conversa ainda. Abra pela ficha do aluno.
            </li>
          ) : null}
        </ul>
      </aside>
      {current ? (
        <ChatPanel
          key={current.id}
          conversationId={current.id}
          staff
          title={current.studentLink.displayName}
        />
      ) : (
        <div className="grid place-items-center rounded-card border border-dashed border-border p-10 text-muted-foreground">
          Escolha uma conversa.
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Mensagens</h1>
      <Suspense>
        <Messages />
      </Suspense>
    </div>
  );
}
