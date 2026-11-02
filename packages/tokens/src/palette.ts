/** Paleta da marca Vetta (fonte única; ver CLAUDE.md §11). */
export const palette = {
  tinta: '#101418',
  cume: '#C6F432',
  cobalto: '#2F5BFF',
  nevoa: '#F4F5F1',
  grafite: '#5B6168',
  linha: '#E3E5DF',
  sucesso: '#1F8A4C',
  alerta: '#C98A0B',
  erro: '#D03838',
  branco: '#FFFFFF',
} as const;

export type PaletteColor = keyof typeof palette;
