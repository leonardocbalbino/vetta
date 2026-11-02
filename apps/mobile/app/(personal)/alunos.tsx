import { Card, EmptyState, Input, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';

interface Row {
  id: string;
  displayName: string;
  status: string;
  goal: string | null;
  lastWorkoutAt: string | null;
}

const since = (iso: string | null) => {
  if (!iso) return 'nunca treinou';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d === 0 ? 'treinou hoje' : `treinou há ${d} dia(s)`;
};

export default function Alunos() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['students', search],
    queryFn: () =>
      client.request<{ items: Row[] }>('GET', '/v1/students', undefined, {
        search,
        status: 'ACTIVE',
        pageSize: 100,
      }),
  });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <View style={{ padding: t.spacing[5], gap: t.spacing[3] }}>
        <Text variant="display">Alunos</Text>
        <Input label="Buscar" value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      {!q.data ? (
        <Skeleton height={200} />
      ) : (
        <FlatList
          data={q.data.items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            paddingHorizontal: t.spacing[5],
            gap: t.spacing[3],
            paddingBottom: 24,
          }}
          ListEmptyComponent={
            <EmptyState
              title="Nenhum aluno"
              description="Convide alunos pelo app web ou ajuste a busca."
            />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/aluno/${item.id}`)} accessibilityRole="button">
              <Card>
                <Text variant="title">{item.displayName}</Text>
                <Text muted>
                  {since(item.lastWorkoutAt)}
                  {item.goal ? ` · ${item.goal}` : ''}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
