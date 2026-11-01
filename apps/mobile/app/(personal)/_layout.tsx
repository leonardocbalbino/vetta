import { useTheme } from '@vetta/ui-native';
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

const icon = (glyph: string) => {
  const TabIcon = ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 20 }}>{glyph}</Text>
  );
  return TabIcon;
};

/** Modo Personal: Hoje, Alunos, Feedbacks e Mais. */
export default function PersonalTabs() {
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
      <Tabs.Screen name="hoje" options={{ title: 'Hoje', tabBarIcon: icon('☀️') }} />
      <Tabs.Screen name="alunos" options={{ title: 'Alunos', tabBarIcon: icon('👥') }} />
      <Tabs.Screen name="feedbacks" options={{ title: 'Feedbacks', tabBarIcon: icon('⭐') }} />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
