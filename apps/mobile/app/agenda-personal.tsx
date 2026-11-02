import { Button, Card, Text, useTheme } from '@vetta/ui-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, SectionList, View } from 'react-native';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';

interface Appointment {
  id: string;
  title: string;
  type: 'IN_PERSON' | 'ONLINE';
  status: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetingUrl: string | null;
  capacity: number;
  attendees: {
    id: string;
    studentLinkId: string;
    status: string;
    studentLink?: { displayName: string };
  }[];
}

const DAY = 86_400_000;
const hour = (d: string) =>
  new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const ATT: Record<string, string> = {
  BOOKED: 'reservado',
  CONFIRMED: 'confirmado',
  CANCELED: 'cancelou',
  ATTENDED: 'presente',
  NO_SHOW: 'faltou',
};

/** Personal: próximas aulas em lista, com presença e falta. Visão de calendário fica na web. */
export default function PersonalAgenda() {
  const t = useTheme();
  const qc = useQueryClient();
  const { active } = useSession();
  const [range] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: new Date(start.getTime() + 14 * DAY).toISOString() };
  });
  const list = useQuery({
    queryKey: ['staff-agenda', active?.tenantId],
    queryFn: () =>
      client.request<Appointment[]>(
        'GET',
        `/v1/schedule/appointments?from=${range.from}&to=${range.to}`,
      ),
  });
  const mark = useMutation({
    mutationFn: (b: { id: string; studentLinkId: string; status: 'ATTENDED' | 'NO_SHOW' }) =>
      client.request('POST', `/v1/schedule/appointments/${b.id}/attendance`, {
        items: [{ studentLinkId: b.studentLinkId, status: b.status }],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-agenda'] }),
    onError: (e) => Alert.alert('Presença', (e as Error).message),
  });
  const sections = Object.values(
    (list.data ?? [])
      .filter((a) => a.status !== 'CANCELED')
      .reduce<Record<string, { title: string; data: Appointment[] }>>((acc, a) => {
        const k = new Date(a.startsAt).toDateString();
        (acc[k] ??= { title: dayLabel(a.startsAt), data: [] }).data.push(a);
        return acc;
      }, {}),
  );
  return (
    <>
      <Stack.Screen options={{ title: 'Agenda' }} />
      <SectionList
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={{ padding: t.spacing[4], gap: t.spacing[2] }}
        sections={sections}
        keyExtractor={(a) => a.id}
        refreshing={list.isFetching}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={<Text muted>Nenhuma aula nos próximos 14 dias.</Text>}
        renderSectionHeader={({ section }) => (
          <Text variant="label" style={{ marginTop: 12, textTransform: 'capitalize' }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item: a }) => (
          <Card>
            <Text variant="title">
              {hour(a.startsAt)} · {a.title}
            </Text>
            <Text muted>
              {a.type === 'ONLINE' ? 'Online' : (a.location ?? 'Presencial')}
              {a.capacity > 1
                ? ` · ${a.attendees.filter((x) => x.status !== 'CANCELED').length}/${a.capacity}`
                : ''}
            </Text>
            {a.meetingUrl ? (
              <Button
                title="Abrir chamada"
                variant="action"
                onPress={() => void Linking.openURL(a.meetingUrl!)}
              />
            ) : null}
            {a.attendees.map((x) => (
              <View
                key={x.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
              >
                <Text style={{ flex: 1 }}>
                  {x.studentLink?.displayName} · {ATT[x.status] ?? x.status}
                </Text>
                {['BOOKED', 'CONFIRMED'].includes(x.status) &&
                new Date(a.startsAt) <= new Date() ? (
                  <>
                    <Button
                      title="Presente"
                      variant="accent"
                      onPress={() =>
                        mark.mutate({
                          id: a.id,
                          studentLinkId: x.studentLinkId,
                          status: 'ATTENDED',
                        })
                      }
                    />
                    <Button
                      title="Faltou"
                      variant="ghost"
                      onPress={() =>
                        mark.mutate({ id: a.id, studentLinkId: x.studentLinkId, status: 'NO_SHOW' })
                      }
                    />
                  </>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      />
    </>
  );
}
