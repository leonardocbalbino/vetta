import { contrastRatio } from './contrast.js';
import { palette } from './palette.js';
import type { SemanticColors } from './themes.js';

/**
 * White label: cores do personal aplicadas sobre os tokens da Vetta.
 *
 * Regras de contraste (WCAG 2.2 AA):
 * - primária (vira a cor de ação: botões com texto branco e links sobre o fundo névoa)
 *   → ≥ 4,5:1 contra branco e contra névoa;
 * - destaque: elementos gráficos sobre o fundo escuro (tinta) → ≥ 3:1, e o texto sobre
 *   ele (tinta ou branco, o que contrastar mais) → ≥ 4,5:1.
 * Cor reprovada não é salva: a API devolve a variante mais próxima que passa.
 */

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export const BRAND_CONTRAST = { text: 4.5, graphic: 3 } as const;

const WHITE = '#FFFFFF';

export interface ColorCheck {
  ok: boolean;
  ratio: number;
  /** Variante mais próxima que passa (só quando ok = false). */
  suggestion: string | null;
}

export interface BrandColorsCheck {
  ok: boolean;
  primary: ColorCheck | null;
  accent: ColorCheck | null;
}

function toRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b]
      .map((c) =>
        Math.round(Math.min(255, Math.max(0, c)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

/** Mistura `hex` com `target` na proporção t (0 = hex, 1 = target). */
export function mix(hex: string, target: string, t: number): string {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/**
 * Menor ajuste de `hex` (escurecendo ou clareando) que atinge `min` contra `against`.
 * Mantém a matiz; devolve null se nem preto/branco puro atingem.
 */
export function nearestAccessible(hex: string, against: string, min: number): string | null {
  if (contrastRatio(hex, against) >= min) return hex.toUpperCase();
  const candidates: string[] = [];
  for (const target of ['#000000', WHITE]) {
    for (let step = 1; step <= 100; step++) {
      const c = mix(hex, target, step / 100);
      if (contrastRatio(c, against) >= min) {
        candidates.push(c);
        break;
      }
    }
  }
  if (!candidates.length) return null;
  // A mais próxima da cor original (distância RGB).
  const [r0, g0, b0] = toRgb(hex);
  const dist = (c: string) => {
    const [r, g, b] = toRgb(c);
    return (r - r0) ** 2 + (g - g0) ** 2 + (b - b0) ** 2;
  };
  return candidates.sort((a, b) => dist(a) - dist(b))[0]!;
}

/** Texto sobre a cor: tinta ou branco, o que contrastar mais. */
export function onColor(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, palette.tinta) ? WHITE : palette.tinta;
}

function check(hex: string, against: string, min: number): ColorCheck {
  const ratio = Math.round(contrastRatio(hex, against) * 100) / 100;
  const ok = ratio >= min;
  return { ok, ratio, suggestion: ok ? null : nearestAccessible(hex, against, min) };
}

export function checkPrimary(hex: string): ColorCheck {
  // Névoa é mais escura que o branco: passar contra ela implica passar contra o branco
  // para cores escuras; cores claras demais falham nas duas.
  const onWhite = check(hex, WHITE, BRAND_CONTRAST.text);
  const onFog = check(hex, palette.nevoa, BRAND_CONTRAST.text);
  if (onWhite.ok && onFog.ok)
    return { ok: true, ratio: Math.min(onWhite.ratio, onFog.ratio), suggestion: null };
  return {
    ok: false,
    ratio: Math.min(onWhite.ratio, onFog.ratio),
    suggestion: onFog.suggestion ?? onWhite.suggestion,
  };
}

export function checkAccent(hex: string): ColorCheck {
  const graphic = check(hex, palette.tinta, BRAND_CONTRAST.graphic);
  if (!graphic.ok) return graphic;
  // O texto sobre o destaque também precisa de 4,5:1.
  const text = contrastRatio(hex, onColor(hex));
  if (text >= BRAND_CONTRAST.text) return graphic;
  return {
    ok: false,
    ratio: Math.round(text * 100) / 100,
    suggestion: nearestAccessible(hex, onColor(hex), BRAND_CONTRAST.text),
  };
}

export function checkBrandColors(colors: {
  primaryColor?: string | null;
  accentColor?: string | null;
}): BrandColorsCheck {
  const primary = colors.primaryColor ? checkPrimary(colors.primaryColor) : null;
  const accent = colors.accentColor ? checkAccent(colors.accentColor) : null;
  return { ok: (primary?.ok ?? true) && (accent?.ok ?? true), primary, accent };
}

export interface BrandThemeVars {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/**
 * Variáveis CSS do tema do personal, sobre os tokens semânticos (--vt-*).
 * A primária vira a cor de ação, link, foco e gráfico; o destaque substitui o cume.
 * No modo escuro, o link é clareado até 4,5:1 contra a tinta.
 * Cores reprovadas são ignoradas (o tema Vetta continua valendo).
 */
export function brandThemeVars(colors: {
  primaryColor?: string | null;
  accentColor?: string | null;
}): BrandThemeVars {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  if (
    colors.primaryColor &&
    HEX_RE.test(colors.primaryColor) &&
    checkPrimary(colors.primaryColor).ok
  ) {
    const p = colors.primaryColor.toUpperCase();
    const darkLink = nearestAccessible(p, palette.tinta, BRAND_CONTRAST.text) ?? '#FFFFFF';
    Object.assign(light, {
      '--vt-action': p,
      '--vt-action-foreground': onColor(p),
      '--vt-link': p,
      '--vt-ring': p,
      '--vt-chart': p,
    });
    Object.assign(dark, {
      '--vt-action': p,
      '--vt-action-foreground': onColor(p),
      '--vt-link': darkLink,
      '--vt-ring': darkLink,
      '--vt-chart': darkLink,
    });
  }
  if (colors.accentColor && HEX_RE.test(colors.accentColor) && checkAccent(colors.accentColor).ok) {
    const a = colors.accentColor.toUpperCase();
    for (const mode of [light, dark]) {
      mode['--vt-accent'] = a;
      mode['--vt-accent-foreground'] = onColor(a);
    }
  }
  return { light, dark };
}

/** Bloco CSS pronto para injetar no <head> (:root = claro, .dark = escuro). */
export function brandThemeCss(colors: {
  primaryColor?: string | null;
  accentColor?: string | null;
}): string {
  const { light, dark } = brandThemeVars(colors);
  const block = (sel: string, v: Record<string, string>) => {
    const lines = Object.entries(v).map(([k, val]) => `  ${k}: ${val};`);
    return lines.length ? [`${sel} {`, ...lines, '}'].join('\n') : '';
  };
  return [block(':root', light), block('.dark', dark)].filter(Boolean).join('\n');
}

const VAR_TO_KEY: Record<string, keyof SemanticColors> = {
  '--vt-action': 'action',
  '--vt-action-foreground': 'actionForeground',
  '--vt-link': 'link',
  '--vt-ring': 'ring',
  '--vt-chart': 'chart',
  '--vt-accent': 'accent',
  '--vt-accent-foreground': 'accentForeground',
};

/** Mesmas regras do tema web, para o React Native (cores semânticas sobrescritas). */
export function brandNativeColors(
  colors: { primaryColor?: string | null; accentColor?: string | null },
  mode: 'light' | 'dark',
): Partial<SemanticColors> {
  const vars = brandThemeVars(colors)[mode];
  return Object.fromEntries(
    Object.entries(vars)
      .filter(([k]) => VAR_TO_KEY[k])
      .map(([k, v]) => [VAR_TO_KEY[k], v]),
  ) as Partial<SemanticColors>;
}
