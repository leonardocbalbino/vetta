import type { ApiItem, ApiRoutine } from '@vetta/sdk';
import { Text, useTheme } from '@vetta/ui-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Image, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const METHOD: Record<string, string> = {
  BI_SET: 'Bi-set',
  TRI_SET: 'Tri-set',
  CIRCUIT: 'Circuito',
  DROP_SET: 'Drop-set',
  REST_PAUSE: 'Rest-pause',
  PYRAMID: 'Pirâmide',
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  CARDIO: 'Cardio',
};

const num = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? null : Number(v);
const kg = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;

/** "12 × 28 kg", "8-12 reps", "45 s". */
export function formatSet(s: ApiItem['sets'][number]): string {
  const load = num(s.targetLoadKg);
  if (s.durationSeconds && !s.reps) return `${s.durationSeconds} s`;
  const reps = s.reps ?? '—';
  return load !== null ? `${reps} × ${kg(load)}` : `${reps} reps`;
}

/** Duração estimada da rotina: ~40 s por série mais o descanso. */
export function estimateMinutes(r: ApiRoutine): number {
  let s = 0;
  for (const i of r.exercises)
    for (const set of i.sets)
      s += (set.durationSeconds ?? 40) + (set.restSeconds ?? i.restSeconds ?? 60);
  return Math.max(5, Math.round(s / 60 / 5) * 5);
}

function VideoModal({ uri, title, onClose }: { uri: string; title: string; onClose: () => void }) {
  const t = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: t.spacing[4] }}>
          <Text style={{ color: '#fff', flex: 1 }} variant="title" numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar vídeo"
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 22 }}>✕</Text>
          </Pressable>
        </View>
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
      </SafeAreaView>
    </Modal>
  );
}

/** Cartão de exercício no modo visualização: séries, cargas, última vez, sugestão e vídeo. */
export function ExerciseCard({
  item,
  index,
  grouped,
}: {
  item: ApiItem;
  index: number;
  /** Faz parte de bi-set/tri-set/circuito: barra lateral de agrupamento. */
  grouped: boolean;
}) {
  const t = useTheme();
  const [video, setVideo] = useState(false);
  const media = item.exercise.media;
  const thumb = media?.thumbnail ?? media?.image ?? media?.gif ?? media?.youtube?.thumbnail ?? null;
  const youtube = !media?.video ? media?.youtube : null;
  const work = item.sets.filter((s) => s.type === 'WORK');
  const reps = [...new Set(work.map((s) => s.reps).filter(Boolean))];
  const rest = item.sets[0]?.restSeconds ?? item.restSeconds;
  const last = item.lastPerformance;
  const best = last?.sets.reduce((m, s) => (s.loadKg > m ? s.loadKg : m), 0) ?? 0;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
        borderWidth: 1,
        borderColor: t.colors.border,
        borderLeftWidth: grouped ? 4 : 1,
        borderLeftColor: grouped ? t.colors.action : t.colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ flex: 1, padding: t.spacing[4], gap: t.spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
          <Text variant="caption" muted>
            {String(index + 1).padStart(2, '0')}
          </Text>
          {METHOD[item.method] ? (
            <View
              style={{
                backgroundColor: t.colors.action,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text variant="label" style={{ color: t.colors.actionForeground, fontSize: 11 }}>
                {METHOD[item.method]}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="title" numberOfLines={2}>
          {item.exercise.name}
        </Text>
        <Text variant="label">
          {work.length || item.sets.length} séries
          {reps.length ? ` · ${reps.join(' / ')} reps` : ''}
          {rest ? ` · descanso ${rest}s` : ''}
        </Text>
        {/* Uma pílula por série, na ordem: aquecimento em cinza, válidas em destaque. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {item.sets.map((s, i) => (
            <View
              key={s.id ?? i}
              style={{
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: s.type === 'WORK' ? t.colors.muted : 'transparent',
                borderWidth: s.type === 'WORK' ? 0 : 1,
                borderColor: t.colors.border,
              }}
              accessibilityLabel={`Série ${i + 1}: ${formatSet(s)}${s.type === 'WARMUP' ? ', aquecimento' : ''}`}
            >
              <Text variant="caption" style={{ fontFamily: t.fonts.sansSemibold }}>
                {s.type === 'WARMUP' ? 'Aq. ' : s.type === 'DROP' ? 'Drop ' : ''}
                {formatSet(s)}
              </Text>
            </View>
          ))}
        </View>
        {last ? (
          <Text variant="caption" muted>
            Última vez: {last.sets.map((s) => `${s.reps}×${s.loadKg}`).join(' · ')} kg
          </Text>
        ) : null}
        {item.suggestion && item.suggestion.loadKg > best ? (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: t.colors.accent,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text
              variant="caption"
              style={{ color: t.colors.accentForeground, fontFamily: t.fonts.sansSemibold }}
            >
              ↑ Hoje: tente {kg(item.suggestion.loadKg)}
            </Text>
          </View>
        ) : null}
        {item.notes ? (
          <Text variant="caption" muted numberOfLines={3}>
            “{item.notes}”
          </Text>
        ) : null}
      </View>
      {thumb || media?.video || youtube ? (
        <Pressable
          onPress={() =>
            media?.video
              ? setVideo(true)
              : youtube
                ? void WebBrowser.openBrowserAsync(youtube.watchUrl)
                : undefined
          }
          accessibilityRole="button"
          accessibilityLabel={`Ver vídeo de ${item.exercise.name}`}
          style={{ width: 112, backgroundColor: t.colors.muted }}
        >
          {thumb ? <Image source={{ uri: thumb }} style={{ flex: 1 }} resizeMode="cover" /> : null}
          {media?.video || youtube ? (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(16,20,24,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 18, marginLeft: 3 }}>▶</Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      {video && media?.video ? (
        <VideoModal uri={media.video} title={item.exercise.name} onClose={() => setVideo(false)} />
      ) : null}
    </View>
  );
}
