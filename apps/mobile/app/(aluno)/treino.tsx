import type { ApiProgram } from '@vetta/sdk';
import { Button, Card, EmptyState, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';
import { fetchWithCache, pendingCount, syncPending } from '../../src/lib/offline';
import { useSession } from '../../src/lib/session';

export type Today = { programs: (ApiProgram & { lastSessionAt: string | null })[] };
export const todayKey = (tenantId: string) => `today:${tenantId}`;

/** Treino do dia: baixa e guarda no aparelho para treinar sem internet. */
export default function TreinoTab() {
  const t = useTheme();
  const { active } = useSession();
  const [pending, setPending] = useState(0);
  const q = useQuery({
    queryKey: ['today', active?.tenantId],
    enabled: !!active,
    queryFn: () =>
      fetchWithCache(todayKey(active!.tenantId), () =>
        client.request<Today>('GET', '/v1/training/today'),
      ),
  });
  useFocusEffect(
    useCallback(() => {
      void syncPending().then(() => pendingCount().then(setPending));
    }, []),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} />
        }
      >
        <Text variant="display">Treino do dia</Text>
        {q.data?.offline ? (
          <Card style={{ borderColor: t.colors.warning }}>
            <Text>Sem internet: mostrando o treino salvo no aparelho.</Text>
          </Card>
        ) : null}
        {pending ? (
          <Card>
            <Text testID="pending-sync">
              {pending} treino(s) aguardando internet para sincronizar.
            </Text>
          </Card>
        ) : null}
        {!q.data ? (
          <Skeleton height={160} />
        ) : !q.data.data.programs.length ? (
          <EmptyState
            title="Seu treino ainda não chegou"
            description="Assim que seu personal publicar, ele aparece aqui."
          />
        ) : (
          q.data.data.programs.map((p) => (
            <View key={p.id} style={{ gap: t.spacing[3] }}>
              <Text variant="title">{p.name}</Text>
              {p.routines.map((r) => (
                <Card
                  key={r.id}
                  style={
                    r.id === p.nextRoutineId
                      ? { borderColor: t.colors.accent, borderWidth: 2 }
                      : undefined
                  }
                >
                  <Text variant="title">
                    {r.label} {r.name ? `· ${r.name}` : ''}{' '}
                    {r.id === p.nextRoutineId ? '· sugerido hoje' : ''}
                  </Text>
                  <Text muted>{r.exercises.map((e) => e.exercise.name).join(' · ')}</Text>
                  <Button
                    title="Começar"
                    testID={`start-${r.label}`}
                    variant={r.id === p.nextRoutineId ? 'accent' : 'secondary'}
                    onPress={() =>
                      router.push({
                        pathname: '/player/[routineId]',
                        params: { routineId: r.id, programId: p.id },
                      })
                    }
                  />
                </Card>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
