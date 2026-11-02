import { useFeature } from '@vetta/sdk/react';
import { Button, Card, EmptyState, LockedFeature, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { client } from '../src/lib/client';
import { HEALTH_APP_NAME, HEALTH_SOURCE, syncHealth } from '../src/lib/health';
import { useSession } from '../src/lib/session';

interface Sample {
  id: string;
  type: 'STEPS' | 'HEART_RATE' | 'WEIGHT' | 'WORKOUT';
  startAt: string;
  value: number;
  unit: string;
}

const LABEL: Record<Sample['type'], string> = {
  STEPS: 'Passos',
  HEART_RATE: 'Frequência cardíaca média',
  WEIGHT: 'Peso',
  WORKOUT: 'Treinos',
};
const day = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

/** Aluno: conectar Apple Saúde / Health Connect, importar dados e exportar treinos. */
export default function Health() {
  const t = useTheme();
  const { active } = useSession();
  const feature = useFeature(active?.tenantId ?? null, 'progress.health_integrations');
  const [busy, setBusy] = useState(false);
  const samples = useQuery({
    queryKey: ['health', active?.tenantId],
    enabled: !feature.locked && !feature.loading,
    queryFn: () => client.request<Sample[]>('GET', '/v1/integrations/health/samples'),
  });
  const latest = (type: Sample['type']) =>
    (samples.data ?? []).filter((s) => s.type === type).slice(-1)[0];

  const connect = async () => {
    setBusy(true);
    try {
      const r = await syncHealth();
      Alert.alert(
        'Tudo certo',
        `${r.imported} registro(s) importado(s) e ${r.exported} treino(s) enviado(s) ao ${HEALTH_APP_NAME}.`,
      );
      void samples.refetch();
    } catch (e) {
      Alert.alert(
        'Não foi possível conectar',
        e instanceof Error && e.message === 'unavailable'
          ? `${HEALTH_APP_NAME} não está disponível neste aparelho ou nesta versão do app.`
          : 'Confira as permissões e tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Saúde' }} />
      <LockedFeature
        locked={feature.locked}
        title="Apple Saúde e Health Connect"
        description="Disponível quando seu personal está no plano Pro Plus."
        onUpgrade={() =>
          Alert.alert(
            'Recurso do plano Pro Plus',
            'Fale com seu personal para liberar a integração.',
          )
        }
      >
        <Card>
          <Text variant="title">{HEALTH_APP_NAME}</Text>
          <Text>
            Importe passos, frequência cardíaca, peso e treinos dos últimos 30 dias para o seu
            personal acompanhar. Os treinos feitos na Vetta também vão para o {HEALTH_APP_NAME}.
          </Text>
          <Text variant="caption">
            Você escolhe na próxima tela o que autorizar e pode revogar quando quiser nas
            configurações do aparelho.
          </Text>
          <Button
            title={busy ? 'Sincronizando…' : `Conectar e sincronizar`}
            variant="accent"
            disabled={busy || !HEALTH_SOURCE}
            onPress={() => void connect()}
          />
        </Card>
        {!samples.data?.length ? (
          <EmptyState title="Nenhum dado ainda" description="Conecte para ver seus números aqui." />
        ) : (
          <View style={{ gap: t.spacing[3] }}>
            {(['STEPS', 'HEART_RATE', 'WEIGHT', 'WORKOUT'] as const).map((type) => {
              const s = latest(type);
              return s ? (
                <Card key={type}>
                  <Text variant="caption">
                    {LABEL[type]} · {day(s.startAt)}
                  </Text>
                  <Text variant="title">
                    {s.value.toLocaleString('pt-BR')} {s.unit === 'count' ? 'passos' : s.unit}
                  </Text>
                </Card>
              ) : null;
            })}
          </View>
        )}
      </LockedFeature>
    </ScrollView>
  );
}
