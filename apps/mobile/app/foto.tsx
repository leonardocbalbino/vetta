import { uploadFile, xhrPut } from '@vetta/sdk';
import { Button, Text, useTheme } from '@vetta/ui-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse, Line, Path } from 'react-native-svg';
import { client } from '../src/lib/client';

const VIEWS = [
  { key: 'FRONT', label: 'Frente' },
  { key: 'BACK', label: 'Costas' },
  { key: 'LEFT', label: 'Lado esq.' },
  { key: 'RIGHT', label: 'Lado dir.' },
] as const;

/** Guia de pose: silhueta + linhas de prumo para fotos comparáveis. */
function PoseGuide({ side }: { side: boolean }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 180"
      style={{ position: 'absolute' }}
      pointerEvents="none"
    >
      <Line
        x1="50"
        y1="0"
        x2="50"
        y2="180"
        stroke="#C6F432"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <Line
        x1="0"
        y1="165"
        x2="100"
        y2="165"
        stroke="#C6F432"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <Ellipse cx="50" cy="22" rx="8" ry="10" stroke="#F4F5F1" strokeWidth="0.8" fill="none" />
      {side ? (
        <Path
          d="M50 32 C58 40 58 70 54 95 L56 165 M50 32 C44 45 44 70 48 95 L46 165"
          stroke="#F4F5F1"
          strokeWidth="0.8"
          fill="none"
        />
      ) : (
        <Path
          d="M50 32 L30 40 L24 95 M50 32 L70 40 L76 95 M36 42 L38 100 L40 165 M64 42 L62 100 L60 165"
          stroke="#F4F5F1"
          strokeWidth="0.8"
          fill="none"
        />
      )}
    </Svg>
  );
}

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
