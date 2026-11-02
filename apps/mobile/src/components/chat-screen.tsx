import { Button, Text, useTheme } from '@vetta/ui-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { client } from '../lib/client';
import { emitTyping, useRealtime } from '../lib/realtime';
import { useSession } from '../lib/session';
import { uploadUri } from '../lib/upload-uri';

interface Message {
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
  items: Message[];
  nextBefore: string | null;
}

const time = (d: string) =>
  new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

function AudioBubble({ url, color }: { url: string; color: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Pausar áudio' : 'Ouvir áudio'}
      onPress={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish || status.currentTime >= status.duration) void player.seekTo(0);
          player.play();
        }
      }}
      style={{ minHeight: 44, minWidth: 140, justifyContent: 'center' }}
    >
      <Text style={{ color }}>
        {status.playing ? '⏸' : '▶'} Áudio{' '}
        {status.duration ? `${Math.round(status.duration)}s` : ''}
      </Text>
    </Pressable>
  );
}

function VideoBubble({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return (
    <VideoView
      player={player}
      style={{ width: 220, height: 160, borderRadius: 12 }}
      nativeControls
    />
  );
}

/**
 * Conversa 1:1 em tempo real. Lista invertida (mais novas embaixo), carrega as
 * anteriores ao rolar; texto, foto e vídeo da galeria e áudio gravado (Pro).
 */
export function ChatScreen({ conversationId, staff }: { conversationId: string; staff: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const { active } = useSession();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const ent = useQuery({
    queryKey: ['entitlements', active?.tenantId],
    queryFn: () =>
      client.request<{ features: Record<string, boolean | number> }>('GET', '/v1/me/entitlements'),
  });
  const mediaAllowed = ent.data?.features['comms.chat_media'] !== false;
  const key = ['chat', conversationId];
  const messages = useInfiniteQuery<Page>({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request<Page>(
        'GET',
        `/v1/chat/conversations/${conversationId}/messages?limit=30${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextBefore,
  });
  const list = messages.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    void client
      .request('POST', `/v1/chat/conversations/${conversationId}/read`)
      .catch(() => undefined);
  }, [conversationId, list.length]);

  const append = (m: Message) =>
    qc.setQueryData<{ pages: Page[]; pageParams: unknown[] }>(key, (old) => {
      if (!old) return old;
      if (old.pages.some((p) => p.items.some((x) => x.id === m.id))) return old;
      const [first, ...rest] = old.pages;
      return { ...old, pages: [{ ...first!, items: [m, ...first!.items] }, ...rest] };
    });

  useRealtime<{ conversationId: string; message: Message }>('chat:message', (d) => {
    if (d.conversationId !== conversationId) return;
    append({ ...d.message, mine: d.message.fromStaff === staff });
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
              items: p.items.map((m) => (m.mine ? { ...m, status: 'READ' as const } : m)),
            })),
          }
        : old,
    );
  });
  useRealtime<{ conversationId: string }>('chat:typing', (d) => {
    if (d.conversationId !== conversationId) return;
    setTyping(true);
    setTimeout(() => setTyping(false), 3000);
  });

  const send = async (body: { type: Message['type']; body?: string; mediaId?: string }) => {
    setSending(true);
    try {
      append(
        await client.request<Message>('POST', `/v1/chat/conversations/${conversationId}/messages`, {
          clientId: uuid(),
          ...body,
        }),
      );
    } catch (e) {
      Alert.alert('Não foi possível enviar', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (uri: string, mime: string, type: 'IMAGE' | 'VIDEO' | 'AUDIO') => {
    setSending(true);
    try {
      const ext = mime.split('/')[1] ?? 'bin';
      const mediaId = await uploadUri(uri, { name: `chat.${ext}`, mime, purpose: 'chat_media' });
      await send({ type, mediaId });
    } catch (e) {
      Alert.alert('Não foi possível enviar', (e as Error).message);
      setSending(false);
    }
  };

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      exif: false,
    });
    const a = r.assets?.[0];
    if (r.canceled || !a) return;
    const video = a.type === 'video';
    await sendMedia(
      a.uri,
      a.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'),
      video ? 'VIDEO' : 'IMAGE',
    );
  };

  const toggleRecord = async () => {
    if (recording) {
      await recorder.stop();
      setRecording(false);
      if (recorder.uri)
        await sendMedia(recorder.uri, Platform.OS === 'ios' ? 'audio/mp4' : 'audio/mp4', 'AUDIO');
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted)
      return Alert.alert('Microfone', 'Permita o acesso ao microfone para gravar áudio.');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  if (messages.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        inverted
        data={list}
        keyExtractor={(m) => m.id}
        onEndReached={() => messages.hasNextPage && void messages.fetchNextPage()}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ padding: t.spacing[4], gap: t.spacing[2] }}
        ListHeaderComponent={typing ? <Text muted>digitando…</Text> : undefined}
        ListEmptyComponent={
          <Text muted style={{ textAlign: 'center', transform: [{ scaleY: -1 }] }}>
            Nenhuma mensagem ainda. Diga oi!
          </Text>
        }
        renderItem={({ item: m }) => {
          const mine = m.mine ?? m.fromStaff === staff;
          const fg = mine ? t.colors.primaryForeground : t.colors.foreground;
          return (
            <View
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                backgroundColor: mine ? t.colors.primary : t.colors.muted,
                borderRadius: t.radius.card,
                padding: t.spacing[3],
                gap: t.spacing[1],
              }}
            >
              {m.quote?.kind === 'workout_session' ? (
                <View
                  style={{ borderLeftWidth: 4, borderLeftColor: t.colors.action, paddingLeft: 8 }}
                >
                  <Text style={{ color: fg, fontWeight: '600' }}>{m.quote.title}</Text>
                  <Text style={{ color: fg }}>
                    {m.quote.rating ? `Nota ${m.quote.rating}/5` : ''}
                    {m.quote.comment ? ` · “${m.quote.comment}”` : ''}
                  </Text>
                </View>
              ) : null}
              {m.media && m.type === 'IMAGE' ? (
                <Image
                  source={{ uri: m.media.url }}
                  accessibilityLabel="Foto enviada"
                  style={{ width: 220, height: 220, borderRadius: 12 }}
                />
              ) : null}
              {m.media && m.type === 'VIDEO' ? <VideoBubble url={m.media.url} /> : null}
              {m.media && m.type === 'AUDIO' ? <AudioBubble url={m.media.url} color={fg} /> : null}
              {m.body ? <Text style={{ color: fg }}>{m.body}</Text> : null}
              <Text variant="caption" style={{ color: fg, opacity: 0.7, alignSelf: 'flex-end' }}>
                {time(m.createdAt)} {mine ? (m.status === 'READ' ? '✓✓' : '✓') : ''}
              </Text>
            </View>
          );
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing[2],
          padding: t.spacing[3],
          borderTopWidth: 1,
          borderTopColor: t.colors.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            mediaAllowed ? 'Enviar foto ou vídeo' : 'Mídia disponível no plano Pro'
          }
          onPress={() =>
            mediaAllowed
              ? void pick()
              : Alert.alert(
                  'Plano Pro',
                  'Foto, vídeo e áudio no chat são do plano Pro do seu personal.',
                )
          }
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text>{mediaAllowed ? '📎' : '🔒'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
          disabled={!mediaAllowed}
          onPress={() => void toggleRecord()}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: mediaAllowed ? 1 : 0.4,
          }}
        >
          <Text>{recording ? '⏹' : '🎤'}</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="Mensagem"
          placeholder={recording ? 'Gravando…' : 'Mensagem'}
          placeholderTextColor={t.colors.mutedForeground}
          value={text}
          onChangeText={(v) => {
            setText(v);
            emitTyping(conversationId);
          }}
          multiline
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            borderWidth: 1,
            borderColor: t.colors.input,
            borderRadius: t.radius.control,
            paddingHorizontal: t.spacing[3],
            color: t.colors.foreground,
            backgroundColor: t.colors.surface,
          }}
        />
        <Button
          title="Enviar"
          loading={sending}
          disabled={!text.trim()}
          onPress={() => {
            void send({ type: 'TEXT', body: text.trim() });
            setText('');
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
