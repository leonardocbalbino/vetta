import { palette } from './palette.js';

/** Selos de plano (CLAUDE.md §11). */
export const planBadges = {
  FREE: { background: 'transparent', foreground: palette.grafite, border: palette.grafite },
  PRO: { background: palette.cobalto, foreground: palette.branco, border: palette.cobalto },
  PRO_PLUS: { background: palette.tinta, foreground: palette.cume, border: palette.tinta },
} as const;

export type PlanBadgeCode = keyof typeof planBadges;

/** Geometria do símbolo (V que vira check), viewBox 48x48. */
export const logoSymbol = {
  viewBox: '0 0 48 48',
  points: '7,16 19,36 41,9',
  strokeWidth: 7.5,
} as const;

export const logoWordmark = {
  text: 'vetta',
  fontWeight: 800,
  fontStretch: '125%',
  letterSpacing: '-0.03em',
} as const;
