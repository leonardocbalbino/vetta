import { darkTheme, lightTheme, type SemanticColors } from './themes.js';
import { palette } from './palette.js';
import { fontSize, lineHeight, radius, spacingUnit } from './scale.js';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function vars(colors: SemanticColors): string {
  return Object.entries(colors)
    .map(([k, v]) => `  --vt-${kebab(k)}: ${v};`)
    .join('\n');
}

/** CSS variables puras (sem Tailwind): :root = claro, .dark = escuro. */
export function buildTokensCss(): string {
  const raw = Object.entries(palette)
    .map(([k, v]) => `  --vt-${k}: ${v};`)
    .join('\n');
  return [
    '/* Gerado por @vetta/tokens. Não edite à mão. */',
    ':root {',
    raw,
    vars(lightTheme),
    `  --vt-radius-control: ${radius.control}px;`,
    `  --vt-radius-card: ${radius.card}px;`,
    `  --vt-radius-card-lg: ${radius.cardLg}px;`,
    '  color-scheme: light;',
    '}',
    '',
    '.dark {',
    vars(darkTheme),
    '  color-scheme: dark;',
    '}',
    '',
  ].join('\n');
}

/** Preset Tailwind 4: CSS variables + @theme inline mapeando para utilitários. */
export function buildTailwindCss(): string {
  const semantic = Object.keys(lightTheme).map(
    (k) => `  --color-${kebab(k)}: var(--vt-${kebab(k)});`,
  );
  const brand = Object.keys(palette).map((k) => `  --color-${k}: var(--vt-${k});`);
  const sizes = Object.entries(fontSize).flatMap(([k, v]) => [
    `  --text-${k}: ${v / 16}rem;`,
    `  --text-${k}--line-height: ${lineHeight[k as keyof typeof lineHeight] / 16}rem;`,
  ]);
  return [
    buildTokensCss(),
    '@theme inline {',
    ...brand,
    ...semantic,
    "  --font-sans: var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif;",
    "  --font-display: var(--font-archivo), 'Archivo', ui-sans-serif, system-ui, sans-serif;",
    ...sizes,
    `  --spacing: ${spacingUnit / 16}rem;`,
    `  --radius-sm: ${radius.sm}px;`,
    '  --radius-control: var(--vt-radius-control);',
    '  --radius-card: var(--vt-radius-card);',
    '  --radius-card-lg: var(--vt-radius-card-lg);',
    '}',
    '',
    '@utility font-display {',
    '  font-family: var(--font-display);',
    '  font-stretch: 125%;',
    '  letter-spacing: -0.03em;',
    '}',
    '',
  ].join('\n');
}
