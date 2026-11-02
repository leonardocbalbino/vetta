import type { AiWeeklySummary } from '@vetta/contracts';
import { ApiRequestError } from '@vetta/sdk';
import { useFeature } from '@vetta/sdk/react';
import { Button, Card, Text, useTheme } from '@vetta/ui-native';
import { useState } from 'react';
import { View } from 'react-native';
import { client } from '../lib/client';
import { useSession } from '../lib/session';

/** Resumo semanal do aluno gerado pela IA (personal e assistente, Pro Plus). */
export function AiSummaryCard({ studentLinkId }: { studentLinkId: string }) {
  const t = useTheme();
  const { active } = useSession();
  const feature = useFeature(active?.tenantId ?? null, 'workouts.ai_assistant');
  const [summary, setSummary] = useState<AiWeeklySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (feature.locked || feature.loading) return null;

  const list = (title: string, items: string[]) =>
    items.length ? (
      <View style={{ gap: t.spacing[1] }}>
        <Text variant="label">{title}</Text>
        {items.map((i) => (
          <Text key={i}>• {i}</Text>
        ))}
      </View>
    ) : null;

  return (
    <Card>
      <Text variant="title">Resumo da semana (IA)</Text>
      {summary ? (
        <>
          <Text style={{ fontFamily: t.fonts.sansSemibold }}>{summary.headline}</Text>
          <Text muted>{summary.adherence}</Text>
          {list('Destaques', summary.highlights)}
          {list('Pontos de atenção', summary.concerns)}
          {list('Sugestões', summary.suggestedActions)}
        </>
      ) : (
        <Text muted>
          Um resumo da aderência, recordes e alertas dos últimos 7 dias. Os dados vão para a IA sem
          nome nem contatos do aluno.
        </Text>
      )}
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button
        title={busy ? 'Gerando…' : summary ? 'Gerar de novo' : 'Gerar resumo'}
        variant="secondary"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            setSummary(
              await client.request<AiWeeklySummary>('POST', '/v1/ai/weekly-summary', {
                studentLinkId,
              }),
            );
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.message : 'Não foi possível gerar agora.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
