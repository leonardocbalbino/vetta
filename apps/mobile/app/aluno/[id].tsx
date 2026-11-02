import { Button, Card, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';

interface Detail {
  id: string;
  displayName: string;
  goal: string | null;
  restrictions: string | null;
  injuries: string | null;
  whatsapp: string | null;
  sex: 'FEMALE' | 'MALE' | 'OTHER' | null;
  summary: {
    sessionsLast30Days: number;
    lastSession: { startedAt: string; rating: number | null } | null;
    activeProgram: { id: string; name: string; endsOn: string | null } | null;
    lastAssessment: { assessedAt: string; nextAssessmentOn: string | null } | null;
    pendingAnamnesis: number;
  };
}

/** Ficha resumida do aluno no app do personal. */
export default function AlunoFicha() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useQuery({
    queryKey: ['student', id],
    queryFn: () => client.request<Detail>('GET', `/v1/students/${id}`),
  });
  const programs = useQuery({
    queryKey: ['programs', id],
    queryFn: () =>
      client.request<{ id: string; name: string; status: string }[]>(
        'GET',
        '/v1/programs',
        undefined,
        { studentLinkId: id },
      ),
  });
  const d = s.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: d?.displayName ?? 'Aluno', headerShown: true }} />
      {!d ? (
        <Skeleton height={300} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
          <Card>
            <Text variant="title">Resumo</Text>
            <Text>{d.summary.sessionsLast30Days} treinos nos últimos 30 dias</Text>
            <Text muted>
              Último treino:{' '}
              {d.summary.lastSession
                ? new Date(d.summary.lastSession.startedAt).toLocaleDateString('pt-BR')
                : 'nenhum'}
            </Text>
            {d.goal ? <Text>Objetivo: {d.goal}</Text> : null}
            {d.restrictions ? (
              <Text style={{ color: t.colors.warning }}>Restrições: {d.restrictions}</Text>
            ) : null}
            {d.injuries ? (
              <Text style={{ color: t.colors.warning }}>Lesões: {d.injuries}</Text>
            ) : null}
            {d.summary.pendingAnamnesis ? (
              <Text muted>{d.summary.pendingAnamnesis} anamnese(s) pendente(s)</Text>
            ) : null}
          </Card>
          <Card>
            <Text variant="title">Treinos</Text>
            {(programs.data ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/treino-edit/${p.id}`)}
                style={{ minHeight: 44, justifyContent: 'center' }}
                accessibilityRole="button"
              >
                <Text>
                  {p.name} · {p.status === 'ACTIVE' ? 'ativo' : p.status.toLowerCase()} ›
                </Text>
              </Pressable>
            ))}
            {programs.data && !programs.data.length ? (
              <Text muted>Nenhum treino. Crie pelo app web.</Text>
            ) : null}
          </Card>
          <Card>
            <Text variant="title">Avaliação física</Text>
            <Text muted>
              {d.summary.lastAssessment
                ? `Última em ${new Date(d.summary.lastAssessment.assessedAt).toLocaleDateString('pt-BR')}`
                : 'Nenhuma avaliação ainda.'}
            </Text>
            <Button
              title="Nova avaliação"
              variant="action"
              onPress={() =>
                router.push({
                  pathname: '/avaliacao/[studentId]',
                  params: { studentId: d.id, sex: d.sex ?? 'FEMALE' },
                })
              }
            />
          </Card>
          <Button
            title="Avaliação postural (fotos)"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/postural/[studentId]',
                params: { studentId: d.id, name: d.displayName },
              })
            }
          />
          <Button
            title="Abrir chat"
            variant="secondary"
            onPress={async () => {
              const c = await client.request<{ id: string }>('POST', `/v1/chat/students/${d.id}`);
              router.push({ pathname: '/chat/[id]', params: { id: c.id, name: d.displayName } });
            }}
          />
          {d.whatsapp ? (
            <Button
              title="Chamar no WhatsApp"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(`https://wa.me/${d.whatsapp!.replace(/\D/g, '')}`)
              }
            />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
