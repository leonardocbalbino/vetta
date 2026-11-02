import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { client } from './client';

/**
 * Apple Health (iOS) e Health Connect (Android). O aluno escolhe o que autoriza; o app
 * importa passos por dia, frequência cardíaca média, peso e treinos dos últimos 30 dias e
 * exporta os treinos concluídos na Vetta. Os módulos nativos são carregados sob demanda:
 * no Expo Go (sem build de desenvolvimento) a integração aparece como indisponível.
 */

export type HealthSource = 'HEALTHKIT' | 'HEALTH_CONNECT';
export type HealthType = 'STEPS' | 'HEART_RATE' | 'WEIGHT' | 'WORKOUT';

interface Sample {
  source: HealthSource;
  type: HealthType;
  externalId: string;
  startAt: string;
  endAt: string;
  value: number;
  unit: string;
  metadata?: Record<string, string | number | boolean>;
}

export const HEALTH_SOURCE: HealthSource | null =
  Platform.OS === 'ios' ? 'HEALTHKIT' : Platform.OS === 'android' ? 'HEALTH_CONNECT' : null;
export const HEALTH_APP_NAME = Platform.OS === 'ios' ? 'Apple Saúde' : 'Health Connect';

const DAY = 86_400_000;

/* eslint-disable @typescript-eslint/no-require-imports */
// Requires estáticos (o Metro precisa do nome literal), protegidos para o Expo Go.
function loadHealthKit(): HealthKit | null {
  try {
    return require('@kingstinct/react-native-healthkit') as HealthKit;
  } catch {
    return null;
  }
}
function loadHealthConnect(): HealthConnect | null {
  try {
    return require('react-native-health-connect') as HealthConnect;
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

// ─── iOS: HealthKit ─────────────────────────────────────────────────────────

interface HKQuantity {
  uuid: string;
  startDate: Date;
  endDate: Date;
  quantity: number;
}
interface HKWorkout {
  uuid: string;
  startDate: Date;
  endDate: Date;
  workoutActivityType: number;
  duration?: { quantity: number };
}
interface HealthKit {
  isHealthDataAvailable: () => boolean;
  requestAuthorization: (t: { toRead?: string[]; toShare?: string[] }) => Promise<boolean>;
  queryQuantitySamples: (
    id: string,
    o: { limit: number; unit?: string; filter?: { date?: { startDate?: Date; endDate?: Date } } },
  ) => Promise<readonly HKQuantity[]>;
  queryWorkoutSamples: (o: {
    limit: number;
    filter?: { date?: { startDate?: Date; endDate?: Date } };
  }) => Promise<readonly HKWorkout[]>;
  saveWorkoutSample: (type: number, q: never[], start: Date, end: Date) => Promise<unknown>;
}

const HK = {
  steps: 'HKQuantityTypeIdentifierStepCount',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  weight: 'HKQuantityTypeIdentifierBodyMass',
  workout: 'HKWorkoutTypeIdentifier',
  /** HKWorkoutActivityType.traditionalStrengthTraining */
  strength: 50,
};

async function readHealthKit(since: Date): Promise<Sample[]> {
  const hk = loadHealthKit();
  if (!hk?.isHealthDataAvailable()) throw new Error('unavailable');
  await hk.requestAuthorization({
    toRead: [HK.steps, HK.heartRate, HK.weight, HK.workout],
    toShare: [HK.workout],
  });
  const filter = { date: { startDate: since, endDate: new Date() } };
  const [steps, hr, weight, workouts] = await Promise.all([
    hk.queryQuantitySamples(HK.steps, { limit: 0, unit: 'count', filter }),
    hk.queryQuantitySamples(HK.heartRate, { limit: 0, unit: 'count/min', filter }),
    hk.queryQuantitySamples(HK.weight, { limit: 0, unit: 'kg', filter }),
    hk.queryWorkoutSamples({ limit: 0, filter }),
  ]);
  const out: Sample[] = [
    ...dailySum(steps, 'HEALTHKIT', 'STEPS', 'count'),
    ...dailyAvg(hr, 'HEALTHKIT', 'HEART_RATE', 'bpm'),
    ...weight.map((w) => ({
      source: 'HEALTHKIT' as const,
      type: 'WEIGHT' as const,
      externalId: w.uuid,
      startAt: new Date(w.startDate).toISOString(),
      endAt: new Date(w.endDate).toISOString(),
      value: Math.round(w.quantity * 10) / 10,
      unit: 'kg',
    })),
    ...workouts.map((w) => ({
      source: 'HEALTHKIT' as const,
      type: 'WORKOUT' as const,
      externalId: w.uuid,
      startAt: new Date(w.startDate).toISOString(),
      endAt: new Date(w.endDate).toISOString(),
      value: Math.round((new Date(w.endDate).getTime() - new Date(w.startDate).getTime()) / 60_000),
      unit: 'min',
      metadata: { activityType: w.workoutActivityType },
    })),
  ];
  return out;
}

// ─── Android: Health Connect ────────────────────────────────────────────────

interface HCRecord {
  metadata?: { id?: string };
  startTime?: string;
  endTime?: string;
  time?: string;
  count?: number;
  samples?: { beatsPerMinute: number }[];
  weight?: { inKilograms: number };
  exerciseType?: number;
}
interface HealthConnect {
  initialize: () => Promise<boolean>;
  requestPermission: (
    p: { accessType: 'read' | 'write'; recordType: string }[],
  ) => Promise<unknown[]>;
  readRecords: (
    type: string,
    o: { timeRangeFilter: { operator: 'between'; startTime: string; endTime: string } },
  ) => Promise<{ records: HCRecord[] }>;
  insertRecords: (records: Record<string, unknown>[]) => Promise<string[]>;
}
/** ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING */
const HC_STRENGTH = 70;

async function readHealthConnect(since: Date): Promise<Sample[]> {
  const hc = loadHealthConnect();
  if (!hc || !(await hc.initialize())) throw new Error('unavailable');
  await hc.requestPermission([
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'HeartRate' },
    { accessType: 'read', recordType: 'Weight' },
    { accessType: 'read', recordType: 'ExerciseSession' },
    { accessType: 'write', recordType: 'ExerciseSession' },
  ]);
  const range = {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: since.toISOString(),
      endTime: new Date().toISOString(),
    },
  };
  const [steps, hr, weight, sessions] = await Promise.all([
    hc.readRecords('Steps', range),
    hc.readRecords('HeartRate', range),
    hc.readRecords('Weight', range),
    hc.readRecords('ExerciseSession', range),
  ]);
  const toQ = (r: HCRecord, quantity: number): HKQuantity => ({
    uuid: r.metadata?.id ?? `${r.startTime ?? r.time}`,
    startDate: new Date(r.startTime ?? r.time!),
    endDate: new Date(r.endTime ?? r.time!),
    quantity,
  });
  return [
    ...dailySum(
      steps.records.map((r) => toQ(r, r.count ?? 0)),
      'HEALTH_CONNECT',
      'STEPS',
      'count',
    ),
    ...dailyAvg(
      hr.records.flatMap((r) => (r.samples ?? []).map((s) => toQ(r, s.beatsPerMinute))),
      'HEALTH_CONNECT',
      'HEART_RATE',
      'bpm',
    ),
    ...weight.records.map((r) => ({
      source: 'HEALTH_CONNECT' as const,
      type: 'WEIGHT' as const,
      externalId: r.metadata?.id ?? r.time!,
      startAt: r.time!,
      endAt: r.time!,
      value: Math.round((r.weight?.inKilograms ?? 0) * 10) / 10,
      unit: 'kg',
    })),
    ...sessions.records.map((r) => ({
      source: 'HEALTH_CONNECT' as const,
      type: 'WORKOUT' as const,
      externalId: r.metadata?.id ?? r.startTime!,
      startAt: r.startTime!,
      endAt: r.endTime!,
      value: Math.round(
        (new Date(r.endTime!).getTime() - new Date(r.startTime!).getTime()) / 60_000,
      ),
      unit: 'min',
      metadata: { activityType: r.exerciseType ?? 0 },
    })),
  ];
}

