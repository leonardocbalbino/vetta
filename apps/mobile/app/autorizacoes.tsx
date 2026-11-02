import { Button, Card, Input, Text, useTheme } from '@vetta/ui-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';

interface Request {
  id: string;
  caption: string | null;
  consentStatus: 'REQUESTED' | 'GRANTED' | 'DENIED' | 'REVOKED';
  beforeUrl: string | null;
  afterUrl: string | null;
}

const LABEL = {
  REQUESTED: 'Aguardando sua resposta',
  GRANTED: 'Autorizado',
  DENIED: 'Recusado',
  REVOKED: 'Revogado',
} as const;

/** Aluno: autoriza ou revoga o antes/depois na página do personal e envia depoimento. */
export default function Authorizations() {
  const t = useTheme();
  const qc = useQueryClient();
  const { active } = useSession();
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const reqs = useQuery({
    queryKey: ['result-requests', active?.tenantId],
    queryFn: () => client.request<Request[]>('GET', '/v1/me/result-requests'),
  });
  const answer = useMutation({
    mutationFn: (b: { id: string; granted: boolean }) =>
      client.request('POST', `/v1/me/result-requests/${b.id}`, { granted: b.granted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['result-requests'] }),
  });
  const send = useMutation({
    mutationFn: () => client.request('POST', '/v1/me/testimonials', { text, rating }),
    onSuccess: () => {
      setText('');
      Alert.alert('Obrigado!', 'Seu personal vai revisar o depoimento.');
    },
    onError: (e) => Alert.alert('Depoimento', (e as Error).message),
  });
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
    >
      <Stack.Screen options={{ title: 'Autorizações' }} />
      <Text muted>
        Seu personal só mostra seu antes e depois com a sua autorização. Você pode revogar quando
        quiser.
      </Text>
      {(reqs.data ?? []).map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[r.beforeUrl, r.afterUrl].map((u, i) =>
              u ? (
                <Image
                  key={i}
                  source={{ uri: u }}
                  accessibilityLabel={i === 0 ? 'Antes' : 'Depois'}
                  style={{ width: 110, height: 150, borderRadius: 8 }}
                />
              ) : null,
            )}
          </View>
          {r.caption ? <Text>{r.caption}</Text> : null}
          <Text variant="label">{LABEL[r.consentStatus]}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {r.consentStatus !== 'GRANTED' ? (
              <Button
                title="Autorizar"
                variant="accent"
                onPress={() => answer.mutate({ id: r.id, granted: true })}
              />
            ) : null}
            {r.consentStatus === 'GRANTED' || r.consentStatus === 'REQUESTED' ? (
              <Button
                title={r.consentStatus === 'GRANTED' ? 'Revogar' : 'Recusar'}
                variant="ghost"
                onPress={() => answer.mutate({ id: r.id, granted: false })}
              />
            ) : null}
          </View>
        </Card>
      ))}
      {reqs.data && !reqs.data.length ? <Text muted>Nenhum pedido de autorização.</Text> : null}
      <Card>
        <Text variant="title">Deixe um depoimento</Text>
        <View
          style={{ flexDirection: 'row' }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Nota"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ checked: rating === n }}
              accessibilityLabel={`${n} estrelas`}
              onPress={() => setRating(n)}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 24 }}>{n <= rating ? '★' : '☆'}</Text>
            </Pressable>
          ))}
        </View>
        <Input
          label="Como está sendo treinar com seu personal?"
          value={text}
          onChangeText={setText}
          multiline
        />
        <Button
          title="Enviar depoimento"
          variant="accent"
          loading={send.isPending}
          disabled={text.trim().length < 10}
          onPress={() => send.mutate()}
        />
      </Card>
    </ScrollView>
  );
}
