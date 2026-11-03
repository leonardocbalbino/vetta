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

const LOADER_CSS = `
@keyframes vetta-draw {
  0% { stroke-dashoffset: 1; opacity: 1; }
  55% { stroke-dashoffset: 0; opacity: 1; }
  80% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes vetta-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.vetta-loader-check {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: vetta-draw 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .vetta-loader-check { stroke-dashoffset: 0; animation: vetta-pulse 1.6s ease-in-out infinite; }
}`;

/**
 * Loading da marca: o V se desenha como um check e some, em loop.
 * Com "reduzir movimento", só pulsa. Use `fullscreen` para telas inteiras.
 */
export function LogoLoader({
  size = 56,
  label = 'Carregando',
  showWordmark = false,
  fullscreen = false,
  className,
}: {
  size?: number;
  label?: string;
  showWordmark?: boolean;
  fullscreen?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        fullscreen && 'min-h-dvh w-full',
        className,
      )}
    >
      <style>{LOADER_CSS}</style>
      <svg
        width={size}
        height={size}
        viewBox={logoSymbol.viewBox}
        aria-hidden
        className="text-tinta dark:text-cume"
      >
        {/* Trilho discreto + traço que se desenha (pathLength normaliza o comprimento). */}
        <polyline
          points={logoSymbol.points}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={logoSymbol.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          className="vetta-loader-check"
          pathLength={1}
          points={logoSymbol.points}
          fill="none"
          stroke="currentColor"
          strokeWidth={logoSymbol.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark ? (
        <span
          aria-hidden
          className="font-display leading-none text-tinta dark:text-nevoa"
          style={{
            fontSize: size * 0.45,
            fontWeight: logoWordmark.fontWeight,
            fontStretch: logoWordmark.fontStretch,
            letterSpacing: logoWordmark.letterSpacing,
          }}
        >
          {logoWordmark.text}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}