// ─── Agregação por dia (passos somados, FC média) ───────────────────────────

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

function byDay(samples: readonly HKQuantity[]) {
  const m = new Map<string, number[]>();
  for (const s of samples) {
    const k = dayKey(new Date(s.startDate));
    m.set(k, [...(m.get(k) ?? []), s.quantity]);
  }
  return m;
}

function daily(
  samples: readonly HKQuantity[],
  source: HealthSource,
  type: HealthType,
  unit: string,
  reduce: (v: number[]) => number,
): Sample[] {
  return [...byDay(samples).entries()].map(([day, values]) => ({
    source,
    type,
    // Um registro por dia: reimportar só atualiza o valor.
    externalId: `${type.toLowerCase()}-${day}`,
    startAt: new Date(`${day}T00:00:00-03:00`).toISOString(),
    endAt: new Date(new Date(`${day}T00:00:00-03:00`).getTime() + DAY - 1).toISOString(),
    value: reduce(values),
    unit,
  }));
}
const dailySum = (s: readonly HKQuantity[], src: HealthSource, t: HealthType, u: string) =>
  daily(s, src, t, u, (v) => Math.round(v.reduce((a, b) => a + b, 0)));
const dailyAvg = (s: readonly HKQuantity[], src: HealthSource, t: HealthType, u: string) =>
  daily(s, src, t, u, (v) => Math.round(v.reduce((a, b) => a + b, 0) / v.length));

