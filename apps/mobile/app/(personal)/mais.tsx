import { Button, Card, Text, useTheme } from '@vetta/ui-native';
import { router } from 'expo-router';
import { Appearance, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../src/lib/session';

const WEB = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://app.vettafit.com.br';

export default function Mais() {
  const t = useTheme();
  const { me, active, signOut } = useSession();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        <Text variant="display">{me?.name}</Text>
        <Text muted>{active?.tenantName}</Text>
        <Button title="Mensagens" variant="secondary" onPress={() => router.push('/conversas')} />
        <Button
          title="Agenda"
          variant="secondary"
          onPress={() => router.push('/agenda-personal')}
        />
        <Button
          title="Gravar vídeo de exercício"
          variant="secondary"
          onPress={() => router.push('/video-exercicio')}
        />
        {active?.role === 'PERSONAL' ? (
          <Button
            title="Assinatura"
            variant="secondary"
            onPress={() => router.push('/assinatura')}
          />
        ) : null}
        <Card>
          <Text variant="title">No computador</Text>
          <Text muted>
            Construtor de treinos completo, biblioteca, convites e assinatura ficam no app web.
          </Text>
          <Button
            title="Abrir app web"
            variant="secondary"
            onPress={() => void Linking.openURL(WEB)}
          />
        </Card>
        <Button
          title="Alternar tema claro/escuro"
          variant="ghost"
          onPress={() =>
            Appearance.setColorScheme(Appearance.getColorScheme() === 'dark' ? 'light' : 'dark')
          }
        />
        {me && me.memberships.length > 1 ? (
          <Button
            title="Trocar vínculo ou modo"
            variant="secondary"
            onPress={() => router.push('/vinculo')}
          />
        ) : null}
        <Button
          title="Sair"
          variant="destructive"
          onPress={() => void signOut().then(() => router.replace('/login'))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
