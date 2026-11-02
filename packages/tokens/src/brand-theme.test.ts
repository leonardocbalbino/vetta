import { describe, expect, it } from 'vitest';
import {
  brandThemeCss,
  brandThemeVars,
  checkAccent,
  checkBrandColors,
  checkPrimary,
  mix,
  nearestAccessible,
  onColor,
} from './brand-theme.js';
import { contrastRatio } from './contrast.js';
import { palette } from './palette.js';

describe('white label: contraste', () => {
  it('aceita o cobalto da Vetta como primária e o cume como destaque', () => {
    expect(checkPrimary(palette.cobalto).ok).toBe(true);
    expect(checkAccent(palette.cume).ok).toBe(true);
  });

  it('reprova primária clara e sugere a variante mais próxima que passa', () => {
    const r = checkPrimary('#FFB3C7');
    expect(r.ok).toBe(false);
    expect(r.suggestion).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrastRatio(r.suggestion!, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(r.suggestion!, palette.nevoa)).toBeGreaterThanOrEqual(4.5);
    expect(checkPrimary(r.suggestion!).ok).toBe(true);
  });

  it('reprova destaque escuro demais para o fundo tinta', () => {
    const r = checkAccent('#1A1F25');
    expect(r.ok).toBe(false);
    expect(contrastRatio(r.suggestion!, palette.tinta)).toBeGreaterThanOrEqual(3);
  });

  it('cor que já passa não é alterada', () => {
    expect(nearestAccessible('#2F5BFF', '#FFFFFF', 4.5)).toBe('#2F5BFF');
    expect(nearestAccessible('#777777', '#777777', 30)).toBeNull();
  });

  it('texto sobre a cor é o de maior contraste', () => {
    expect(onColor(palette.cume)).toBe(palette.tinta);
    expect(onColor(palette.cobalto)).toBe('#FFFFFF');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('resume as duas cores e ignora as ausentes', () => {
    expect(checkBrandColors({}).ok).toBe(true);
    const r = checkBrandColors({ primaryColor: '#FFFF00', accentColor: palette.cume });
    expect(r.ok).toBe(false);
    expect(r.primary?.ok).toBe(false);
    expect(r.accent?.ok).toBe(true);
  });
});

describe('white label: variáveis do tema', () => {
  it('aplica a primária como ação/link e clareia o link no escuro', () => {
    const v = brandThemeVars({ primaryColor: '#7A1FA2', accentColor: '#FFC400' });
    expect(v.light['--vt-action']).toBe('#7A1FA2');
    expect(v.light['--vt-action-foreground']).toBe('#FFFFFF');
    expect(contrastRatio(v.dark['--vt-link']!, palette.tinta)).toBeGreaterThanOrEqual(4.5);
    expect(v.dark['--vt-accent']).toBe('#FFC400');
    expect(v.dark['--vt-accent-foreground']).toBe(palette.tinta);
  });

  it('ignora cor reprovada ou inválida (vale o tema Vetta)', () => {
    expect(brandThemeVars({ primaryColor: '#FFFF00' }).light).toEqual({});
    expect(brandThemeVars({ primaryColor: 'red' }).light).toEqual({});
    expect(brandThemeCss({})).toBe('');
  });

  it('gera o CSS de :root e .dark', () => {
    const css = brandThemeCss({ primaryColor: '#7A1FA2' });
    expect(css).toContain(':root {');
    expect(css).toContain('.dark {');
    expect(css).toContain('--vt-action: #7A1FA2;');
  });
});

describe('white label no React Native', () => {
  it('mapeia as variáveis para as cores semânticas', async () => {
    const { brandNativeColors } = await import('./brand-theme.js');
    const light = brandNativeColors({ primaryColor: '#7A1FA2', accentColor: '#FFC400' }, 'light');
    expect(light).toMatchObject({ action: '#7A1FA2', link: '#7A1FA2', accent: '#FFC400' });
    const dark = brandNativeColors({ primaryColor: '#7A1FA2' }, 'dark');
    expect(contrastRatio(dark.link!, palette.tinta)).toBeGreaterThanOrEqual(4.5);
    expect(brandNativeColors({ primaryColor: '#FFFF00' }, 'light')).toEqual({});
  });
});
