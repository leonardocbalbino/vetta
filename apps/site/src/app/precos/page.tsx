import type { Metadata } from 'next';
import { Footer, Header } from '@/components/chrome';
import { Pricing } from '@/components/pricing';
import { getPlans } from '@/lib/data';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Preços',
  description:
    'Planos Free, Pro e Pro Plus para personal trainers. Teste 14 dias grátis, sem cartão.',
  alternates: { canonical: '/precos' },
};

export default async function Precos() {
  const plans = await getPlans();
  return (
    <>
      <Header />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h1 className="font-display mb-2 text-center text-[2rem] font-extrabold">
          Preços simples, sem surpresa
        </h1>
        <p className="mb-10 text-center text-muted-foreground">
          Comece grátis e mude de plano quando quiser.
        </p>
        <Pricing plans={plans} />
      </main>
      <Footer />
    </>
  );
}
