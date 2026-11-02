'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { cn } from '../utils.js';

// ─── Badge e selos de plano ───────────────────────────────────────────────

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-foreground',
        accent: 'bg-accent text-accent-foreground',
        action: 'bg-action text-action-foreground',
        success: 'bg-success text-success-foreground',
        warning: 'bg-warning text-warning-foreground',
        danger: 'bg-danger text-danger-foreground',
        outline: 'border border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const PLAN_STYLE = {
  FREE: 'border border-grafite text-grafite dark:border-muted-foreground dark:text-muted-foreground',
  PRO: 'bg-cobalto text-white',
  PRO_PLUS: 'bg-tinta text-cume dark:ring-1 dark:ring-cume/40',
} as const;
const PLAN_LABEL = { FREE: 'Free', PRO: 'Pro', PRO_PLUS: 'Pro Plus' } as const;

/** Selo de plano: Free (contorno grafite), Pro (cobalto), Pro Plus (tinta com texto cume). */
export function PlanBadge({
  plan,
  className,
}: {
  plan: keyof typeof PLAN_STYLE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        PLAN_STYLE[plan],
        className,
      )}
    >
      {PLAN_LABEL[plan]}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface text-surface-foreground',
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-6', className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('font-display text-lg font-bold', className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-6 pb-6', className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 px-6 pb-6', className)} {...props} />;
}

// ─── Table ────────────────────────────────────────────────────────────────

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export const TableHeader = ({ className, ...p }: ComponentProps<'thead'>) => (
  <thead className={cn('[&_tr]:border-b', className)} {...p} />
);
export const TableBody = ({ className, ...p }: ComponentProps<'tbody'>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />
);
export const TableRow = ({ className, ...p }: ComponentProps<'tr'>) => (
  <tr
    className={cn('border-b border-border transition-colors hover:bg-muted/50', className)}
    {...p}
  />
);
export const TableHead = ({ className, ...p }: ComponentProps<'th'>) => (
  <th
    className={cn(
      'h-11 px-3 text-left align-middle font-semibold text-muted-foreground',
      className,
    )}
    {...p}
  />
);
export const TableCell = ({ className, ...p }: ComponentProps<'td'>) => (
  <td className={cn('p-3 align-middle', className)} {...p} />
);
export const TableCaption = ({ className, ...p }: ComponentProps<'caption'>) => (
  <caption className={cn('mt-4 text-sm text-muted-foreground', className)} {...p} />
);

// ─── Avatar, Skeleton, EmptyState, Toast ──────────────────────────────────

export function Avatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt={name}
          className="aspect-square size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-muted text-sm font-semibold"
        aria-label={name}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-control bg-muted', className)}
      aria-hidden
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border p-10 text-center',
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground [&_svg]:size-10">{icon}</div> : null}
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

/** Toasts (sonner) com a marca. Use `toast('...')` de `@vetta/ui`. */
export function Toaster(props: ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        classNames: {
          toast: 'rounded-card border border-border bg-surface text-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