// ─── Sincronização ──────────────────────────────────────────────────────────

export interface HealthSyncResult {
  imported: number;
  exported: number;
}

/** Pede permissão, importa os últimos 30 dias e grava os treinos concluídos na Vetta. */
export async function syncHealth(): Promise<HealthSyncResult> {
  if (!HEALTH_SOURCE) throw new Error('unavailable');
  const since = new Date(Date.now() - 30 * DAY);
  const samples =
    HEALTH_SOURCE === 'HEALTHKIT' ? await readHealthKit(since) : await readHealthConnect(since);
  let imported = 0;
  for (let i = 0; i < samples.length; i += 500) {
    const r = await client.request<{ imported: number }>(
      'POST',
      '/v1/integrations/health/samples',
      {
        samples: samples.slice(i, i + 500),
      },
    );
    imported += r.imported;
  }
  const exported = await exportWorkouts(since);
  return { imported, exported };
}

const EXPORTED_KEY = 'vetta.health.exported';

/** Treinos concluídos na Vetta viram treinos de força no app de saúde (uma vez cada). */
async function exportWorkouts(since: Date): Promise<number> {
  const done = new Set<string>(JSON.parse((await SecureStore.getItemAsync(EXPORTED_KEY)) ?? '[]'));
  const list = await client.request<
    { id: string; title: string; startAt: string; endAt: string }[]
  >('GET', `/v1/integrations/health/workouts?since=${since.toISOString()}`);
  let n = 0;
  for (const w of list.filter((x) => !done.has(x.id) && x.endAt)) {
    if (HEALTH_SOURCE === 'HEALTHKIT') {
      const hk = loadHealthKit();
      await hk?.saveWorkoutSample(HK.strength, [], new Date(w.startAt), new Date(w.endAt));
    } else {
      const hc = loadHealthConnect();
      await hc?.insertRecords([
        {
          recordType: 'ExerciseSession',
          startTime: w.startAt,
          endTime: w.endAt,
          exerciseType: HC_STRENGTH,
          title: w.title,
          clientRecordId: `vetta-${w.id}`,
        },
      ]);
    }
    done.add(w.id);
    n++;
  }
  await SecureStore.setItemAsync(EXPORTED_KEY, JSON.stringify([...done].slice(-500)));
  return n;
}
