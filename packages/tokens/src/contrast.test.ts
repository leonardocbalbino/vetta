import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { darkTheme, lightTheme, type SemanticColors } from './themes.js';

const pairs: [keyof SemanticColors, keyof SemanticColors][] = [
  ['foreground', 'background'],
  ['surfaceForeground', 'surface'],
  ['mutedForeground', 'background'],
  ['primaryForeground', 'primary'],
  ['accentForeground', 'accent'],
  ['actionForeground', 'action'],
  ['link', 'background'],
  ['danger', 'background'],
  ['dangerForeground', 'danger'],
  ['successForeground', 'success'],
  ['warningForeground', 'warning'],
];

describe.each([
  ['claro', lightTheme],
  ['escuro', darkTheme],
])('contraste WCAG AA no tema %s', (_name, theme) => {
  it.each(pairs)('%s sobre %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
