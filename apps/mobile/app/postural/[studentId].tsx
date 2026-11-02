import { POSTURE_DEVIATION_LABEL, PostureDeviation } from '@vetta/contracts';
import { Button, Card, Text, useTheme } from '@vetta/ui-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { PoseGuide } from '../../src/components/pose-guide';
import { client } from '../../src/lib/client';
import { uploadUri } from '../../src/lib/upload-uri';

const VIEWS = [
  { key: 'FRONT', label: 'Frente' },
  { key: 'BACK', label: 'Costas' },
  { key: 'LEFT', label: 'Perfil esq.' },
  { key: 'RIGHT', label: 'Perfil dir.' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

/** Grade 3x3 sobreposta para alinhar o aluno no enquadramento. */
function Grid() {
  return (
    <Svg
      width="100%"
      height="100%"
      style={{ position: 'absolute' }}
      pointerEvents="none"
      viewBox="0 0 90 160"
    >
      {[30, 60].map((x) => (
        <Line
          key={`v${x}`}
          x1={x}
          y1="0"
          x2={x}
          y2="160"
          stroke="#2F5BFF"
          strokeOpacity={0.5}
          strokeWidth={0.4}
        />
      ))}
      {[53, 107].map((y) => (
        <Line
          key={`h${y}`}
          x1="0"
          y1={y}
          x2="90"
          y2={y}
          stroke="#2F5BFF"
          strokeOpacity={0.5}
          strokeWidth={0.4}
        />
      ))}
    </Svg>
  );
}

/**
 * Avaliação postural pelo app: fotos de frente, costas e perfis com guia de pose e
 * grade, mais o checklist de desvios. As marcações (pontos e linhas) ficam na web.
 */
export default function PostureCapture() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const [perm, request] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [view, setView] = useState<ViewKey>('FRONT');
  const [photos, setPhotos] = useState<Partial<Record<ViewKey, { uri: string; mediaId: string }>>>(
    {},
  );
  const [findings, setFindings] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'camera' | 'checklist'>('camera');
  const [busy, setBusy] = useState(false);

  if (!perm) return null;
  if (!perm.granted)
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
        <Text>Precisamos da câmera para as fotos posturais.</Text>
        <Button title="Permitir câmera" onPress={() => void request()} />
      </View>
    );

  const shoot = async () => {
    setBusy(true);
    try {
      const pic = await cam.current?.takePictureAsync({ quality: 0.85, exif: false });
      if (!pic) return;
      const mediaId = await uploadUri(pic.uri, {
        name: `postural-${view.toLowerCase()}.jpg`,
        mime: 'image/jpeg',
        purpose: 'posture_photo',
        studentLinkId: studentId,
      });
      setPhotos((p) => ({ ...p, [view]: { uri: pic.uri, mediaId } }));
      const next = VIEWS.find((v) => !photos[v.key] && v.key !== view);
      if (next) setView(next.key);
    } catch (e) {
      Alert.alert('Não foi possível enviar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await client.request('POST', `/v1/students/${studentId}/posture`, {
        findings,
        photos: Object.entries(photos).map(([v, p]) => ({
          view: v,
          mediaId: p!.mediaId,
          markers: [],
        })),
      });
      Alert.alert('Avaliação salva', 'Abra no computador para marcar pontos e linhas e comparar.');
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível salvar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'checklist')
    return (
      <ScrollView
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3] }}
      >
        <Stack.Screen options={{ title: 'Desvios observados' }} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {VIEWS.map((v) =>
            photos[v.key] ? (
              <Image
                key={v.key}
                source={{ uri: photos[v.key]!.uri }}
                accessibilityLabel={v.label}
                style={{ width: 70, height: 110, borderRadius: 8 }}
              />
            ) : null,
          )}
        </View>
        {PostureDeviation.map((d) => {
          const level = findings[d];
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={`${POSTURE_DEVIATION_LABEL[d]}: ${level ?? 'não observado'}`}
              onPress={() => {
                const order = [undefined, 'leve', 'moderado', 'acentuado'];
                const next = order[(order.indexOf(level) + 1) % order.length];
                const f = { ...findings };
                if (next) f[d] = next;
                else delete f[d];
                setFindings(f);
              }}
              style={{
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: t.colors.border,
              }}
            >
              <Text>{POSTURE_DEVIATION_LABEL[d]}</Text>
              <Text muted={!level}>{level ?? 'toque para marcar'}</Text>
            </Pressable>
          );
        })}
        <Button
          title="Salvar avaliação"
          variant="accent"
          loading={busy}
          onPress={() => void save()}
        />
        <Button title="Voltar às fotos" variant="ghost" onPress={() => setStep('camera')} />
      </ScrollView>
    );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ title: name ? `Postural · ${name}` : 'Avaliação postural' }} />
      <CameraView ref={cam} style={{ flex: 1 }} facing="back">
        <PoseGuide side={view === 'LEFT' || view === 'RIGHT'} />
        <Grid />
      </CameraView>
      <Card style={{ margin: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              title={`${photos[v.key] ? '✓ ' : ''}${v.label}`}
              variant={view === v.key ? 'accent' : 'ghost'}
              onPress={() => setView(v.key)}
            />
          ))}
        </View>
        <Text muted style={{ textAlign: 'center' }}>
          Aluno de corpo inteiro, pés na linha de baixo, alinhado à linha central.
        </Text>
        <Button title="Fotografar" variant="accent" loading={busy} onPress={() => void shoot()} />
        <Button
          title="Próximo: checklist"
          variant="secondary"
          disabled={!Object.keys(photos).length}
          onPress={() => setStep('checklist')}
        />
      </Card>
    </View>
  );
}
