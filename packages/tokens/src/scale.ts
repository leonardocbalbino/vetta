/** Escala tipográfica (px). */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const lineHeight = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 28,
  xl: 32,
  '2xl': 40,
  '3xl': 56,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const fontFamily = {
  /** Títulos e números de destaque: Archivo Expanded (wdth 125) 700/800. */
  display: 'Archivo',
  /** Interface: Inter 400–700. */
  sans: 'Inter',
} as const;

/** Largura do eixo wdth usada pela Archivo Expanded. */
export const displayFontStretch = '125%';
export const displayLetterSpacing = '-0.03em';

/** Espaçamento em múltiplos de 4 px. */
export const spacingUnit = 4;
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

/** Raios: 12 px em controles, 16–24 px em cartões. */
export const radius = {
  sm: 8,
  control: 12,
  card: 16,
  cardLg: 24,
  full: 9999,
} as const;

/** Alvo mínimo de toque (WCAG 2.2 AA / diretrizes mobile). */
export const minTouchTarget = 44;
