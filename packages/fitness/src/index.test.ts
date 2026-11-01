import { describe, expect, it } from 'vitest';
import { bmi, bmiClass, oneRepMax, volume, waistHipRatio } from './index.js';

describe('bmi', () => {
  it('calcula peso/altura²', () => {
    expect(bmi(80, 180)).toBe(24.69);
  });
  it('rejeita valores inválidos', () => {
    expect(() => bmi(0, 180)).toThrow(RangeError);
    expect(() => bmi(80, Number.NaN)).toThrow(RangeError);
  });
  it.each([
    [18.4, 'underweight'],
    [18.5, 'normal'],
    [24.99, 'normal'],
    [25, 'overweight'],
    [30, 'obesity_1'],
    [35, 'obesity_2'],
    [40, 'obesity_3'],
  ] as const)('classifica %s como %s', (v, c) => {
    expect(bmiClass(v)).toBe(c);
  });
});

describe('waistHipRatio', () => {
  it('divide cintura por quadril', () => {
    expect(waistHipRatio(80, 100)).toBe(0.8);
  });
  it('rejeita zero', () => {
    expect(() => waistHipRatio(80, 0)).toThrow(RangeError);
  });
});

describe('oneRepMax', () => {
  it('1 repetição é a própria carga', () => {
    expect(oneRepMax(100, 1)).toBe(100);
  });
  it('epley', () => {
    expect(oneRepMax(100, 10)).toBe(133.3);
  });
  it('brzycki', () => {
    expect(oneRepMax(100, 10, 'brzycki')).toBe(133.3);
    expect(() => oneRepMax(100, 37, 'brzycki')).toThrow(RangeError);
  });
  it('lombardi', () => {
    expect(oneRepMax(100, 10, 'lombardi')).toBe(125.9);
  });
  it('rejeita repetições inválidas', () => {
    expect(() => oneRepMax(100, 0)).toThrow(RangeError);
    expect(() => oneRepMax(100, 2.5)).toThrow(RangeError);
  });
});

describe('volume', () => {
  it('soma carga × reps e ignora negativos', () => {
    expect(
      volume([
        { loadKg: 50, reps: 10 },
        { loadKg: 60, reps: 8 },
        { loadKg: -5, reps: 10 },
      ]),
    ).toBe(980);
  });
  it('lista vazia = 0', () => {
    expect(volume([])).toBe(0);
  });
});
