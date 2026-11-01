import { PLAN_SEED, type BillingCycle, type PlanCode } from '@vetta/contracts';

export const SITE_URL = 'https://vettafit.com.br';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.vettafit.com.br';
const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'https://api.vettafit.com.br';
/** Revalida preços e documentos a cada hora (ISR): o admin altera sem novo deploy. */
export const REVALIDATE = 3600;

export interface PublicPlan {
  code: PlanCode;
  name: string;
  description: string | null;
  prices: Partial<Record<BillingCycle, number>>;
  features: Record<string, number | boolean>;
}

/** Planos públicos da API. Sem API no build (CI), usa o seed só como fallback. */
export async function getPlans(): Promise<PublicPlan[]> {
  try {
    const res = await fetch(`${API_URL}/v1/plans`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) throw new Error(String(res.status));
    const plans = (await res.json()) as {
      code: PlanCode;
      name: string;
      description: string | null;
      prices: { cycle: BillingCycle; amountCents: number }[];
      features: Record<string, number | boolean>;
    }[];
    return plans.map((p) => ({
      ...p,
      prices: Object.fromEntries(p.prices.map((x) => [x.cycle, x.amountCents])),
    }));
  } catch {
    return PLAN_SEED.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      prices: p.prices,
      features: p.features,
    }));
  }
}

export interface LegalDoc {
  title: string;
  version: string;
  content: string;
  publishedAt: string;
}

export async function getLegal(kind: 'terms' | 'privacy'): Promise<LegalDoc | null> {
  try {
    const res = await fetch(`${API_URL}/v1/legal/${kind}`, { next: { revalidate: REVALIDATE } });
    return res.ok ? ((await res.json()) as LegalDoc) : null;
  } catch {
    return null;
  }
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
