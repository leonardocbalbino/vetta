import { Button, Card, EmptyState, Text, useTheme } from '@vetta/ui-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/lib/session';

const DAY = 86_400_000;
const when = (d: string) =>
  new Date(d).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

interface Appointment {
  id: string;
  title: string;
  startsAt: string;
  meetingUrl: string | null;
  location: string | null;
  status: string;
  attendees: { status: string }[];
}
interface Slots {
  slots: { startsAt: string }[];
  classes: { appointmentId: string; title: string; startsAt: string; spotsLeft: number }[];
}

/** Aluno: minhas aulas (confirmar e cancelar) e horários livres para agendar. */
export default function Agenda() {
  const t = useTheme();
  const qc = useQueryClient();
  const { active } = useSession();
  // Intervalo fixo por montagem: datas na chave da consulta não podem mudar a cada render.
  const [range] = useState(() => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    return {
      from: new Date(now).toISOString(),
      to: new Date(now + 14 * DAY).toISOString(),
      mineFrom: new Date(now - DAY).toISOString(),
      mineTo: new Date(now + 60 * DAY).toISOString(),
    };
  });
  const mine = useQuery({
    queryKey: ['my-appointments', active?.tenantId],
    queryFn: () =>
      client.request<Appointment[]>(
        'GET',
        `/v1/schedule/appointments?from=${range.mineFrom}&to=${range.mineTo}`,
      ),
  });
  const slots = useQuery({
    queryKey: ['slots', active?.tenantId],
    queryFn: () =>
      client.request<Slots>('GET', `/v1/schedule/slots?from=${range.from}&to=${range.to}`),
  });
  const act = useMutation({
    mutationFn: (a: { path: string; body?: object }) =>
      client.request('POST', a.path, a.body ?? {}),
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) => ['my-appointments', 'slots'].includes(String(q.queryKey[0])),
      }),
    onError: (e) => Alert.alert('Agenda', (e as Error).message),
  });
  if (slots.error && (slots.error as { status?: number }).status === 402)
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: t.colors.background, justifyContent: 'center' }}
      >
        <EmptyState
          title="Agenda indisponível"
          description="Seu personal ainda não usa a agenda pelo app."
        />
      </SafeAreaView>
    );
  const upcoming = (mine.data ?? []).filter((a) => a.status !== 'CANCELED');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        <Text variant="display">Agenda</Text>
        <Card>
          <Text variant="title">Minhas aulas</Text>
          {upcoming.length ? (
            upcoming.map((a) => {
              const me = a.attendees[0];
              return (
                <View
                  key={a.id}
                  style={{
                    gap: 6,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: t.colors.border,
                  }}
                >
                  <Text variant="label">
                    {when(a.startsAt)} · {a.title}
                  </Text>
                  {a.location ? <Text muted>{a.location}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {a.meetingUrl ? (
                      <Button
                        title="Entrar na chamada"
                        variant="action"
                        onPress={() => void Linking.openURL(a.meetingUrl!)}
                      />
                    ) : null}
                    {me?.status === 'BOOKED' ? (
                      <Button
                        title="Confirmar"
                        variant="accent"
                        onPress={() =>
                          act.mutate({ path: `/v1/schedule/appointments/${a.id}/confirm` })
                        }
                      />
                    ) : null}
                    {me && ['BOOKED', 'CONFIRMED'].includes(me.status) ? (
                      <Button
                        title="Cancelar"
                        variant="ghost"
                        onPress={() =>
                          act.mutate({ path: `/v1/schedule/appointments/${a.id}/leave` })
                        }
                      />
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <Text muted>Nenhuma aula marcada.</Text>
          )}
        </Card>
        {slots.data?.classes.length ? (
          <Card>
            <Text variant="title">Turmas com vaga</Text>
            {slots.data.classes.map((c) => (
              <View key={c.appointmentId} style={{ gap: 6, paddingVertical: 8 }}>
                <Text>
                  {when(c.startsAt)} · {c.title} ({c.spotsLeft} vagas)
                </Text>
                <Button
                  title="Entrar na turma"
                  variant="accent"
                  onPress={() =>
                    act.mutate({
                      path: '/v1/schedule/book',
                      body: { startsAt: c.startsAt, appointmentId: c.appointmentId },
                    })
                  }
                />
              </View>
            ))}
          </Card>
        ) : null}
        <Card>
          <Text variant="title">Horários livres</Text>
          {slots.isLoading ? (
            <Text muted>Carregando…</Text>
          ) : slots.data?.slots.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {slots.data.slots.map((s) => (
                <Button
                  key={s.startsAt}
                  title={when(s.startsAt)}
                  variant="secondary"
                  onPress={() =>
                    Alert.alert('Agendar aula', `Confirmar ${when(s.startsAt)}?`, [
                      { text: 'Não' },
                      {
                        text: 'Agendar',
                        onPress: () =>
                          act.mutate({ path: '/v1/schedule/book', body: { startsAt: s.startsAt } }),
                      },
                    ])
                  }
                />
              ))}
            </View>
          ) : (
            <Text muted>Sem horários livres agora. Fale com seu personal pelo chat.</Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
