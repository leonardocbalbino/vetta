import type { ApiProgram } from '@vetta/sdk';
import { Button, EmptyState, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { estimateMinutes, ExerciseCard } from '../../src/components/routine-preview';
import { client } from '../../src/lib/client';
import { fetchWithCache, pendingCount, syncPending } from '../../src/lib/offline';
import { useSession } from '../../src/lib/session';

export type Today = { programs: (ApiProgram & { lastSessionAt: string | null })[] };
export const todayKey = (tenantId: string) => `today:${tenantId}`;

const ago = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
};

/**
 * Treino do dia no modo visualização: escolha da rotina (a sugerida vem marcada), todos os
 * exercícios com séries, cargas, última execução, sugestão de carga e vídeo. "Começar" abre
 * o player. Fica salvo no aparelho para treinar sem internet.
 */
export default function TreinoTab() {
  const t = useTheme();
  const { active } = useSession();
  const [pending, setPending] = useState(0);
  const [selected, setSelected] = useState<{ programId: string; routineId: string } | null>(null);
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

  const programs = q.data?.data.programs ?? [];
  // Rotina sugerida do programa principal como padrão.
  useEffect(() => {
    if (selected || !programs.length) return;
    const p = programs.find((x) => !x.isExtra) ?? programs[0]!;
    const r = p.routines.find((x) => x.id === p.nextRoutineId) ?? p.routines[0];
    if (r) setSelected({ programId: p.id, routineId: r.id });
  }, [programs, selected]);

  const program = programs.find((p) => p.id === selected?.programId);
  const routine = program?.routines.find((r) => r.id === selected?.routineId);
  const start = () =>
    routine &&
    program &&
    router.push({
      pathname: '/player/[routineId]',
      params: { routineId: routine.id, programId: program.id },
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: t.spacing[8] }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} />
        }
        stickyHeaderIndices={routine ? [1] : undefined}
      >
        {/* Cabeçalho: programa, rotina e resumo */}
        <View
          style={{
            backgroundColor: t.colors.primary,
            paddingHorizontal: t.spacing[5],
            paddingTop: t.spacing[5],
            paddingBottom: t.spacing[4],
            gap: t.spacing[3],
          }}
        >
          <Text variant="caption" style={{ color: t.colors.primaryForeground, opacity: 0.8 }}>
            {program ? program.name : 'Treino do dia'}
          </Text>
          {programs.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2] }}>
              {programs.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    setSelected({
                      programId: p.id,
                      routineId: (p.routines.find((r) => r.id === p.nextRoutineId) ??
                        p.routines[0])!.id,
                    })
                  }
                  accessibilityRole="tab"
                  accessibilityState={{ selected: p.id === program?.id }}
                  style={{
                    minHeight: 32,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: t.colors.primaryForeground,
                    opacity: p.id === program?.id ? 1 : 0.6,
                  }}
                >
                  <Text variant="label" style={{ color: t.colors.primaryForeground }}>
                    {p.isExtra ? `Extra: ${p.name}` : p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {program ? (
            <View style={{ flexDirection: 'row', gap: t.spacing[2] }} accessibilityRole="tablist">
              {program.routines.map((r) => {
                const on = r.id === routine?.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelected({ programId: program.id, routineId: r.id })}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Treino ${r.label}${r.id === program.nextRoutineId ? ', sugerido hoje' : ''}`}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: t.radius.control,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? t.colors.accent : 'transparent',
                      borderWidth: on ? 0 : 1,
                      borderColor: t.colors.primaryForeground,
                    }}
                  >
                    <Text
                      variant="title"
                      style={{ color: on ? t.colors.accentForeground : t.colors.primaryForeground }}
                    >
                      {r.label}
                    </Text>
                    {r.id === program.nextRoutineId && !on ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: t.colors.accent,
                        }}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {routine ? (
            <>
              <Text variant="display" style={{ color: t.colors.primaryForeground }}>
                {routine.name ?? `Treino ${routine.label}`}
              </Text>
              <Text variant="caption" style={{ color: t.colors.primaryForeground, opacity: 0.8 }}>
                {routine.exercises.length} exercícios · ~{estimateMinutes(routine)} min
                {routine.id === program?.nextRoutineId ? ' · sugerido para hoje' : ''}
                {program?.lastSessionAt ? ` · último treino ${ago(program.lastSessionAt)}` : ''}
              </Text>
            </>
          ) : null}
        </View>

        {/* Ação principal, fixa ao rolar */}
        {routine ? (
          <View
            style={{
              backgroundColor: t.colors.background,
              paddingHorizontal: t.spacing[5],
              paddingVertical: t.spacing[3],
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border,
              gap: t.spacing[1],
            }}
          >
            <Button
              title={`Começar treino ${routine.label}`}
              variant="accent"
              onPress={start}
              testID={`start-${routine.label}`}
            />
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              Você está vendo o treino. Toque em Começar para registrar cargas e o descanso.
            </Text>
          </View>
        ) : (
          <View />
        )}

        <View style={{ padding: t.spacing[5], gap: t.spacing[3] }}>
          {q.data?.offline ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: t.colors.warning,
                borderRadius: t.radius.card,
                padding: t.spacing[3],
              }}
            >
              <Text>Sem internet: mostrando o treino salvo no aparelho.</Text>
            </View>
          ) : null}
          {pending ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: t.colors.border,
                borderRadius: t.radius.card,
                padding: t.spacing[3],
              }}
            >
              <Text testID="pending-sync">
                {pending} treino(s) aguardando internet para sincronizar.
              </Text>
            </View>
          ) : null}

          {!q.data ? (
            <Skeleton height={200} />
          ) : !programs.length ? (
            <EmptyState
              title="Seu treino ainda não chegou"
              description="Assim que seu personal publicar, ele aparece aqui."
            />
          ) : routine ? (
            <>
              {routine.notes ? (
                <View
                  style={{
                    backgroundColor: t.colors.muted,
                    borderRadius: t.radius.card,
                    padding: t.spacing[4],
                  }}
                >
                  <Text variant="label">Recado do seu personal</Text>
                  <Text>{routine.notes}</Text>
                </View>
              ) : null}
              {routine.exercises.map((item, i) => {
                const group = item.groupKey
                  ? routine.exercises.filter((x) => x.groupKey === item.groupKey).length > 1
                  : false;
                return <ExerciseCard key={item.id} item={item} index={i} grouped={group} />;
              })}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
