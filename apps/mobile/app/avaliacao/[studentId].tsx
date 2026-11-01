import { AssessmentProtocol, PROTOCOL_LABEL } from '@vetta/contracts';
import { PROTOCOL_SITES, SKINFOLD_LABELS, type Protocol } from '@vetta/fitness';
import { ApiRequestError } from '@vetta/sdk';
import { Button, Card, Input, Text, useTheme } from '@vetta/ui-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';

const MOBILE_PROTOCOLS = AssessmentProtocol.filter((p) => p !== 'BIOIMPEDANCE');
const toNum = (v: string) => Number(v.replace(',', '.'));

/** Avaliação física no celular: teclado numérico e só as dobras do protocolo escolhido. */
export default function NovaAvaliacao() {
  const t = useTheme();
  const { studentId, sex: sexParam } = useLocalSearchParams<{ studentId: string; sex: string }>();
  const [protocol, setProtocol] = useState<(typeof AssessmentProtocol)[number]>('POLLOCK_3');
  const [sex, setSex] = useState<'male' | 'female'>(sexParam === 'MALE' ? 'male' : 'female');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [folds, setFolds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const sites =
    protocol in PROTOCOL_SITES ? (PROTOCOL_SITES[protocol as Protocol][sex] as string[]) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Nova avaliação', headerShown: true }} />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="label">Protocolo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {MOBILE_PROTOCOLS.map((p) => (
            <Button
              key={p}
              title={PROTOCOL_LABEL[p]}
              variant={protocol === p ? 'primary' : 'secondary'}
              onPress={() => setProtocol(p)}
            />
          ))}
        </View>
        <Text variant="label">Sexo biológico (para as equações)</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button
            title="Feminino"
            variant={sex === 'female' ? 'primary' : 'secondary'}
            onPress={() => setSex('female')}
          />
          <Button
            title="Masculino"
            variant={sex === 'male' ? 'primary' : 'secondary'}
            onPress={() => setSex('male')}
          />
        </View>
        <Card>
          <Input
            label="Peso (kg)"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
          />
          <Input
            label="Altura (cm)"
            keyboardType="decimal-pad"
            value={height}
            onChangeText={setHeight}
          />
        </Card>
        {sites.length ? (
          <Card>
            <Text variant="title">Dobras (mm)</Text>
            {sites.map((s) => (
              <Input
                key={s}
                label={SKINFOLD_LABELS[s as keyof typeof SKINFOLD_LABELS] ?? s}
                keyboardType="decimal-pad"
                value={folds[s] ?? ''}
                onChangeText={(v) => setFolds((f) => ({ ...f, [s]: v }))}
              />
            ))}
          </Card>
        ) : null}
        <Button
          title="Salvar avaliação"
          variant="action"
          loading={busy}
          disabled={!weight || !height || sites.some((s) => !folds[s])}
          onPress={async () => {
            setBusy(true);
            try {
              await client.request('POST', `/v1/students/${studentId}/assessments`, {
                protocol,
                sex,
                weightKg: toNum(weight),
                heightCm: toNum(height),
                skinfolds: Object.fromEntries(sites.map((s) => [s, toNum(folds[s]!)])),
                perimeters: {},
              });
              Alert.alert('Avaliação salva', 'Resultados e comparativo ficam na ficha do aluno.');
              router.back();
            } catch (e) {
              Alert.alert(
                'Não foi possível salvar',
                e instanceof ApiRequestError && e.code === 'LIMIT_REACHED'
                  ? 'Seu plano permite 1 avaliação por aluno. Faça upgrade para avaliações ilimitadas.'
                  : (e as Error).message,
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
