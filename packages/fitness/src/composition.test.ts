import { describe, expect, it } from 'vitest';
import {
  ageAt,
  bodyComposition,
  bodyDensity,
  bodyFatClass,
  brozek,
  compositionFromBodyFat,
  MissingSkinfoldError,
  PROTOCOL_SITES,
  siri,
  waistHipRisk,
  type Protocol,
  type Sex,
  type Skinfolds,
} from './composition.js';

/**
 * Valores esperados calculados à mão a partir das equações publicadas
 * (coeficientes conferidos com as fontes citadas em composition.ts).
 */
const all = (v: number): Skinfolds => ({
  chest: v,
  midaxillary: v,
  triceps: v,
  subscapular: v,
  abdominal: v,
  suprailiac: v,
  thigh: v,
  biceps: v,
  calf: v,
});

describe('densidade corporal', () => {
  const cases: [Protocol, Sex, number, Skinfolds, number][] = [
    // JP3 homem: Σ=60, 30 anos → 1,10938 − 0,049602 + 0,00576 − 0,007722
    ['POLLOCK_3', 'male', 30, { chest: 20, abdominal: 25, thigh: 15 }, 1.057816],
    // JP3 mulher: Σ=60, 25 anos → 1,0994921 − 0,059574 + 0,00828 − 0,00348
    ['POLLOCK_3', 'female', 25, { triceps: 20, suprailiac: 20, thigh: 20 }, 1.0447181],
    // JP7 homem: Σ=105 (7×15), 40 anos
    [
      'POLLOCK_7',
      'male',
      40,
      all(15),
      1.112 - 0.00043499 * 105 + 0.00000055 * 105 ** 2 - 0.00028826 * 40,
    ],
    [
      'POLLOCK_7',
      'female',
      40,
      all(15),
      1.097 - 0.00046971 * 105 + 0.00000056 * 105 ** 2 - 0.00012828 * 40,
    ],
    [
      'JACKSON_POLLOCK',
      'male',
      30,
      all(15),
      1.1125025 - 0.0013125 * 45 + 0.0000055 * 45 ** 2 - 0.000244 * 30,
    ],
    [
      'JACKSON_POLLOCK',
      'female',
      30,
      all(15),
      1.089733 - 0.0009245 * 45 + 0.0000025 * 45 ** 2 - 0.0000979 * 30,
    ],
    // Guedes homem: Σ=45 → 1,17136 − 0,06706·log10(45)
    ['GUEDES', 'male', 30, all(15), 1.17136 - 0.06706 * Math.log10(45)],
    ['GUEDES', 'female', 30, all(15), 1.1665 - 0.07063 * Math.log10(45)],
    [
      'PETROSKI',
      'male',
      30,
      all(15),
      1.10726863 - 0.00081201 * 60 + 0.00000212 * 60 ** 2 - 0.00041761 * 30,
    ],
    ['PETROSKI', 'female', 30, all(15), 1.1954713 - 0.07513507 * Math.log10(60) - 0.00041072 * 30],
  ];
  it.each(cases)('%s %s', (protocol, sex, age, folds, expected) => {
    expect(bodyDensity(protocol, sex, age, folds)).toBeCloseTo(expected, 6);
  });

  it.each([
    ['male', 18, 1.162, 0.063],
    ['male', 25, 1.1631, 0.0632],
    ['male', 35, 1.1422, 0.0544],
    ['male', 45, 1.162, 0.07],
    ['male', 60, 1.1715, 0.0779],
    ['female', 18, 1.1549, 0.0678],
    ['female', 25, 1.1599, 0.0717],
    ['female', 35, 1.1423, 0.0632],
    ['female', 45, 1.1333, 0.0612],
    ['female', 60, 1.1339, 0.0645],
  ] as const)('Durnin-Womersley %s %i anos usa a faixa correta', (sex, age, c, m) => {
    expect(bodyDensity('DURNIN_WOMERSLEY', sex, age, all(10))).toBeCloseTo(
      c - m * Math.log10(40),
      6,
    );
  });

  it('Faulkner não usa densidade', () => {
    expect(bodyDensity('FAULKNER', 'male', 30, all(10))).toBeNull();
  });

  it('valida idade e dobras ausentes', () => {
    expect(() => bodyDensity('POLLOCK_3', 'male', 0, all(10))).toThrow(RangeError);
    const err = (() => {
      try {
        bodyDensity('POLLOCK_3', 'male', 30, { chest: 10 });
      } catch (e) {
        return e as MissingSkinfoldError;
      }
    })();
    expect(err).toBeInstanceOf(MissingSkinfoldError);
    expect(err!.missing).toEqual(['abdominal', 'thigh']);
    expect(err!.message).toContain('Abdominal');
  });

  it('cada protocolo lista as dobras por sexo', () => {
    expect(PROTOCOL_SITES.POLLOCK_7.male).toHaveLength(7);
    expect(PROTOCOL_SITES.PETROSKI.female).toContain('calf');
  });
});

