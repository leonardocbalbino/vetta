import type { ApiProgram } from '@vetta/sdk';
import { ApiRequestError } from '@vetta/sdk';
import { Button, Card, Input, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';

type Program = ApiProgram & { goal: string | null; startsOn: string | null; endsOn: string | null };
const num = (v: string | number | null) =>
  v === null || v === '' ? null : Number(String(v).replace(',', '.'));
const day = (v: string | null) => (v ? v.slice(0, 10) : null);

/** Converte o programa da API para o corpo do PUT (mantendo ids para reconciliar). */
function toInput(p: Program) {
  return {
    name: p.name,
    goal: p.goal,
    startsOn: day(p.startsOn),
    endsOn: day(p.endsOn),
    routines: p.routines.map((r) => ({
      id: r.id,
      label: r.label,
      name: r.name,
      notes: r.notes,
      items: r.exercises.map((i) => ({
        id: i.id,
        exerciseId: i.exerciseId,
        method: i.method,
        groupId: i.groupKey,
        restSeconds: i.restSeconds,
        notes: i.notes,
        sets: i.sets.map((s) => ({
          id: s.id,
          type: s.type,
          reps: s.reps,
          targetLoadKg: num(s.targetLoadKg),
          durationSeconds: s.durationSeconds,
          restSeconds: s.restSeconds,
          rpe: num(s.rpe),
          rir: s.rir,
          cadence: s.cadence,
          notes: s.notes,
        })),
      })),
    })),
  };
}

/** Edição rápida: reps, carga e descanso de cada série. Estrutura completa fica no construtor web. */
export default function EditarTreino() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['program', id],
    queryFn: () => client.request<Program>('GET', `/v1/programs/${id}`),
  });
  const [p, setP] = useState<Program | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setP(structuredClone(q.data));
  }, [q.data]);
  if (!p) return <Skeleton height={300} />;
  const edit = (
    ri: number,
    ii: number,
    si: number,
    field: 'reps' | 'targetLoadKg' | 'restSeconds',
    v: string,
  ) =>
    setP((cur) => {
      const d = structuredClone(cur!);
      const s = d.routines[ri]!.exercises[ii]!.sets[si]!;
      if (field === 'reps') s.reps = v || null;
      else if (field === 'targetLoadKg') s.targetLoadKg = v === '' ? null : v;
      else s.restSeconds = v === '' ? null : Number(v);
      return d;
    });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: p.name, headerShown: true }} />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {p.routines.map((r, ri) => (
          <View key={r.id} style={{ gap: t.spacing[3] }}>
            <Text variant="title">
              Treino {r.label} {r.name ? `· ${r.name}` : ''}
            </Text>
            {r.exercises.map((i, ii) => (
              <Card key={i.id}>
                <Text variant="label">{i.exercise.name}</Text>
                {i.sets.map((s, si) => (
                  <View key={s.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <Text muted style={{ width: 24, paddingBottom: 14 }}>
                      {si + 1}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Reps"
                        value={s.reps ?? ''}
                        onChangeText={(v) => edit(ri, ii, si, 'reps', v)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Kg"
                        keyboardType="decimal-pad"
                        value={s.targetLoadKg === null ? '' : String(s.targetLoadKg)}
                        onChangeText={(v) => edit(ri, ii, si, 'targetLoadKg', v)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Desc. (s)"
                        keyboardType="number-pad"
                        value={s.restSeconds === null ? '' : String(s.restSeconds)}
                        onChangeText={(v) => edit(ri, ii, si, 'restSeconds', v)}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            ))}
          </View>
        ))}
        <Button
          title="Salvar alterações"
          variant="action"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await client.request('PUT', `/v1/programs/${id}`, toInput(p));
              Alert.alert('Treino salvo', 'O aluno já vê a versão nova.');
              void q.refetch();
            } catch (e) {
              Alert.alert(
                'Não foi possível salvar',
                e instanceof ApiRequestError ? e.message : 'Verifique sua conexão.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
