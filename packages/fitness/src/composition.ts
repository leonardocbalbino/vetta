/**
 * Composição corporal por dobras cutâneas (mm).
 * Referências:
 * - Jackson & Pollock (1978) e Jackson, Pollock & Ward (1980): 3 e 7 dobras.
 * - Guedes (1994): 3 dobras, população brasileira.
 * - Petroski (1995): 4 dobras, população brasileira.
 * - Faulkner (1968): 4 dobras, % de gordura direto.
 * - Durnin & Womersley (1974): 4 dobras, coeficientes por sexo e faixa etária.
 * - Siri (1961) e Brozek (1963): densidade → % de gordura.
 */

export type Sex = 'male' | 'female';

export type Skinfold =
  | 'chest'
  | 'midaxillary'
  | 'triceps'
  | 'subscapular'
  | 'abdominal'
  | 'suprailiac'
  | 'thigh'
  | 'biceps'
  | 'calf';

export type Skinfolds = Partial<Record<Skinfold, number>>;

export type Protocol =
  | 'POLLOCK_3'
  | 'POLLOCK_7'
  | 'JACKSON_POLLOCK'
  | 'GUEDES'
  | 'PETROSKI'
  | 'FAULKNER'
  | 'DURNIN_WOMERSLEY';

export const SKINFOLD_LABELS: Record<Skinfold, string> = {
  chest: 'Peitoral',
  midaxillary: 'Axilar média',
  triceps: 'Tríceps',
  subscapular: 'Subescapular',
  abdominal: 'Abdominal',
  suprailiac: 'Suprailíaca',
  thigh: 'Coxa',
  biceps: 'Bíceps',
  calf: 'Panturrilha medial',
};

/** Dobras exigidas por protocolo e sexo (o formulário só mostra estas). */
export const PROTOCOL_SITES: Record<Protocol, Record<Sex, readonly Skinfold[]>> = {
  POLLOCK_3: { male: ['chest', 'abdominal', 'thigh'], female: ['triceps', 'suprailiac', 'thigh'] },
  POLLOCK_7: {
    male: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'],
    female: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'],
  },
  // Variante de 3 dobras de Jackson & Pollock (alternativa sem coxa/abdominal no homem).
  JACKSON_POLLOCK: {
    male: ['chest', 'triceps', 'subscapular'],
    female: ['triceps', 'suprailiac', 'abdominal'],
  },
  GUEDES: {
    male: ['triceps', 'suprailiac', 'abdominal'],
    female: ['thigh', 'suprailiac', 'subscapular'],
  },
  PETROSKI: {
    male: ['subscapular', 'triceps', 'suprailiac', 'calf'],
    female: ['midaxillary', 'suprailiac', 'thigh', 'calf'],
  },
  FAULKNER: {
    male: ['triceps', 'subscapular', 'suprailiac', 'abdominal'],
    female: ['triceps', 'subscapular', 'suprailiac', 'abdominal'],
  },
  DURNIN_WOMERSLEY: {
    male: ['biceps', 'triceps', 'subscapular', 'suprailiac'],
    female: ['biceps', 'triceps', 'subscapular', 'suprailiac'],
  },
};

export class MissingSkinfoldError extends Error {
  constructor(readonly missing: Skinfold[]) {
    super(`Dobras ausentes: ${missing.map((m) => SKINFOLD_LABELS[m]).join(', ')}`);
  }
}

function sumSites(protocol: Protocol, sex: Sex, folds: Skinfolds): number {
  const sites = PROTOCOL_SITES[protocol][sex];
  const missing = sites.filter((s) => !(typeof folds[s] === 'number' && folds[s]! > 0));
  if (missing.length) throw new MissingSkinfoldError(missing);
  return sites.reduce((acc, s) => acc + folds[s]!, 0);
}

const DURNIN: Record<Sex, [maxAge: number, c: number, m: number][]> = {
  male: [
    [19, 1.162, 0.063],
    [29, 1.1631, 0.0632],
    [39, 1.1422, 0.0544],
    [49, 1.162, 0.07],
    [Infinity, 1.1715, 0.0779],
  ],
  female: [
    [19, 1.1549, 0.0678],
    [29, 1.1599, 0.0717],
    [39, 1.1423, 0.0632],
    [49, 1.1333, 0.0612],
    [Infinity, 1.1339, 0.0645],
  ],
};

