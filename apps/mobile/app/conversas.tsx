import { Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { client } from '../src/lib/client';
import { useRealtime } from '../src/lib/realtime';
import { useSession } from '../src/lib/session';

interface Conversation {
  id: string;
  studentLink: { id: string; displayName: string };
  lastMessagePreview: string | null;
  unread: number;
}

/** Personal: conversas com os alunos (não lidas primeiro no destaque). */
export default function Conversations() {
  const t = useTheme();
  const { active } = useSession();
  const list = useQuery({
    queryKey: ['conversations', active?.tenantId],
    queryFn: () => client.request<Conversation[]>('GET', '/v1/chat/conversations'),
  });
  useRealtime('chat:message', () => void list.refetch());
  return (
    <>
      <Stack.Screen options={{ title: 'Mensagens' }} />
      <FlatList
        style={{ backgroundColor: t.colors.background }}
        data={list.data ?? []}
        keyExtractor={(c) => c.id}
        refreshing={list.isFetching}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          <Text muted style={{ padding: 20 }}>
            Nenhuma conversa ainda.
          </Text>
        }
        renderItem={({ item: c }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/chat/[id]',
                params: { id: c.id, name: c.studentLink.displayName },
              })
            }
            style={{
              padding: t.spacing[4],
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border,
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="label">{c.studentLink.displayName}</Text>
              <Text muted numberOfLines={1}>
                {c.lastMessagePreview ?? 'Sem mensagens'}
              </Text>
            </View>
            {c.unread ? (
              <View
                style={{
                  backgroundColor: t.colors.action,
                  borderRadius: 999,
                  minWidth: 24,
                  paddingHorizontal: 6,
                }}
              >
                <Text style={{ color: t.colors.actionForeground, textAlign: 'center' }}>
                  {c.unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </>
  );
}
