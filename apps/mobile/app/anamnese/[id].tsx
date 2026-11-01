import { ApiRequestError } from '@vetta/sdk';
import { Button, Card, Input, Skeleton, Switch, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';

type Q = { id: string; type: string; label: string; options?: string[] };

/** Resposta da anamnese no app, com consentimento de dados de saúde. */
export default function AnamneseScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useQuery({
    queryKey: ['anamnese', id],
    queryFn: () =>
      client.request<{ status: string; template: { name: string; schema: { questions: Q[] } } }>(
        'GET',
        `/v1/anamnesis/responses/${id}`,
      ),
  });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!r.data) return <Skeleton height={300} />;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        <Text variant="display">{r.data.template.name}</Text>
        {r.data.template.schema.questions.map((q) => (
          <Card key={q.id}>
            <Text variant="label">{q.label}</Text>
            {q.type === 'yes_no' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[true, false].map((v) => (
                  <Button
                    key={String(v)}
                    title={v ? 'Sim' : 'Não'}
                    variant={answers[q.id] === v ? 'primary' : 'secondary'}
                    onPress={() => set(q.id, v)}
                  />
                ))}
              </View>
            ) : q.options ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {q.options.map((o) => {
                  const cur = (answers[q.id] as string[] | undefined) ?? [];
                  const on = cur.includes(o);
                  return (
                    <Button
                      key={o}
                      title={o}
                      variant={on ? 'primary' : 'secondary'}
                      onPress={() => set(q.id, on ? cur.filter((x) => x !== o) : [...cur, o])}
                    />
                  );
                })}
              </View>
            ) : (
              <Input
                label=""
                keyboardType={q.type === 'number' || q.type === 'scale' ? 'number-pad' : 'default'}
                value={String(answers[q.id] ?? '')}
                onChangeText={(v) =>
                  set(q.id, q.type === 'number' || q.type === 'scale' ? Number(v) : v)
                }
              />
            )}
          </Card>
        ))}
        <Switch
          label="Autorizo o uso dos meus dados de saúde pelo meu personal"
          value={consent}
          onValueChange={setConsent}
        />
        <Button
          title="Enviar respostas"
          variant="accent"
          disabled={!consent || r.data.status !== 'PENDING'}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await client.request('POST', `/v1/anamnesis/responses/${id}/answer`, {
                answers,
                acceptHealthDataConsent: true,
              });
              Alert.alert('Obrigado!', 'Suas respostas foram enviadas.');
              router.back();
            } catch (e) {
              Alert.alert(
                'Não foi possível enviar',
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
