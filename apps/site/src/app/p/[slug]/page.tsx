import { CYCLE_LABEL, PAYMENT_MODE_LABEL } from '@vetta/contracts';
import { Logo } from '@vetta/ui';
import { Check, Star } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Checkout } from '@/components/sales-checkout';
import { brl, getPublicBrand, getSalesPage, SITE_URL } from '@/lib/data';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getSalesPage(slug);
  if (!p) return { title: 'Página não encontrada', robots: { index: false } };
  const description = p.seoDescription ?? `Treine com ${p.name}.`;
  return {
    title: { absolute: p.seoTitle },
    description,
    alternates: { canonical: `/p/${slug}` },
    openGraph: {
      type: 'profile',
      url: `${SITE_URL}/p/${slug}`,
      title: p.seoTitle,
      description,
      siteName: p.name,
    },
    twitter: { card: 'summary_large_image', title: p.seoTitle, description },
  };
}

const SOCIAL: Record<string, (v: string) => string> = {
  instagram: (v) =>
    `https://instagram.com/${v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}`,
  tiktok: (v) =>
    `https://tiktok.com/@${v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '')}`,
  youtube: (v) => (v.startsWith('http') ? v : `https://youtube.com/@${v.replace(/^@/, '')}`),
  site: (v) => v,
  whatsapp: (v) => `https://wa.me/${v.replace(/\D/g, '')}`,
};

/** Página de vendas pública do personal: bio, resultados autorizados, planos, depoimentos, FAQ e checkout. */
export default async function SalesPage({ params }: Props) {
  const { slug } = await params;
  const [p, brand] = await Promise.all([getSalesPage(slug), getPublicBrand(slug)]);
  if (!p) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    jobTitle: 'Personal trainer',
    ...(p.photoUrl ? { image: p.photoUrl } : {}),
    url: `${SITE_URL}/p/${slug}`,
    makesOffer: p.plans.map((pl) => ({
      '@type': 'Offer',
      name: pl.name,
      price: (pl.priceCents / 100).toFixed(2),
      priceCurrency: 'BRL',
    })),
  };
  return (
    <main id="conteudo" className="flex flex-col">
      {/* White label: cores do personal (já validadas para contraste AA na API). */}
      {brand?.css ? <style>{brand.css}</style> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <section className="bg-tinta text-nevoa">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-6 py-14 md:grid-cols-[auto_1fr]">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.photoUrl}
              alt={p.name}
              className="size-40 rounded-card object-cover md:size-56"
            />
          ) : null}
          <div className="flex flex-col gap-4">
            {p.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logoUrl} alt={`Logo de ${p.name}`} className="h-10 w-auto self-start" />
            ) : null}
            <h1 className="font-display text-4xl font-extrabold md:text-5xl">
              {p.headline ?? p.name}
            </h1>
            <p className="text-lg">
              {p.name}
              {p.cref ? <span className="text-nevoa/70"> · CREF {p.cref}</span> : null}
            </p>
            {p.specialties.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Especialidades">
                {p.specialties.map((s) => (
                  <li key={s} className="rounded-full border border-nevoa/30 px-3 py-1 text-sm">
                    {s}
                  </li>
                ))}
              </ul>
            ) : null}
            {p.plans.length ? (
              <a
                href="#planos"
                className="inline-flex min-h-11 items-center self-start rounded-control bg-cume px-5 font-semibold text-tinta"
              >
                Quero treinar
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {p.bio ? (
        <section className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="mb-4 font-display text-2xl font-extrabold">Sobre</h2>
          <p className="whitespace-pre-line text-lg leading-relaxed">{p.bio}</p>
        </section>
      ) : null}

      {p.results.length ? (
        <section className="bg-surface py-12">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="mb-6 font-display text-2xl font-extrabold">Resultados de alunos</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {p.results.map((r) => (
                <figure key={r.id} className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-1">
                    {[r.beforeUrl, r.afterUrl].map((u, i) =>
                      u ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={u}
                          alt={i === 0 ? 'Antes' : 'Depois'}
                          loading="lazy"
                          className="aspect-[3/4] w-full rounded-control object-cover"
                        />
                      ) : null,
                    )}
                  </div>
                  {r.caption ? (
                    <figcaption className="text-sm text-muted-foreground">{r.caption}</figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Fotos publicadas com autorização dos alunos. Resultados individuais variam.
            </p>
          </div>
        </section>
      ) : null}

      <section id="planos" className="mx-auto w-full max-w-5xl px-6 py-12">
        <h2 className="mb-6 font-display text-2xl font-extrabold">Planos</h2>
        {p.plans.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {p.plans.map((pl) => (
              <article
                key={pl.id}
                className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6"
              >
                <h3 className="font-display text-xl font-extrabold">{pl.name}</h3>
                {pl.description ? <p className="text-muted-foreground">{pl.description}</p> : null}
                <p className="flex flex-wrap items-baseline gap-1 font-display text-2xl font-extrabold">
                  {brl(pl.priceCents)}
                  <span className="text-base font-normal text-muted-foreground">
                    {' '}
                    / {CYCLE_LABEL[pl.cycle].toLowerCase()}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {PAYMENT_MODE_LABEL[pl.paymentMode]}
                  {pl.paymentMode === 'INSTALLMENTS'
                    ? ` em até ${pl.maxInstallments}x de ${brl(Math.ceil(pl.priceCents / pl.maxInstallments))}`
                    : ''}
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {pl.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 text-success" aria-hidden /> {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {p.checkoutEnabled ? (
                    <Checkout slug={slug} plan={pl} personalName={p.name} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Fale com {p.name} para contratar.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhum plano disponível no momento.</p>
        )}
      </section>

      {p.testimonials.length ? (
        <section className="bg-surface py-12">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="mb-6 font-display text-2xl font-extrabold">O que dizem os alunos</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {p.testimonials.map((t) => (
                <blockquote
                  key={t.id}
                  className="flex flex-col gap-2 rounded-card border border-border bg-background p-5"
                >
                  {t.rating ? (
                    <span className="flex" aria-label={`${t.rating} de 5 estrelas`}>
                      {Array.from({ length: t.rating }, (_, i) => (
                        <Star key={i} className="size-4 fill-warning text-warning" aria-hidden />
                      ))}
                    </span>
                  ) : null}
                  <p>“{t.text}”</p>
                  <footer className="text-sm text-muted-foreground">{t.authorName}</footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {p.faq.length ? (
        <section className="mx-auto w-full max-w-3xl px-6 py-12">
          <h2 className="mb-6 font-display text-2xl font-extrabold">Perguntas frequentes</h2>
          <div className="flex flex-col gap-2">
            {p.faq.map((f) => (
              <details key={f.question} className="rounded-control border border-border p-4">
                <summary className="min-h-11 cursor-pointer font-semibold">{f.question}</summary>
                <p className="mt-2 whitespace-pre-line">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-6 text-sm">
          {Object.entries(p.socialLinks).map(([k, v]) =>
            SOCIAL[k] && v ? (
              <a
                key={k}
                href={SOCIAL[k](v)}
                target="_blank"
                rel="noreferrer"
                className="min-h-11 capitalize hover:underline"
              >
                {k}
              </a>
            ) : null,
          )}
          <a href={SITE_URL} className="ml-auto flex items-center gap-2 text-muted-foreground">
            feito com <Logo size={16} />
          </a>
        </div>
      </footer>
    </main>
  );
}
