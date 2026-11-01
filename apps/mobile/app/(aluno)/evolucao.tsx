import { Button, Card, LineChart, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';
import { fetchWithCache } from '../../src/lib/offline';
import { useSession } from '../../src/lib/session';

interface Overview {
  weight: { date: string; value: number }[];
  bodyFat: { date: string; value: number }[];
  exercises: { name: string; points: { date: string; maxLoadKg: number }[] }[];
}

export default function Evolucao() {
  const t = useTheme();
  const { active } = useSession();
  const q = useQuery({
    queryKey: ['progress', active?.tenantId],
    enabled: !!active,
    queryFn: () =>
      fetchWithCache(`progress:${active!.tenantId}`, () =>
        client.request<Overview>('GET', '/v1/progress/me'),
      ),
  });
  const o = q.data?.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        <Text variant="display">Evolução</Text>
        <Button
          title="Tirar foto de progresso"
          variant="accent"
          onPress={() => router.push('/foto')}
        />
        {!o ? (
          <Skeleton height={200} />
        ) : (
          <>
            <Card>
              <LineChart
                title="Peso"
                unit="kg"
                data={o.weight.map((p) => ({ x: p.date, y: p.value }))}
              />
            </Card>
            <Card>
              <LineChart
                title="% de gordura"
                unit="%"
                data={o.bodyFat.map((p) => ({ x: p.date, y: p.value }))}
              />
            </Card>
            {o.exercises.slice(0, 3).map((e) => (
              <Card key={e.name}>
                <LineChart
                  title={`Carga · ${e.name}`}
                  unit="kg"
                  data={e.points.map((p) => ({ x: p.date, y: p.maxLoadKg }))}
                />
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
