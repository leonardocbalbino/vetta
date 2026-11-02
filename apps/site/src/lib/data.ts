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

/** URL da API vista pelo navegador (checkout da página de vendas). */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.vettafit.com.br';

export interface SalesPagePlan {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  cycle: BillingCycle;
  paymentMode: 'ONE_TIME' | 'INSTALLMENTS' | 'RECURRING';
  maxInstallments: number;
  methods: ('PIX' | 'BOLETO' | 'CREDIT_CARD')[];
  benefits: string[];
}

export interface SalesPage {
  slug: string;
  name: string;
  cref: string | null;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  specialties: string[];
  faq: { question: string; answer: string }[];
  socialLinks: Record<string, string>;
  seoTitle: string;
  seoDescription: string | null;
  checkoutEnabled: boolean;
  plans: SalesPagePlan[];
  testimonials: { id: string; authorName: string; text: string; rating: number | null }[];
  results: {
    id: string;
    caption: string | null;
    beforeUrl: string | null;
    afterUrl: string | null;
  }[];
}

/** Página de vendas do personal (ISR de 5 min: o personal edita e logo aparece). */
export async function getSalesPage(slug: string): Promise<SalesPage | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/v1/public/pages/${slug}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as SalesPage) : null;
  } catch {
    return null;
  }
}

/** Tema do personal (white label) para a página de vendas; null = tema Vetta. */
export async function getPublicBrand(
  slug: string,
): Promise<{ css: string; displayName: string } | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/v1/public/brand?slug=${slug}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const b = (await res.json()) as { css: string; displayName: string; whiteLabel: boolean };
    return b.whiteLabel ? { css: b.css, displayName: b.displayName } : null;
  } catch {
    return null;
  }
}
