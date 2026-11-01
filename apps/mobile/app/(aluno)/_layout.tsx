import { useTheme } from '@vetta/ui-native';
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

const icon = (glyph: string) => {
  const TabIcon = ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 20 }}>{glyph}</Text>
  );
  return TabIcon;
};

/** Modo Aluno: Treino, Evolução, Chat e Perfil. */
export default function AlunoTabs() {
  const t = useTheme();
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
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
