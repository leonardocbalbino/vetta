'use client';

import { useVettaClient } from '@vetta/sdk/react';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { env } from '@/env';

let shared: { socket: Socket; refs: number } | null = null;

/** Conexão única com o Socket.IO da API (path /ws), autenticada com o token atual. */
function acquire(token: string): Socket {
  if (!shared) {
    shared = {
      socket: io(env.NEXT_PUBLIC_API_URL, {
        path: '/ws',
        auth: { token },
        transports: ['websocket'],
      }),
      refs: 0,
    };
  }
  shared.refs++;
  return shared.socket;
}

function release() {
  if (!shared) return;
  shared.refs--;
  if (shared.refs <= 0) {
    shared.socket.disconnect();
    shared = null;
  }
}

/** Assina um evento em tempo real (chat:message, chat:typing, chat:read, notification). */
export function useRealtime<T>(event: string, handler: (data: T) => void) {
  const client = useVettaClient();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let socket: Socket | null = null;
    let active = true;
    const listener = (d: T) => ref.current(d);
    void Promise.resolve(client.tokens.get()).then((t) => {
      if (!active || !t?.accessToken) return;
      socket = acquire(t.accessToken);
      socket.on(event, listener);
    });
    return () => {
      active = false;
      if (socket) {
        socket.off(event, listener);
        release();
      }
    };
  }, [client, event]);
}

/** Envia "digitando…" pelo socket (sem ida à API). */
export function emitTyping(conversationId: string) {
  shared?.socket.emit('chat:typing', { conversationId });
}
