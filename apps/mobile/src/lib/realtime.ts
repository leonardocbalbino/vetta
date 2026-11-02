import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, client } from './client';

let shared: { socket: Socket; refs: number } | null = null;

/** Assina um evento em tempo real da API (chat:message, chat:typing, chat:read). */
export function useRealtime<T>(event: string, handler: (data: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let socket: Socket | null = null;
    let active = true;
    const listener = (d: T) => ref.current(d);
    void Promise.resolve(client.tokens.get()).then((t) => {
      if (!active || !t?.accessToken) return;
      if (!shared) {
        shared = {
          socket: io(API_URL, {
            path: '/ws',
            auth: { token: t.accessToken },
            transports: ['websocket'],
          }),
          refs: 0,
        };
      }
      shared.refs++;
      socket = shared.socket;
      socket.on(event, listener);
    });
    return () => {
      active = false;
      if (socket && shared) {
        socket.off(event, listener);
        shared.refs--;
        if (shared.refs <= 0) {
          shared.socket.disconnect();
          shared = null;
        }
      }
    };
  }, [event]);
}

export const emitTyping = (conversationId: string) =>
  shared?.socket.emit('chat:typing', { conversationId });
