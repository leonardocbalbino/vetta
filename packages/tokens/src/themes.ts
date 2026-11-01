import { palette } from './palette.js';

/**
 * Cores semânticas por tema. Componentes usam apenas estas chaves,
 * nunca a paleta crua, para que claro/escuro e white label funcionem.
 */
export interface SemanticColors {
  background: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  action: string;
  actionForeground: string;
  link: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  danger: string;
  dangerForeground: string;
  /** Série única de gráficos (validada pelo script de dataviz contra a superfície). */
  chart: string;
  overlay: string;
}

export const lightTheme: SemanticColors = {
  background: palette.nevoa,
  foreground: palette.tinta,
  surface: palette.branco,
  surfaceForeground: palette.tinta,
  muted: '#EBEDE7',
  mutedForeground: palette.grafite,
  border: palette.linha,
  input: '#D3D6CE',
  ring: palette.cobalto,
  primary: palette.tinta,
  primaryForeground: palette.nevoa,
  accent: palette.cume,
  accentForeground: palette.tinta,
  action: palette.cobalto,
  actionForeground: palette.branco,
  link: palette.cobalto,
  // branco sobre o sucesso da paleta fica em 4.38:1; tom levemente mais escuro para botões e selos
  success: '#1A7A43',
  successForeground: palette.branco,
  warning: palette.alerta,
  warningForeground: palette.tinta,
  // erro da paleta fica em 4.4:1 sobre névoa; texto de erro usa variação um tom abaixo
  danger: '#C42F2F',
  dangerForeground: palette.branco,
  chart: palette.cobalto,
  overlay: 'rgba(16, 20, 24, 0.6)',
};

export const darkTheme: SemanticColors = {
  background: palette.tinta,
  foreground: palette.nevoa,
  surface: '#181D22',
  surfaceForeground: palette.nevoa,
  muted: '#20262C',
  mutedForeground: '#A3A9AF',
  border: '#2A3036',
  input: '#363D44',
  ring: '#7B98FF',
  primary: palette.nevoa,
  primaryForeground: palette.tinta,
  accent: palette.cume,
  accentForeground: palette.tinta,
  action: palette.cobalto,
  actionForeground: palette.branco,
  // cobalto puro não atinge 4.5:1 sobre tinta; versão clareada para texto
  link: '#7B98FF',
  success: '#3FB673',
  successForeground: palette.tinta,
  warning: '#E5A92B',
  warningForeground: palette.tinta,
  danger: '#F06A6A',
  dangerForeground: palette.tinta,
  chart: '#5B7DFF',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
export type ThemeName = keyof typeof themes;
