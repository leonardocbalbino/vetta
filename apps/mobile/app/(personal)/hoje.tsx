import { Card, PlanBadge, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UnreadMessagesAlert } from '../../src/components/unread-messages';
import { client } from '../../src/lib/client';

interface Dashboard {
  activeStudents: number;
  workoutsToday: number;
  pendingFeedbacks: number;
  alerts: {
    inactive: { id: string; name: string; whatsapp: string | null; lastWorkoutAt: string | null }[];
    inactivityDays: number;
    birthdays: { id: string; name: string; inDays: number }[];
    reassessments: {
      assessmentId: string;
      date: string;
      student: { id: string; displayName: string };
    }[];
  };
  plan: { code: 'FREE' | 'PRO' | 'PRO_PLUS'; name: string };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ flex: 1 }}>
      <Text variant="display">{value}</Text>
      <Text muted variant="caption">
        {label}
      </Text>
    </Card>
  );
}

/** Resumo do dia do personal: números, alunos sumidos, aniversários e reavaliações. */
export default function Hoje() {
  const t = useTheme();
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => client.request<Dashboard>('GET', '/v1/dashboard'),
  });
  const d = q.data;
  const open = (id: string) => router.push(`/aluno/${id}`);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} />
        }
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="display">Hoje</Text>
          {d ? <PlanBadge plan={d.plan.code} /> : null}
        </View>
        <UnreadMessagesAlert href="/conversas" />
        {!d ? (
          <Skeleton height={200} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
              <Stat label="Alunos ativos" value={d.activeStudents} />
              <Stat label="Treinos hoje" value={d.workoutsToday} />
              <Stat label="Feedbacks" value={d.pendingFeedbacks} />
            </View>
            <Card>
              <Text variant="title">Sumidos há {d.alerts.inactivityDays}+ dias</Text>
              {d.alerts.inactive.length ? (
                d.alerts.inactive.map((s) => (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      minHeight: 44,
                    }}
                  >
                    <Pressable
                      onPress={() => open(s.id)}
                      style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                    >
                      <Text>{s.name}</Text>
                    </Pressable>
                    {s.whatsapp ? (
                      <Pressable
                        accessibilityLabel={`Chamar ${s.name} no WhatsApp`}
                        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
                        onPress={() =>
                          void Linking.openURL(
                            `https://wa.me/${s.whatsapp!.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi, ${s.name.split(' ')[0]}! Senti sua falta nos treinos. Bora voltar essa semana?`)}`,
                          )
                        }
                      >
                        <Text style={{ color: t.colors.action }}>WhatsApp</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text muted>Todo mundo treinando. 💪</Text>
              )}
            </Card>
            {d.alerts.birthdays.length ? (
              <Card>
                <Text variant="title">Aniversários</Text>
                {d.alerts.birthdays.map((b) => (
                  <Text key={b.id}>
                    🎂 {b.name} · {b.inDays === 0 ? 'hoje' : `em ${b.inDays} dia(s)`}
                  </Text>
                ))}
              </Card>
            ) : null}
            {d.alerts.reassessments.length ? (
              <Card>
                <Text variant="title">Reavaliações</Text>
                {d.alerts.reassessments.map((r) => (
                  <Pressable
                    key={r.assessmentId}
                    onPress={() => open(r.student.id)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text>
                      {r.student.displayName} · {new Date(r.date).toLocaleDateString('pt-BR')}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
