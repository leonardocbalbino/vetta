import { Button, Card, Logo, Text, useTheme } from '@vetta/ui-native';
import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { modeOf, useSession } from '../src/lib/session';

const ROLE = {
  ALUNO: 'Treinar como aluno',
  PERSONAL: 'Atender como personal',
  PERSONAL_ASSISTENTE: 'Atender como assistente',
} as const;

/** Seleção de modo (personal x aluno) e de vínculo. */
export default function Vinculo() {
  const t = useTheme();
  const { me, choose, signOut } = useSession();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[6], gap: t.spacing[4] }}>
        <Logo />
        <Text variant="display">Como você quer entrar?</Text>
        {(me?.memberships ?? []).map((m) => (
          <Card key={m.tenantId + m.role}>
            <Text variant="title">{m.tenantName}</Text>
            <Text muted>{ROLE[m.role]}</Text>
            <Button
              title="Entrar"
              testID={`vinculo-${m.tenantSlug}`}
              variant={modeOf(m) === 'aluno' ? 'accent' : 'primary'}
              onPress={async () => {
                await choose(m);
                router.replace(modeOf(m) === 'aluno' ? '/(aluno)/treino' : '/(personal)/hoje');
              }}
            />
          </Card>
        ))}
        {!me?.memberships.length ? (
          <Text muted>Sua conta ainda não tem vínculo. Abra o convite do seu personal.</Text>
        ) : null}
        <Button
          title="Sair"
          variant="ghost"
          onPress={() => void signOut().then(() => router.replace('/login'))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
