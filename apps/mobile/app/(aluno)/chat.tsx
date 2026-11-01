import { EmptyState, useTheme } from '@vetta/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Chat() {
  const t = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: t.colors.background, justifyContent: 'center' }}
    >
      <EmptyState
        title="Chat em breve"
        description="As respostas do seu personal aos feedbacks já ficam guardadas e aparecem aqui na próxima versão."
      />
    </SafeAreaView>
  );
}