describe('% de gordura', () => {
  it('Siri e Brozek', () => {
    expect(siri(1.057816)).toBeCloseTo(17.946, 2);
    expect(brozek(1.057816)).toBeCloseTo(17.82, 1);
  });

  it('composição completa (JP3 homem, 80 kg)', () => {
    const r = bodyComposition({
      protocol: 'POLLOCK_3',
      sex: 'male',
      age: 30,
      weightKg: 80,
      skinfolds: { chest: 20, abdominal: 25, thigh: 15 },
    });
    expect(r).toEqual({
      density: 1.05782,
      bodyFatPct: 17.95,
      fatMassKg: 14.36,
      leanMassKg: 65.64,
      sumSkinfolds: 60,
    });
  });

  it('Brozek opcional', () => {
    const r = bodyComposition({
      protocol: 'POLLOCK_3',
      sex: 'male',
      age: 30,
      weightKg: 80,
      skinfolds: { chest: 20, abdominal: 25, thigh: 15 },
      equation: 'brozek',
    });
    expect(r.bodyFatPct).toBeCloseTo(17.82, 1);
  });

  it('Faulkner: Σ4 × 0,153 + 5,783', () => {
    const r = bodyComposition({
      protocol: 'FAULKNER',
      sex: 'female',
      age: 30,
      weightKg: 60,
      skinfolds: all(10),
    });
    expect(r.bodyFatPct).toBe(11.9);
    expect(r.density).toBeNull();
  });

  it('nunca negativo e valida o peso', () => {
    expect(
      bodyComposition({ protocol: 'GUEDES', sex: 'male', age: 20, weightKg: 70, skinfolds: all(1) })
        .bodyFatPct,
    ).toBe(0);
    expect(() =>
      bodyComposition({
        protocol: 'GUEDES',
        sex: 'male',
        age: 20,
        weightKg: 0,
        skinfolds: all(10),
      }),
    ).toThrow(RangeError);
  });

  it('bioimpedância manual', () => {
    expect(compositionFromBodyFat(70, 20)).toEqual({
      bodyFatPct: 20,
      fatMassKg: 14,
      leanMassKg: 56,
    });
    expect(() => compositionFromBodyFat(70, 120)).toThrow(RangeError);
    expect(() => compositionFromBodyFat(0, 20)).toThrow(RangeError);
  });
});

describe('classificações', () => {
  it.each([
    [5, 'male', 'essential'],
    [10, 'male', 'athlete'],
    [15, 'male', 'fitness'],
    [20, 'male', 'average'],
    [26, 'male', 'obese'],
    [12, 'female', 'essential'],
    [18, 'female', 'athlete'],
    [22, 'female', 'fitness'],
    [28, 'female', 'average'],
    [33, 'female', 'obese'],
  ] as const)('%i%% %s → %s', (pct, sex, c) => {
    expect(bodyFatClass(pct, sex)).toBe(c);
  });

  it.each([
    [0.85, 'male', 'low'],
    [0.92, 'male', 'moderate'],
    [0.96, 'male', 'high'],
    [0.75, 'female', 'low'],
    [0.82, 'female', 'moderate'],
    [0.86, 'female', 'high'],
  ] as const)('RCQ %d %s → %s', (r, sex, risk) => {
    expect(waistHipRisk(r, sex)).toBe(risk);
  });

  it('idade em anos completos', () => {
    const birth = new Date(Date.UTC(1990, 5, 15));
    expect(ageAt(birth, new Date(Date.UTC(2026, 5, 14)))).toBe(35);
    expect(ageAt(birth, new Date(Date.UTC(2026, 5, 15)))).toBe(36);
    expect(ageAt(birth, new Date(Date.UTC(2026, 4, 30)))).toBe(35);
    expect(ageAt(birth)).toBeGreaterThan(30);
  });
});
