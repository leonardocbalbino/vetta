import { logoSymbol, logoWordmark, palette } from '@vetta/tokens';
import { cn } from '../utils.js';

export type LogoVariant = 'auto' | 'principal' | 'positivo' | 'monocromatico' | 'simbolo';

const COLORS: Record<Exclude<LogoVariant, 'simbolo' | 'auto'>, { symbol: string; word: string }> = {
  /** Fundo claro: símbolo e palavra em tinta. */
  principal: { symbol: palette.tinta, word: palette.tinta },
  /** Fundo escuro: símbolo cume, palavra névoa. */
  positivo: { symbol: palette.cume, word: palette.nevoa },
  /** Uma cor (herda currentColor). */
  monocromatico: { symbol: 'currentColor', word: 'currentColor' },
};

export function LogoSymbol({
  size = 32,
  color = 'currentColor',
  title,
}: {
  size?: number;
  color?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={logoSymbol.viewBox}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <polyline
        points={logoSymbol.points}
        fill="none"
        stroke={color}
        strokeWidth={logoSymbol.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Logo Vetta: V que vira check + "vetta" em Archivo Expanded 800.
 * Variantes: principal, positivo (fundo escuro), monocromático e símbolo só.
 */
export function Logo({
  variant = 'auto',
  size = 32,
  className,
}: {
  variant?: LogoVariant;
  size?: number;
  className?: string;
}) {
  if (variant === 'simbolo') {
    return (
      <span className={cn('inline-flex', className)}>
        <LogoSymbol size={size} color={palette.tinta} title="Vetta" />
      </span>
    );
  }
  // auto: principal no modo claro, positivo no escuro (segue a classe .dark).
  const auto = variant === 'auto';
  const c = auto ? { symbol: 'currentColor', word: 'currentColor' } : COLORS[variant];
  return (
    <span className={cn('inline-flex items-center gap-2', className)} role="img" aria-label="Vetta">
      <span className={cn('inline-flex', auto && 'text-tinta dark:text-cume')}>
        <LogoSymbol size={size} color={c.symbol} />
      </span>
      <span
        aria-hidden
        className={cn('font-display leading-none', auto && 'text-tinta dark:text-nevoa')}
        style={{
          color: c.word,
          fontSize: size * 0.9,
          fontWeight: logoWordmark.fontWeight,
          fontStretch: logoWordmark.fontStretch,
          letterSpacing: logoWordmark.letterSpacing,
        }}
      >
        {logoWordmark.text}
      </span>
    </span>
  );
}
