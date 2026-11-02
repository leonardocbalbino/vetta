import { Button, Card, EmptyState, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';
import { uploadUri } from '../src/lib/upload-uri';

interface Doc {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  file: { mimeType: string; url: string | null; status: string } | null;
}

const CATEGORY: Record<string, string> = {
  EXAM: 'Exame',
  MEAL_PLAN: 'Plano alimentar',
  CONTRACT: 'Contrato',
  PRESCRIPTION: 'Prescrição',
  OTHER: 'Outro',
};

/** Aluno: pasta de documentos (visualiza PDFs e imagens; pode enviar exames). */
export default function Documents() {
  const t = useTheme();
  const { active } = useSession();
  const linkId = active?.studentLinkId;
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = useQuery({
    queryKey: ['documents', linkId],
    enabled: !!linkId,
    queryFn: () => client.request<Doc[]>('GET', `/v1/students/${linkId}/documents`),
  });
  const open = (d: Doc) => {
    if (!d.file?.url) return;
    if (d.file.mimeType === 'application/pdf') void WebBrowser.openBrowserAsync(d.file.url);
    else setViewing(d);
  };
  const send = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    const a = r.assets?.[0];
    if (r.canceled || !a || !linkId) return;
    setBusy(true);
    try {
      const mediaId = await uploadUri(a.uri, {
        name: a.name,
        mime: a.mimeType ?? 'application/pdf',
        purpose: 'document',
        studentLinkId: linkId,
      });
      await client.request('POST', `/v1/students/${linkId}/documents`, {
        mediaId,
        title: a.name,
        category: 'EXAM',
      });
      await docs.refetch();
    } catch (e) {
      Alert.alert('Não foi possível enviar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (docs.error && (docs.error as { status?: number }).status === 402)
    return (
      <EmptyState
        title="Pasta de documentos"
        description="Seu personal ainda não usa a pasta de documentos."
      />
    );
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3] }}
    >
      <Stack.Screen options={{ title: 'Documentos' }} />
      <Button
        title="Enviar exame ou documento"
        variant="secondary"
        loading={busy}
        onPress={() => void send()}
      />
      {(docs.data ?? []).map((d) => (
        <Pressable
          key={d.id}
          accessibilityRole="button"
          onPress={() => open(d)}
          disabled={!d.file?.url}
        >
          <Card>
            <Text variant="label">{d.title}</Text>
            <Text muted>
              {CATEGORY[d.category] ?? d.category} ·{' '}
              {new Date(d.createdAt).toLocaleDateString('pt-BR')}
              {d.file?.status !== 'READY' ? ' · processando' : ''}
            </Text>
          </Card>
        </Pressable>
      ))}
      {docs.data && !docs.data.length ? <Text muted>Nenhum documento ainda.</Text> : null}
      <Modal visible={!!viewing} onRequestClose={() => setViewing(null)} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          {viewing?.file?.url ? (
            <Image
              source={{ uri: viewing.file.url }}
              resizeMode="contain"
              accessibilityLabel={viewing.title}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button
            title="Fechar"
            variant="secondary"
            onPress={() => setViewing(null)}
            style={{ margin: 20 }}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}
