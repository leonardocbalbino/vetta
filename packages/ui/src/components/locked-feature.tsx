import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils.js';
import { Button } from './button.js';
import { PlanBadge } from './display.js';

export interface LockedFeatureProps {
  /** true = mostra o cadeado no lugar do conteúdo. */
  locked: boolean;
  /** Plano ainda carregando: não monta o conteúdo (evita chamadas que dariam 402). */
  loading?: boolean;
  title: string;
  description?: string;
  /** Plano mínimo que libera (vem de details.requiredPlan ou do catálogo). */
  requiredPlan?: 'PRO' | 'PRO_PLUS' | null;
  upgradeHref?: string;
  onUpgrade?: () => void;
  /** inline = só um selo com cadeado (ex.: item de menu). */
  mode?: 'card' | 'inline';
  children?: ReactNode;
  className?: string;
}

/** Cadeado + CTA de upgrade para recursos fora do plano (use com useFeature). */
export function LockedFeature({
  locked,
  loading,
  title,
  description,
  requiredPlan,
  upgradeHref = '/assinatura',
  onUpgrade,
  mode = 'card',
  children,
  className,
}: LockedFeatureProps) {
  if (loading)
    return (
      <div
        aria-busy="true"
        className={cn('min-h-24 animate-pulse rounded-card bg-muted', className)}
      />
    );
  if (!locked) return <>{children}</>;
  if (mode === 'inline') {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}
        title={`${title} — faça upgrade`}
      >
        <Lock className="size-4" aria-hidden />
        <span className="sr-only">Bloqueado: </span>
        {title}
        {requiredPlan ? <PlanBadge plan={requiredPlan} /> : null}
      </span>
    );
  }
  const cta = 'Fazer upgrade';
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-card border border-border bg-muted/40 p-6',
        className,
      )}
      role="region"
      aria-label={`${title} bloqueado`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Lock className="size-4" aria-hidden />
        </span>
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {requiredPlan ? <PlanBadge plan={requiredPlan} /> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {description ?? 'Este recurso não faz parte do seu plano atual. Faça upgrade para liberar.'}
      </p>
      {onUpgrade ? (
        <Button variant="action" onClick={onUpgrade}>
          {cta}
        </Button>
      ) : (
        <Button variant="action" asChild>
          <a href={upgradeHref}>{cta}</a>
        </Button>
      )}
    </div>
  );
}