/** Densidade corporal (g/cm³). Faulkner não usa densidade: retorna null. */
export function bodyDensity(
  protocol: Protocol,
  sex: Sex,
  age: number,
  folds: Skinfolds,
): number | null {
  if (!Number.isFinite(age) || age <= 0) throw new RangeError('idade inválida');
  const s = sumSites(protocol, sex, folds);
  const male = sex === 'male';
  switch (protocol) {
    case 'POLLOCK_3':
      return male
        ? 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * age
        : 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * age;
    case 'POLLOCK_7':
      return male
        ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * age
        : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * age;
    case 'JACKSON_POLLOCK':
      return male
        ? 1.1125025 - 0.0013125 * s + 0.0000055 * s * s - 0.000244 * age
        : 1.089733 - 0.0009245 * s + 0.0000025 * s * s - 0.0000979 * age;
    case 'GUEDES':
      return male ? 1.17136 - 0.06706 * Math.log10(s) : 1.1665 - 0.07063 * Math.log10(s);
    case 'PETROSKI':
      return male
        ? 1.10726863 - 0.00081201 * s + 0.00000212 * s * s - 0.00041761 * age
        : 1.1954713 - 0.07513507 * Math.log10(s) - 0.00041072 * age;
    case 'DURNIN_WOMERSLEY': {
      const [, c, m] = DURNIN[sex].find(([maxAge]) => age <= maxAge)!;
      return c - m * Math.log10(s);
    }
    case 'FAULKNER':
      return null;
  }
}

/** Siri (1961). */
export const siri = (density: number) => (4.95 / density - 4.5) * 100;
/** Brozek (1963). */
export const brozek = (density: number) => (4.57 / density - 4.142) * 100;

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface CompositionInput {
  protocol: Protocol;
  sex: Sex;
  age: number;
  weightKg: number;
  skinfolds: Skinfolds;
  equation?: 'siri' | 'brozek';
}

export interface CompositionResult {
  density: number | null;
  bodyFatPct: number;
  fatMassKg: number;
  leanMassKg: number;
  sumSkinfolds: number;
}

export function bodyComposition(i: CompositionInput): CompositionResult {
  if (!(i.weightKg > 0)) throw new RangeError('peso inválido');
  const sum = sumSites(i.protocol, i.sex, i.skinfolds);
  let pct: number;
  let density: number | null = null;
  if (i.protocol === 'FAULKNER') {
    pct = sum * 0.153 + 5.783;
  } else {
    density = bodyDensity(i.protocol, i.sex, i.age, i.skinfolds)!;
    pct = (i.equation === 'brozek' ? brozek : siri)(density);
  }
  pct = Math.max(0, pct);
  const fat = (i.weightKg * pct) / 100;
  return {
    density: density === null ? null : Math.round(density * 100000) / 100000,
    bodyFatPct: r2(pct),
    fatMassKg: r2(fat),
    leanMassKg: r2(i.weightKg - fat),
    sumSkinfolds: r2(sum),
  };
}

/** Composição a partir da bioimpedância manual (% de gordura informado). */
export function compositionFromBodyFat(
  weightKg: number,
  bodyFatPct: number,
): Pick<CompositionResult, 'bodyFatPct' | 'fatMassKg' | 'leanMassKg'> {
  if (!(weightKg > 0) || !(bodyFatPct >= 0 && bodyFatPct < 100))
    throw new RangeError('valores inválidos');
  const fat = (weightKg * bodyFatPct) / 100;
  return { bodyFatPct: r2(bodyFatPct), fatMassKg: r2(fat), leanMassKg: r2(weightKg - fat) };
}

export type BodyFatClass = 'essential' | 'athlete' | 'fitness' | 'average' | 'obese';

/** Classificação de % de gordura (American Council on Exercise). */
export function bodyFatClass(pct: number, sex: Sex): BodyFatClass {
  const [a, b, c, d] = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (pct < a) return 'essential';
  if (pct < b) return 'athlete';
  if (pct < c) return 'fitness';
  if (pct < d) return 'average';
  return 'obese';
}

export type WhrRisk = 'low' | 'moderate' | 'high';

/** Risco pela relação cintura-quadril (OMS: alto ≥ 0,90 homens / ≥ 0,85 mulheres). */
export function waistHipRisk(ratio: number, sex: Sex): WhrRisk {
  const [moderate, high] = sex === 'male' ? [0.9, 0.95] : [0.8, 0.85];
  if (ratio >= high) return 'high';
  if (ratio >= moderate) return 'moderate';
  return 'low';
}

/** Idade em anos completos numa data. */
export function ageAt(birthDate: Date, on: Date = new Date()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = on.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}
