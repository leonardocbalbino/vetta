import {
  FEATURES_BY_KEY,
  UNLIMITED,
  type EntitlementsResponse,
  type FeatureKey,
  type PlanCode,
} from '@vetta/contracts';

export interface FeatureState {
  key: FeatureKey;
  /** Liberado no plano atual. */
  enabled: boolean;
  /** Valor bruto: boolean ou limite (-1 = ilimitado). */
  value: boolean | number | undefined;
  used?: number;
  max?: number;
  /** Ainda há espaço no limite? (features LIMIT) */
  hasRoom: boolean;
  label: string;
  /** O front mostra cadeado com CTA de upgrade quando true. */
  locked: boolean;
  currentPlan: PlanCode | null;
}

/** Função pura usada pelo hook useFeature (web e mobile). */
export function featureState(ent: EntitlementsResponse | undefined, key: FeatureKey): FeatureState {
  const value = ent?.features[key];
  const limit = ent?.limits[key];
  const enabled =
    typeof value === 'boolean'
      ? value
      : typeof value === 'number'
        ? value === UNLIMITED || value > 0
        : false;
  const hasRoom = !limit || limit.max === UNLIMITED || limit.used < limit.max;
  return {
    key,
    enabled,
    value,
    ...(limit ? { used: limit.used, max: limit.max } : {}),
    hasRoom,
    label: FEATURES_BY_KEY[key]?.name ?? key,
    locked: !enabled || !hasRoom,
    currentPlan: ent?.plan.code ?? null,
  };
}
