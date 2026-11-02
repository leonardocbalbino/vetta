import { EmptyState, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatScreen } from '../../src/components/chat-screen';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/lib/session';

/** Aluno: conversa com o personal (texto; foto, vídeo e áudio quando o plano dele permite). */
export default function Chat() {
  const t = useTheme();
  const { active } = useSession();
  const conv = useQuery({
    queryKey: ['my-conversation', active?.tenantId],
    queryFn: () =>
      client.request<{ id: string; tenantName: string }[]>('GET', '/v1/chat/conversations'),
  });
  const c = conv.data?.[0];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top']}>
      <View
        style={{ padding: t.spacing[4], borderBottomWidth: 1, borderBottomColor: t.colors.border }}
      >
        <Text variant="title">{c?.tenantName ?? 'Seu personal'}</Text>
      </View>
      {conv.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : c ? (
        <ChatScreen conversationId={c.id} staff={false} />
      ) : (
        <EmptyState
          title="Chat indisponível"
          description="Não foi possível abrir a conversa agora."
        />
      )}
    </SafeAreaView>
  );
}
