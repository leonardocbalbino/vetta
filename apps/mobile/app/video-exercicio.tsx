import { Button, Card, Input, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';
import { uploadUri } from '../src/lib/upload-uri';

interface Exercise {
  id: string;
  name: string;
  tenantId: string | null;
}

/**
 * Personal grava (ou escolhe da galeria) o vídeo de um exercício próprio.
 * Respeita a cota do plano: a API recusa com 402 QUOTA_EXCEEDED ao passar do limite.
 */
export default function ExerciseVideo() {
  const t = useTheme();
  const { active } = useSession();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const cam = useRef<CameraView>(null);
  const [q, setQ] = useState('');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['own-exercises', active?.tenantId, q],
    queryFn: () =>
      client.request<{ items: Exercise[] }>(
        'GET',
        `/v1/library/exercises?scope=mine${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const attach = async (uri: string, mime: string) => {
    if (!exercise) return;
    setBusy(true);
    try {
      const mediaId = await uploadUri(uri, {
        name: `${exercise.name}.mp4`,
        mime,
        purpose: 'exercise_video',
      });
      const full = await client.request<Record<string, unknown>>(
        'GET',
        `/v1/library/exercises/${exercise.id}`,
      );
      await client.request('PUT', `/v1/library/exercises/${exercise.id}`, {
        ...full,
        videoMediaId: mediaId,
      });
      Alert.alert(
        'Vídeo enviado',
        'Estamos convertendo o vídeo. Ele aparece no exercício em alguns minutos.',
      );
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível enviar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!exercise)
    return (
      <ScrollView
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3] }}
      >
        <Stack.Screen options={{ title: 'Vídeo de exercício' }} />
        <Text muted>Escolha um exercício da sua biblioteca própria.</Text>
        <Input label="Buscar" value={q} onChangeText={setQ} />
        {(list.data?.items ?? []).map((e) => (
          <Pressable key={e.id} accessibilityRole="button" onPress={() => setExercise(e)}>
            <Card>
              <Text variant="label">{e.name}</Text>
            </Card>
          </Pressable>
        ))}
        {list.data && !list.data.items.length ? (
          <Text muted>Nenhum exercício próprio. Crie na biblioteca, no computador.</Text>
        ) : null}
      </ScrollView>
    );

  if (!camPerm?.granted || !micPerm?.granted)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          gap: 12,
          backgroundColor: t.colors.background,
        }}
      >
        <Text>Precisamos da câmera e do microfone para gravar.</Text>
        <Button title="Permitir" onPress={() => void requestCam().then(() => requestMic())} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ title: exercise.name }} />
      <CameraView ref={cam} style={{ flex: 1 }} mode="video" facing="back" />
      <Card style={{ margin: 12, gap: 8 }}>
        <Button
          title={recording ? 'Parar gravação' : 'Gravar'}
          variant={recording ? 'destructive' : 'accent'}
          loading={busy}
          onPress={async () => {
            if (recording) {
              cam.current?.stopRecording();
              return;
            }
            setRecording(true);
            const v = await cam.current?.recordAsync({ maxDuration: 90 });
            setRecording(false);
            if (v?.uri) await attach(v.uri, 'video/mp4');
          }}
        />
        <Button
          title="Escolher da galeria"
          variant="secondary"
          disabled={recording || busy}
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
            const a = r.assets?.[0];
            if (!r.canceled && a) await attach(a.uri, a.mimeType ?? 'video/mp4');
          }}
        />
      </Card>
    </View>
  );
}
