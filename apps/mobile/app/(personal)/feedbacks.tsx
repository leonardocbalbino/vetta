import { Button, Card, EmptyState, Input, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';

interface Feedback {
  id: string;
  finishedAt: string;
  rating: number;
  perceivedEffort: number | null;
  hasPain: boolean | null;
  painLocation: string | null;
  feedback: string | null;
  critical: boolean;
  feedbackReadAt: string | null;
  studentLink: { id: string; displayName: string };
  routine: { label: string; name: string | null } | null;
}

function Item({ f, onDone }: { f: Feedback; onDone: () => void }) {
  const t = useTheme();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card style={f.critical ? { borderColor: t.colors.danger, borderWidth: 2 } : undefined}>
      <Text variant="title">
        {f.studentLink.displayName} · {'★'.repeat(f.rating)}
      </Text>
      <Text muted variant="caption">
        Treino {f.routine?.label ?? ''} · {new Date(f.finishedAt).toLocaleString('pt-BR')}
        {f.perceivedEffort ? ` · esforço ${f.perceivedEffort}/10` : ''}
      </Text>
      {f.hasPain ? (
        <Text style={{ color: t.colors.danger }}>Dor: {f.painLocation ?? 'não informado'}</Text>
      ) : null}
      {f.feedback ? <Text>“{f.feedback}”</Text> : null}
      <Input
        label="Responder"
        value={reply}
        onChangeText={setReply}
        multiline
        hint="Vai para o chat do aluno."
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title="Enviar"
          variant="action"
          disabled={!reply.trim()}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await client.request('POST', `/v1/feedbacks/${f.id}/reply`, {
                message: reply.trim(),
              });
              setReply('');
              onDone();
            } catch (e) {
              Alert.alert('Não foi possível responder', (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        {!f.feedbackReadAt ? (
          <Button
            title="Marcar como lido"
            variant="ghost"
            onPress={() => void client.request('PATCH', `/v1/feedbacks/${f.id}/read`).then(onDone)}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** Caixa de feedbacks: críticos em destaque; responder vira mensagem no chat. */
export default function Feedbacks() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['feedbacks'],
    queryFn: () =>
      client.request<Feedback[]>('GET', '/v1/feedbacks', undefined, { unread: 'true' }),
  });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Text variant="display" style={{ padding: t.spacing[5] }}>
        Feedbacks
      </Text>
      {!q.data ? (
        <Skeleton height={200} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{
            paddingHorizontal: t.spacing[5],
            gap: t.spacing[3],
            paddingBottom: 24,
          }}
          ListEmptyComponent={
            <EmptyState
              title="Tudo lido"
              description="Novos feedbacks aparecem aqui assim que o aluno finaliza o treino."
            />
          }
          renderItem={({ item }) => (
            <Item f={item} onDone={() => void qc.invalidateQueries({ queryKey: ['feedbacks'] })} />
          )}
        />
      )}
    </SafeAreaView>
  );
}
