/**
 * Cálculos puros de fitness. Sem dependências e 100% testados.
 * Protocolos de dobras cutâneas (Pollock, Guedes, Petroski etc.) entram na fase de avaliação física.
 */

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

function assertPositive(name: string, v: number) {
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} deve ser um número positivo`);
}

/** Índice de massa corporal: peso (kg) / altura (m)². */
export function bmi(weightKg: number, heightCm: number): number {
  assertPositive('peso', weightKg);
  assertPositive('altura', heightCm);
  const m = heightCm / 100;
  return round(weightKg / (m * m));
}

export type BmiClass =
  'underweight' | 'normal' | 'overweight' | 'obesity_1' | 'obesity_2' | 'obesity_3';

/** Classificação da OMS para adultos. */
export function bmiClass(value: number): BmiClass {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  if (value < 35) return 'obesity_1';
  if (value < 40) return 'obesity_2';
  return 'obesity_3';
}

/** Relação cintura-quadril. */
export function waistHipRatio(waistCm: number, hipCm: number): number {
  assertPositive('cintura', waistCm);
  assertPositive('quadril', hipCm);
  return round(waistCm / hipCm);
}

export type OneRmFormula = 'epley' | 'brzycki' | 'lombardi';

/** Estimativa de 1RM a partir de carga e repetições (válido até ~12 reps). */
export function oneRepMax(loadKg: number, reps: number, formula: OneRmFormula = 'epley'): number {
  assertPositive('carga', loadKg);
  if (!Number.isInteger(reps) || reps < 1) throw new RangeError('repetições deve ser inteiro >= 1');
  if (reps === 1) return round(loadKg, 1);
  switch (formula) {
    case 'epley':
      return round(loadKg * (1 + reps / 30), 1);
    case 'brzycki':
      if (reps >= 37) throw new RangeError('Brzycki não se aplica a 37+ repetições');
      return round(loadKg * (36 / (37 - reps)), 1);
    case 'lombardi':
      return round(loadKg * reps ** 0.1, 1);
  }
}

export interface PerformedSet {
  loadKg: number;
  reps: number;
}

/** Volume total (tonelagem) = Σ carga × repetições. */
export function volume(sets: readonly PerformedSet[]): number {
  return round(
    sets.reduce((acc, s) => acc + Math.max(0, s.loadKg) * Math.max(0, s.reps), 0),
    1,
  );
}
