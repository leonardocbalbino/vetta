import { uploadFile, xhrPut } from '@vetta/sdk';
import { Button, Text, useTheme } from '@vetta/ui-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PoseGuide } from '../src/components/pose-guide';
import { client } from '../src/lib/client';

const VIEWS = [
  { key: 'FRONT', label: 'Frente' },
  { key: 'BACK', label: 'Costas' },
  { key: 'LEFT', label: 'Lado esq.' },
  { key: 'RIGHT', label: 'Lado dir.' },
] as const;

export default function FotoProgresso() {
  const t = useTheme();
  const [perm, request] = useCameraPermissions();
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('FRONT');
  const [busy, setBusy] = useState(false);
  const cam = useRef<CameraView>(null);

  if (!perm) return null;
  if (!perm.granted) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          padding: 24,
          justifyContent: 'center',
          gap: 16,
          backgroundColor: t.colors.background,
        }}
      >
        <Text>
          Precisamos da câmera para as fotos de progresso. Elas ficam privadas entre você e seu
          personal.
        </Text>
        <Button title="Permitir câmera" variant="accent" onPress={() => void request()} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#101418' }}>
      <View style={{ flex: 1 }}>
        <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
        <PoseGuide side={view === 'LEFT' || view === 'RIGHT'} />
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              title={v.label}
              variant={view === v.key ? 'accent' : 'ghost'}
              onPress={() => setView(v.key)}
              style={{ paddingHorizontal: 10 }}
            />
          ))}
        </View>
        <Button
          title="Fotografar"
          variant="accent"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const pic = await cam.current?.takePictureAsync({ quality: 0.85, exif: false });
              if (!pic) return;
              const blob = await (await fetch(pic.uri)).blob();
              const file = Object.assign(blob, { name: `progresso-${view.toLowerCase()}.jpg` });
              Object.defineProperty(file, 'type', { value: 'image/jpeg' });
              const mediaId = await uploadFile(client, file, {
                purpose: 'progress_photo',
                put: xhrPut,
              });
              await client.request('POST', '/v1/progress/me/photos', { mediaId, view });
              Alert.alert('Foto enviada', 'Removemos a localização e os metadados da imagem.');
              router.back();
            } catch (e) {
              Alert.alert('Não foi possível enviar', (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}
