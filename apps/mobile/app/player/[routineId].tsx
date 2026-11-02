import type { FeedbackInput } from '@vetta/contracts';
import {
  ApiRequestError,
  buildPlayer,
  isFinished,
  newClientSessionId,
  nextPosition,
  progress,
  toSyncPayload,
  type PlayerItem,
  type Position,
} from '@vetta/sdk';
import { Button, Card, Input, Logo, Switch, Text, useTheme } from '@vetta/ui-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../../src/lib/client';
import { cacheGet, cacheSet, enqueueSession } from '../../src/lib/offline';
import { useSession } from '../../src/lib/session';
import { todayKey, type Today } from '../(aluno)/treino';

const RECORD = { MAX_LOAD: 'Carga máxima', ONE_RM: '1RM estimado', MAX_VOLUME: 'Volume' } as const;

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 220, borderRadius: 16 }}
      nativeControls={false}
    />
  );
}

function Rest({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const t = useTheme();
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      Vibration.vibrate([0, 300, 150, 300]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
      return;
    }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onDone]);
  return (
    <View
      style={{
        backgroundColor: t.colors.primary,
        borderRadius: t.radius.card,
        padding: t.spacing[4],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      accessibilityRole="timer"
      accessibilityLabel={`Descanso ${left} segundos`}
    >
      <Text variant="display" style={{ color: t.colors.primaryForeground }}>
        {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="+15 s" variant="ghost" onPress={() => setLeft((l) => l + 15)} />
        <Button title="Pular" testID="skip-rest" variant="accent" onPress={onDone} />
      </View>
    </View>
  );
}

/** Player nativo, offline-first: o progresso fica salvo no aparelho e a sessão entra na fila se não houver internet. */
export default function PlayerScreen() {
  const t = useTheme();
  const { routineId, programId } = useLocalSearchParams<{ routineId: string; programId: string }>();
  const { active } = useSession();
  const tenantId = active?.tenantId ?? '';
  const stateKey = `player:${routineId}`;
  const [items, setItems] = useState<PlayerItem[] | null>(null);
  const [pos, setPos] = useState<Position>({ item: 0, set: 0 });
  const [rest, setRest] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [result, setResult] = useState<{
    offline: boolean;
    records: { exerciseName: string; type: keyof typeof RECORD; value: number }[];
  } | null>(null);
  const meta = useRef({ startedAt: new Date().toISOString(), clientId: newClientSessionId() });
  const [rating, setRating] = useState(0);
  const [effort, setEffort] = useState(7);
  const [pain, setPain] = useState(false);
  const [where, setWhere] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await cacheGet<{
        items: PlayerItem[];
        pos: Position;
        startedAt: string;
        clientId: string;
      }>(stateKey);
      const today = await cacheGet<Today>(todayKey(tenantId));
      const routine = today?.value.programs
        .flatMap((p) => p.routines)
        .find((r) => r.id === routineId);
      if (routine) setRoutineName(`${routine.label}${routine.name ? ` · ${routine.name}` : ''}`);
      if (saved) {
        setItems(saved.value.items);
        setPos(saved.value.pos);
        meta.current = { startedAt: saved.value.startedAt, clientId: saved.value.clientId };
      } else if (routine) setItems(buildPlayer(routine));
    })();
  }, [routineId, stateKey, tenantId]);

  useEffect(() => {
    if (items && !result) void cacheSet(stateKey, { items, pos, ...meta.current });
  }, [items, pos, result, stateKey]);

  if (!items) return <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} />;
  const item = items[pos.item];
  const set = item?.sets[pos.set];
  const prog = progress(items);
  const mutate = (fn: (d: PlayerItem[]) => void) => {
    const d = structuredClone(items);
    fn(d);
    setItems(d);
    return d;
  };
  const advance = (d: PlayerItem[]) => {
    const n = nextPosition(d, pos);
    if (n) setPos(n);
    else setFinishing(true);
  };

  const submit = async () => {
    setBusy(true);
    const feedback: FeedbackInput = {
      rating,
      perceivedEffort: effort,
      hasPain: pain,
      painLocation: pain ? where || null : null,
      comment: comment || null,
    };
    const payload = toSyncPayload(items, {
      clientSessionId: meta.current.clientId,
      programId,
      routineId,
      startedAt: new Date(meta.current.startedAt),
      finishedAt: new Date(),
      feedback,
    });
    try {
      const r = await client.request<{
        records: { exerciseName: string; type: keyof typeof RECORD; value: number }[];
      }>('POST', '/v1/training/sessions', payload);
      setResult({ offline: false, records: r.records });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status < 500) {
        setBusy(false);
        return;
      }
      // Sem internet: guarda e sincroniza depois (mesmo clientSessionId).
      await enqueueSession(tenantId, payload);
      setResult({ offline: true, records: [] });
    }
    await cacheSet(stateKey, null);
    setBusy(false);
  };

  if (result) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: t.colors.background,
          padding: t.spacing[6],
          justifyContent: 'center',
          gap: t.spacing[4],
        }}
      >
        <Logo variant="simbolo" size={64} />
        <Text variant="display" testID="workout-done">
          Treino concluído!
        </Text>
        <Text muted>
          {result.offline
            ? 'Salvo no aparelho. Enviamos ao seu personal assim que a internet voltar.'
            : 'Seu personal já recebeu o feedback.'}
        </Text>
        <Modal visible={result.records.length > 0} transparent animationType="fade">
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(16,20,24,0.95)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              gap: 16,
            }}
          >
            <Logo variant="positivo" size={72} />
            <Text variant="display" style={{ color: '#C6F432' }}>
              Recorde pessoal!
            </Text>
            {result.records.map((r, i) => (
              <Text key={i} style={{ color: '#F4F5F1' }}>
                {r.exerciseName}: {RECORD[r.type]} de {r.value} kg
              </Text>
            ))}
            <Button
              title="Bora!"
              variant="accent"
              onPress={() => setResult({ ...result, records: [] })}
            />
          </View>
        </Modal>
        <Button title="Voltar" variant="accent" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (finishing || isFinished(items)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
        <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
          <Text variant="display">Como foi o treino?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                testID={`rating-${n}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: rating === n }}
                accessibilityLabel={`${n} de 5`}
                onPress={() => setRating(n)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: rating >= n ? t.colors.accent : t.colors.muted,
                }}
              >
                <Text style={{ fontSize: 22, color: t.colors.accentForeground }}>★</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="label">Esforço percebido: {effort}/10</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Button
                key={n}
                title={String(n)}
                variant={effort === n ? 'primary' : 'secondary'}
                onPress={() => setEffort(n)}
                style={{ minWidth: 48, paddingHorizontal: 8 }}
              />
            ))}
          </View>
          <Switch label="Sentiu dor?" value={pain} onValueChange={setPain} />
          {pain ? <Input label="Onde?" value={where} onChangeText={setWhere} /> : null}
          <Input
            label="Comentário (opcional)"
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <Button
            title="Enviar e finalizar"
            testID="finish"
            variant="accent"
            disabled={!rating}
            loading={busy}
            onPress={submit}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="title">{routineName}</Text>
          <Text muted>
            {prog.done}/{prog.total}
          </Text>
        </View>
        {rest !== null ? <Rest seconds={rest} onDone={() => setRest(null)} /> : null}
        {item && set ? (
          <Card>
            {item.media?.video && !item.media.video.endsWith('.m3u8x') ? (
              <Video uri={item.media.video} />
            ) : item.media?.gif ? (
              <Image
                source={{ uri: item.media.gif }}
                style={{ width: '100%', height: 220, borderRadius: 16 }}
                accessibilityLabel={`Demonstração de ${item.name}`}
              />
            ) : null}
            <Text variant="title">{item.name}</Text>
            <Text muted>
              Série {pos.set + 1} de {item.sets.length}
              {set.targetReps ? ` · meta ${set.targetReps} reps` : ''}
              {item.groupKey ? ' · bi-set' : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Carga (kg)"
                  testID="load"
                  keyboardType="decimal-pad"
                  value={set.loadKg === null ? '' : String(set.loadKg)}
                  onChangeText={(v) =>
                    mutate(
                      (d) =>
                        void (d[pos.item]!.sets[pos.set]!.loadKg =
                          v === '' ? null : Number(v.replace(',', '.'))),
                    )
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Reps"
                  testID="reps"
                  keyboardType="number-pad"
                  value={set.reps === null ? '' : String(set.reps)}
                  onChangeText={(v) =>
                    mutate(
                      (d) => void (d[pos.item]!.sets[pos.set]!.reps = v === '' ? null : Number(v)),
                    )
                  }
                />
              </View>
            </View>
            <Button
              title="Concluir série"
              testID="done-set"
              variant="accent"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const d = mutate((x) => void (x[pos.item]!.sets[pos.set]!.done = true));
                setRest(set.restSeconds);
                advance(d);
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="Pular série"
                variant="ghost"
                onPress={() =>
                  advance(mutate((x) => void (x[pos.item]!.sets[pos.set]!.skipped = true)))
                }
              />
              <Button
                title="Trocar exercício"
                variant="ghost"
                onPress={async () => {
                  try {
                    const r = await client.request<{ equivalents: { id: string; name: string }[] }>(
                      'GET',
                      `/v1/exercises/${item.originalExerciseId}`,
                    );
                    const alt = r.equivalents[0];
                    if (alt)
                      mutate((x) =>
                        Object.assign(x[pos.item]!, {
                          exerciseId: alt.id,
                          name: alt.name,
                          media: null,
                        }),
                      );
                  } catch {
                    // sem internet: segue com o exercício original
                  }
                }}
              />
            </View>
            <Input
              label="Anotação"
              value={item.note}
              onChangeText={(v) => mutate((x) => void (x[pos.item]!.note = v))}
            />
          </Card>
        ) : null}
        {items.map((it, i) => (
          <Pressable
            key={it.itemId}
            onPress={() =>
              setPos({
                item: i,
                set: Math.max(
                  0,
                  it.sets.findIndex((s) => !s.done && !s.skipped),
                ),
              })
            }
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontWeight: i === pos.item ? '700' : '400' }}>
              {i + 1}. {it.name} ({it.sets.filter((s) => s.done).length}/{it.sets.length})
            </Text>
          </Pressable>
        ))}
        <Button title="Finalizar treino" variant="secondary" onPress={() => setFinishing(true)} />
      </ScrollView>
    </SafeAreaView>
  );
}
