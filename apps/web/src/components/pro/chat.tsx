'use client';

import { uploadFile } from '@vetta/sdk';
import { useEntitlements, useVettaClient } from '@vetta/sdk/react';
import { Button, cn, Input, Skeleton, toast } from '@vetta/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCheck,
  Image as ImageIcon,
  Lock,
  Mic,
  Search,
  Send,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, fmtDateTime } from '@/lib/api';
import { emitTyping, useRealtime } from '@/lib/realtime';
import { useActiveTenant } from '@/lib/session';

export interface ChatMessage {
  id: string;
  clientId: string | null;
  type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'VIDEO' | 'FILE' | 'SYSTEM';
  body: string | null;
  fromStaff: boolean;
  mine?: boolean;
  quote: { kind: string; title?: string; rating?: number | null; comment?: string | null } | null;
  media: { url: string; thumbnailUrl: string | null; mimeType: string } | null;
  createdAt: string;
  status: 'SENT' | 'READ' | null;
}

interface Page {
  items: ChatMessage[];
  nextBefore: string | null;
}

const MEDIA_TYPE = (mime: string) =>
  mime.startsWith('image/') ? 'IMAGE' : mime.startsWith('video/') ? 'VIDEO' : 'AUDIO';

/**
 * Conversa 1:1 em tempo real: paginação infinita (mais antigas ao rolar para cima),
 * busca, texto, foto, vídeo e áudio gravado (Pro), "digitando…" e status lido.
 */
