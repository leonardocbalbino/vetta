import { Button, Card, Input, Switch, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Appearance, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';
import { scheduleDailyReminder } from '../../src/lib/notifications';
import { useSession } from '../../src/lib/session';

export default function Perfil() {
  const t = useTheme();
  const { me, active, signOut } = useSession();
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState('07:00');
  const anamneses = useQuery({
    queryKey: ['anamneses', active?.tenantId],
    queryFn: () =>
      client.request<{ id: string; status: string; template: { name: string } }[]>(
        'GET',
        '/v1/anamnesis/responses',
      ),
  });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        <Text variant="display">{me?.name ?? 'Perfil'}</Text>
        <Text muted>{active?.tenantName}</Text>
        <Card>
          <Text variant="title">Anamnese</Text>
          {(anamneses.data ?? []).map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push(`/anamnese/${a.id}`)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text>
                {a.template.name} · {a.status === 'PENDING' ? 'responder' : 'respondida'}
              </Text>
            </Pressable>
          ))}
          {anamneses.data && !anamneses.data.length ? <Text muted>Nada pendente.</Text> : null}
        </Card>
        <Card>
          <Switch label="Lembrete diário de treino" value={reminder} onValueChange={setReminder} />
          {reminder ? (
            <Input
              label="Horário (HH:MM)"
              value={time}
              onChangeText={setTime}
              keyboardType="numbers-and-punctuation"
            />
          ) : null}
          <Button
            title="Salvar lembrete"
            variant="secondary"
            onPress={async () => {
              if (reminder && !/^\d{2}:\d{2}$/.test(time))
                return Alert.alert('Horário inválido', 'Use o formato HH:MM.');
              await scheduleDailyReminder(reminder ? time : null);
              await client
                .request('PATCH', '/v1/me', {
                  trainingReminderEnabled: reminder,
                  trainingReminderTime: reminder ? time : null,
                })
                .catch(() => undefined);
              Alert.alert(
                'Pronto',
                reminder ? `Vamos te lembrar todo dia às ${time}.` : 'Lembrete desligado.',
              );
            }}
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
