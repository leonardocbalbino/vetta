import type { FeatureType } from '../generated/client';

/** Valores de feature são gravados como inteiro: BOOLEAN 0/1, LIMIT número (-1 ilimitado). */
export function featureValueToDb(value: boolean | number): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : Math.trunc(value);
}

export function featureValueFromDb(type: FeatureType, value: number): boolean | number {
  return type === 'BOOLEAN' ? value !== 0 : value;
}