export function ChatPanel({
  conversationId,
  staff,
  title,
}: {
  conversationId: string;
  staff: boolean;
  title?: string;
}) {
  const client = useVettaClient();
  const qc = useQueryClient();
  const { tenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const mediaAllowed = ent.data?.features['comms.chat_media'] !== false;
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = ['chat', conversationId, search, tenantId];

  const messages = useInfiniteQuery<Page>({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request<Page>(
        'GET',
        `/v1/chat/conversations/${conversationId}/messages?limit=30${pageParam ? `&before=${pageParam}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextBefore,
  });
  const list = [...(messages.data?.pages.flatMap((p) => p.items) ?? [])].reverse();

  // Abriu ou chegou mensagem: marca como lida.
  useEffect(() => {
    void client
      .request('POST', `/v1/chat/conversations/${conversationId}/read`)
      .catch(() => undefined);
  }, [client, conversationId, list.length]);
  useEffect(() => {
    if (!search) bottom.current?.scrollIntoView({ block: 'end' });
  }, [list.length, search]);

  const append = (m: ChatMessage) =>
    qc.setQueryData<{ pages: Page[]; pageParams: unknown[] }>(key, (old) => {
      if (!old) return old;
      const all = old.pages.flatMap((p) => p.items);
      if (all.some((x) => x.id === m.id || (m.clientId && x.clientId === m.clientId))) return old;
      const [first, ...rest] = old.pages;
      return { ...old, pages: [{ ...first!, items: [m, ...first!.items] }, ...rest] };
    });

  useRealtime<{ conversationId: string; message: ChatMessage }>('chat:message', (d) => {
    if (d.conversationId !== conversationId) return;
    append({
      ...d.message,
      mine: d.message.fromStaff === staff,
      status: d.message.fromStaff === staff ? 'SENT' : null,
    });
    setTyping(false);
  });
  useRealtime<{ conversationId: string }>('chat:read', (d) => {
    if (d.conversationId !== conversationId) return;
    qc.setQueryData<{ pages: Page[]; pageParams: unknown[] }>(key, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((m) => (m.mine ? { ...m, status: 'READ' } : m)),
            })),
          }
        : old,
    );
  });
  useRealtime<{ conversationId: string }>('chat:typing', (d) => {
    if (d.conversationId !== conversationId) return;
    setTyping(true);
    window.clearTimeout((window as unknown as { __typing?: number }).__typing);
    (window as unknown as { __typing?: number }).__typing = window.setTimeout(
      () => setTyping(false),
      3000,
    );
  });

  const send = async (body: { type: ChatMessage['type']; body?: string; mediaId?: string }) => {
    setSending(true);
    try {
      const m = await client.request<ChatMessage>(
        'POST',
        `/v1/chat/conversations/${conversationId}/messages`,
        {
          clientId: crypto.randomUUID(),
          ...body,
        },
      );
      append(m);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File) => {
    if (!mediaAllowed) return toast.error('Mídia no chat é do plano Pro.');
    setSending(true);
    try {
      const mediaId = await uploadFile(client, file, { purpose: 'chat_media' });
      await send({ type: MEDIA_TYPE(file.type), mediaId });
    } catch (err) {
      toast.error(errorMessage(err));
      setSending(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const type = rec.mimeType.split(';')[0] || 'audio/webm';
        void sendFile(new File(chunks, `audio-${Date.now()}.${type.split('/')[1]}`, { type }));
      };
      rec.start();
      setRecording(rec);
    } catch {
      toast.error('Não foi possível acessar o microfone.');
    }
  };

  return (
    <div className="flex h-[70dvh] flex-col rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <p className="flex-1 font-semibold">{title ?? 'Conversa'}</p>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim().length >= 2 ? q.trim() : '');
          }}
        >
          <Input
            aria-label="Buscar mensagens"
            placeholder="Buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-40"
          />
          <Button type="submit" size="icon" variant="ghost" aria-label="Buscar">
            <Search />
          </Button>
        </form>
      </div>
      <div className="flex-1 overflow-y-auto p-3" aria-live="polite">
        {messages.hasNextPage ? (
          <div className="mb-3 text-center">
            <Button
              variant="link"
              size="sm"
              loading={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              Carregar mensagens anteriores
            </Button>
          </div>
        ) : null}
        {messages.isLoading ? <Skeleton className="h-40" /> : null}
        {!messages.isLoading && !list.length ? (
          <p className="py-10 text-center text-muted-foreground">
            {search ? 'Nada encontrado.' : 'Nenhuma mensagem ainda. Diga oi!'}
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {list.map((m) => (
            <li key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-card px-3 py-2',
                  m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {m.quote?.kind === 'workout_session' ? (
                  <div className="mb-1 rounded-control border-l-4 border-action bg-background/60 p-2 text-sm text-foreground">
                    <p className="font-semibold">{m.quote.title}</p>
                    <p>
                      {m.quote.rating ? `Nota ${m.quote.rating}/5` : ''}
                      {m.quote.comment ? ` · “${m.quote.comment}”` : ''}
                    </p>
                  </div>
                ) : null}
                {m.media && m.type === 'IMAGE' ? (
                  <a href={m.media.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.media.url}
                      alt="Foto enviada"
                      className="max-h-64 rounded-control"
                    />
                  </a>
                ) : null}
                {m.media && m.type === 'VIDEO' ? (
                  <video src={m.media.url} controls className="max-h-64 rounded-control" />
                ) : null}
                {m.media && m.type === 'AUDIO' ? (
                  <audio src={m.media.url} controls aria-label="Áudio" />
                ) : null}
                {m.body ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
                <p className="mt-1 flex items-center justify-end gap-1 text-xs opacity-70">
                  {fmtDateTime(m.createdAt)}
                  {m.mine ? (
                    m.status === 'READ' ? (
                      <CheckCheck className="size-3.5" aria-label="lida" />
                    ) : (
                      <Check className="size-3.5" aria-label="enviada" />
                    )
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {typing ? <p className="mt-2 text-sm text-muted-foreground">digitando…</p> : null}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void send({ type: 'TEXT', body: text.trim() });
          setText('');
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/mp4,video/quicktime"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void sendFile(f);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={mediaAllowed ? 'Enviar foto ou vídeo' : 'Mídia disponível no plano Pro'}
          onClick={() =>
            mediaAllowed ? fileInput.current?.click() : toast.error('Mídia no chat é do plano Pro.')
          }
        >
          {mediaAllowed ? <ImageIcon /> : <Lock />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant={recording ? 'destructive' : 'ghost'}
          aria-label={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
          disabled={!mediaAllowed}
          onClick={() => void toggleRecord()}
        >
          {recording ? <Square /> : <Mic />}
        </Button>
        <Input
          aria-label="Mensagem"
          placeholder="Escreva uma mensagem"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emitTyping(conversationId);
          }}
          className="flex-1"
        />
        <Button type="submit" size="icon" aria-label="Enviar" loading={sending}>
          <Send />
        </Button>
      </form>
    </div>
  );
}
