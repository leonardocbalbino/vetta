import { useTheme } from '@vetta/ui-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatScreen } from '../../src/components/chat-screen';

/** Personal/assistente: conversa com um aluno. */
export default function StaffChat() {
  const t = useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: name ?? 'Conversa' }} />
      <ChatScreen conversationId={id} staff />
    </SafeAreaView>
  );
}
