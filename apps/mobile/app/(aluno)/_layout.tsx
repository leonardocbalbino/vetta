import { Button, Text as UiText, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/lib/session';
import { Text, type ColorValue } from 'react-native';

const icon = (glyph: string) => {
  const TabIcon = ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 20 }}>{glyph}</Text>
  );
  return TabIcon;
};

/**
 * Modo Aluno: Treino, Evolução, Agenda, Chat e Perfil. Com o acesso pausado por
 * inadimplência, mostra a explicação e o caminho para pagar no lugar das abas.
 */
export default function AlunoTabs() {
  const t = useTheme();
  const { active } = useSession();
  const fin = useQuery({
    queryKey: ['my-finance', active?.tenantId],
    queryFn: () => client.request<{ blocked: boolean }>('GET', '/v1/me/finance'),
  });
  if (fin.data?.blocked)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: t.colors.background,
          padding: t.spacing[5],
          justifyContent: 'center',
          gap: t.spacing[4],
        }}
      >
        <UiText variant="display">Seu acesso está pausado</UiText>
        <UiText>
          Existe uma cobrança em aberto com seu personal. Assim que o pagamento for confirmado, seus
          treinos voltam na hora.
        </UiText>
        <Button title="Ver e pagar" variant="accent" onPress={() => router.push('/pagamentos')} />
        <Button title="Atualizar" variant="ghost" onPress={() => void fin.refetch()} />
      </SafeAreaView>
    );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.foreground,
        tabBarInactiveTintColor: t.colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          minHeight: 60,
        },
        tabBarLabelStyle: { fontFamily: t.fonts.sansSemibold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="treino" options={{ title: 'Treino', tabBarIcon: icon('🏋️') }} />
      <Tabs.Screen name="evolucao" options={{ title: 'Evolução', tabBarIcon: icon('📈') }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
