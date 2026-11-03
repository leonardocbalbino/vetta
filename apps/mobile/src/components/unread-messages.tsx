import { useFeature } from '@vetta/sdk/react';
import { Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { client } from '../lib/client';
import { useRealtime } from '../lib/realtime';
import { useSession } from '../lib/session';

/** Mensagens não lidas do vínculo ativo (socket + a cada minuto + ao focar a tela). */
export function useUnreadMessages() {
  const { active } = useSession();
  const chat = useFeature(active?.tenantId ?? null, 'comms.chat');
  const enabled = !!active && !chat.locked && !chat.loading;
  const q = useQuery({
    queryKey: ['chat-unread', active?.tenantId],
    enabled,
    refetchInterval: 60_000,
    queryFn: () =>
      client.request<{ total: number; conversations: number }>('GET', '/v1/chat/unread'),
  });
  useRealtime('chat:message', () => void q.refetch());
  useRealtime('chat:read', () => void q.refetch());
  return {
    total: q.data?.total ?? 0,
    conversations: q.data?.conversations ?? 0,
    refetch: q.refetch,
  };
}

/** Número para o tabBarBadge (undefined esconde o badge). */
export const tabBadge = (n: number) => (n ? (n > 99 ? '99+' : n) : undefined);

/** Alerta no início: toque leva às mensagens. */
export function UnreadMessagesAlert({ href }: { href: '/(aluno)/chat' | '/conversas' }) {
  const t = useTheme();
  const { total, conversations, refetch } = useUnreadMessages();
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  if (!total) return null;
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${total} mensagens não lidas. Abrir mensagens`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[3],
        padding: t.spacing[4],
        borderRadius: t.radius.card,
        borderWidth: 1,
        borderColor: t.colors.action,
        backgroundColor: t.colors.surface,
        minHeight: 44,
      }}
    >
      <View>
        <Text style={{ fontSize: 22 }}>💬</Text>
        <View
          style={{
            position: 'absolute',
            right: -2,
            top: -2,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: t.colors.danger,
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label">
          {total === 1 ? 'Você tem 1 mensagem não lida' : `Você tem ${total} mensagens não lidas`}
        </Text>
        {conversations > 1 ? (
          <Text variant="caption" muted>
            em {conversations} conversas
          </Text>
        ) : null}
      </View>
      <Text variant="label" style={{ color: t.colors.link }}>
        Abrir
      </Text>
    </Pressable>
  );
}
