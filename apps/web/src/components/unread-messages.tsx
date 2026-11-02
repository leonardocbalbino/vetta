'use client';

import { useFeature } from '@vetta/sdk/react';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useActiveTenant } from '@/lib/session';

/**
 * Mensagens não lidas do vínculo ativo. Atualiza na hora pelo socket (nova mensagem ou
 * leitura), ao trocar de página (ex.: saindo de uma conversa lida) e ao voltar para a aba.
 */
export function useUnreadMessages() {
  const { tenantId } = useActiveTenant();
  const chat = useFeature(tenantId, 'comms.chat');
  const q = useApi<{ total: number; conversations: number }>('/v1/chat/unread', {
    enabled: !!tenantId && !chat.locked && !chat.loading,
  });
  useRealtime('chat:message', () => void q.refetch());
  useRealtime('chat:read', () => void q.refetch());
  const path = usePathname();
  const { refetch, isEnabled } = {
    refetch: q.refetch,
    isEnabled: !!tenantId && !chat.locked && !chat.loading,
  };
  useEffect(() => {
    if (isEnabled) void refetch();
  }, [path, isEnabled, refetch]);
  return {
    total: q.data?.total ?? 0,
    conversations: q.data?.conversations ?? 0,
    refetch: q.refetch,
  };
}

/** Bolinha com o número (no item de menu Mensagens). */
export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} não lida${count > 1 ? 's' : ''}`}
      className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-bold leading-5 text-danger-foreground"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Alerta no início: "Você tem N mensagens não lidas". */
export function UnreadMessagesAlert() {
  const { total, conversations } = useUnreadMessages();
  if (!total) return null;
  return (
    <Link
      href="/mensagens"
      role="status"
      className="flex min-h-11 items-center gap-3 rounded-card border border-action bg-action/10 p-4 hover:bg-action/15"
    >
      <span className="relative">
        <MessageCircle className="size-6 text-action" aria-hidden />
        <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-danger" aria-hidden />
      </span>
      <span className="flex-1">
        <span className="font-semibold">
          {total === 1 ? 'Você tem 1 mensagem não lida' : `Você tem ${total} mensagens não lidas`}
        </span>
        {conversations > 1 ? (
          <span className="block text-sm text-muted-foreground">em {conversations} conversas</span>
        ) : null}
      </span>
      <span className="text-sm font-semibold text-link">Abrir</span>
    </Link>
  );
}
