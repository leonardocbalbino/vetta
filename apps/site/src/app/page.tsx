import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from '@vetta/ui';
import { BarChart3, ClipboardCheck, Dumbbell, Smartphone, Wallet, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { Footer, Header } from '@/components/chrome';
import { Pricing } from '@/components/pricing';
import { TESTIMONIALS } from '@/content/testimonials';
import { APP_URL, SITE_URL, getPlans } from '@/lib/data';

export const revalidate = 3600;

const SOLUTIONS = [
  {
    icon: Dumbbell,
    title: 'Prescrição completa',
    text: 'Programas com rotinas A/B/C, bi-set, tri-set, drop-set, AMRAP e EMOM. Arraste da biblioteca com mais de 60 exercícios, clone e aplique a grupos.',
  },
  {
    icon: ClipboardCheck,
    title: 'Avaliações e anamnese',
    text: 'PAR-Q pronto, Pollock 3 e 7 dobras, Guedes, Petroski, Faulkner e outros protocolos. Comparativo e PDF para o aluno.',
  },
  {
    icon: Smartphone,
    title: 'App do aluno',
    text: 'Player com vídeo, cronômetro de descanso, carga por série e feedback ao final. Recordes pessoais celebrados na hora.',
  },
  {
    icon: WifiOff,
    title: 'Treina até sem internet',
    text: 'O treino fica salvo no celular. Na academia sem sinal, o aluno treina e tudo sincroniza depois.',
  },
  {
    icon: BarChart3,
    title: 'Evolução visível',
    text: 'Gráficos de peso, gordura, cargas e volume, fotos de antes e depois e alerta de aluno sumido.',
  },
  {
    icon: Wallet,
    title: 'Cobrança e marca própria',
    text: 'Pix, boleto e cartão com lembretes, página de vendas e white label nos planos Pro e Pro Plus.',
  },
];

const FAQ = [
  {
    q: 'Preciso de cartão para testar?',
    a: 'Não. Você usa o Pro Plus completo por 14 dias sem cartão. Depois escolhe um plano ou segue no Free.',
  },
  {
    q: 'O que acontece com meus dados se eu mudar de plano?',
    a: 'Nada é apagado. O que sair do plano fica disponível só para leitura, e alunos acima do limite são arquivados, não excluídos.',
  },
  {
    q: 'Meus alunos pagam para usar o app?',
    a: 'Não. O app do aluno é gratuito; quem assina a Vetta é você.',
  },
  {
    q: 'Funciona sem internet na academia?',
    a: 'Sim. O treino do dia fica salvo no celular do aluno, que registra cargas e feedback offline. Ao voltar a conexão, tudo sincroniza.',
  },
  {
    q: 'Como a Vetta trata os dados de saúde dos alunos?',
    a: 'Dados de saúde são sensíveis pela LGPD. Pedimos consentimento específico, removemos localização das fotos e o aluno pode exportar ou excluir os dados.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim, sem multa. Você continua com acesso até o fim do período pago.',
  },
];

/** Prévia do player como ilustração (HTML, não captura de tela de dados reais). */
function PlayerMock() {
  return (
    <div
      aria-hidden
      className="mx-auto w-72 rounded-[2rem] border-8 border-tinta bg-nevoa p-4 text-tinta shadow-xl"
    >
      <p className="text-xs font-semibold text-grafite">Treino A · Peito e tríceps</p>
      <p className="font-display mt-2 text-xl font-extrabold">Supino reto</p>
      <p className="text-sm text-grafite">Série 2 de 4 · meta 8–10 reps</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-control border border-linha bg-white p-2">
          <span className="block text-xs text-grafite">Carga</span>
          <span className="font-display text-lg font-extrabold">40 kg</span>
        </div>
        <div className="rounded-control border border-linha bg-white p-2">
          <span className="block text-xs text-grafite">Reps</span>
          <span className="font-display text-lg font-extrabold">10</span>
        </div>
      </div>
      <div className="mt-3 rounded-control bg-tinta p-3 text-center text-nevoa">
        <span className="font-display text-2xl font-extrabold">01:15</span>
        <span className="block text-xs">descanso</span>
      </div>
      <div className="mt-3 rounded-control bg-cume p-3 text-center font-semibold text-tinta">
        Concluir série
      </div>
    </div>
  );
}

export default async function Home() {
  const plans = await getPlans();
  const testimonials = TESTIMONIALS.filter(
    (t) => !t.placeholder || process.env.NEXT_PUBLIC_SHOW_PLACEHOLDERS === 'true',
  );
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Vetta',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web, Android, iOS',
    url: SITE_URL,
    description:
      'Gestão de treinos para personal trainers: prescrição, avaliações, evolução, cobrança e app do aluno.',
    offers: plans.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      price: ((p.prices.MONTHLY ?? 0) / 100).toFixed(2),
      priceCurrency: 'BRL',
    })),
  };
  return (
    <>
      <Header dark />
      <main id="conteudo">
        <section className="bg-tinta text-nevoa">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div className="flex flex-col gap-6">
              <h1 className="font-display text-[2rem] font-extrabold leading-tight md:text-[3rem]">
                Prescreva, acompanhe e receba. Tudo no mesmo app.
              </h1>
              <p className="text-lg text-nevoa/80">
                A Vetta organiza seus alunos, treinos, avaliações e cobranças para você focar no que
                faz de melhor: fazer seu aluno evoluir.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button asChild variant="accent" size="lg">
                  <a href={`${APP_URL}/cadastro`}>Comece grátis</a>
                </Button>
                <span className="text-sm text-nevoa/70">14 dias do Pro Plus, sem cartão.</span>
              </div>
            </div>
            <PlayerMock />
          </div>
        </section>

        <section
          id="solucoes"
          className="mx-auto max-w-6xl px-6 py-20"
          aria-labelledby="solucoes-titulo"
        >
          <h2
            id="solucoes-titulo"
            className="font-display mb-2 text-2xl font-extrabold md:text-[2rem]"
          >
            Tudo o que sua consultoria precisa
          </h2>
          <p className="mb-8 text-muted-foreground">
            Do primeiro contato ao recorde pessoal do aluno.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUTIONS.map((s) => (
              <Card key={s.title}>
                <CardHeader>
                  <s.icon className="size-6 text-action" aria-hidden />
                  <CardTitle>{s.title}</CardTitle>
                  <CardDescription>{s.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="bg-surface py-20" aria-labelledby="demo-titulo">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 id="demo-titulo" className="font-display text-2xl font-extrabold md:text-[2rem]">
                Veja como funciona
              </h2>
              <ol className="flex flex-col gap-4">
                {[
                  [
                    'Convide',
                    'Mande o convite por e-mail, link ou WhatsApp. O aluno responde a anamnese no app.',
                  ],
                  [
                    'Prescreva',
                    'Monte o treino arrastando exercícios, com séries, cargas, descanso e métodos.',
                  ],
                  [
                    'Acompanhe',
                    'O aluno treina pelo app e você recebe o feedback, as cargas e os recordes.',
                  ],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-full bg-cume text-lg font-extrabold text-tinta">
                      {i + 1}
                    </span>
                    <span>
                      <strong className="block">{t}</strong>
                      <span className="text-muted-foreground">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <Button asChild variant="action" className="self-start">
                <a href={`${APP_URL}/cadastro`}>Criar minha conta</a>
              </Button>
            </div>
            <PlayerMock />
          </div>
        </section>

        {testimonials.length ? (
          <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="depoimentos-titulo">
            <h2
              id="depoimentos-titulo"
              className="font-display mb-8 text-2xl font-extrabold md:text-[2rem]"
            >
              Quem usa, recomenda
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {testimonials.map((t) => (
                <Card key={t.name}>
                  <CardHeader>
                    {t.placeholder ? (
                      <Badge variant="warning" className="self-start">
                        Exemplo ilustrativo
                      </Badge>
                    ) : null}
                    <CardDescription className="text-base text-foreground">
                      “{t.quote}”
                    </CardDescription>
                    <p className="text-sm font-semibold">
                      {t.name} <span className="font-normal text-muted-foreground">· {t.role}</span>
                    </p>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="precos-titulo">
          <h2
            id="precos-titulo"
            className="font-display mb-8 text-center text-2xl font-extrabold md:text-[2rem]"
          >
            Planos que crescem com você
          </h2>
          <Pricing plans={plans} />
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-6 py-20" aria-labelledby="faq-titulo">
          <h2 id="faq-titulo" className="font-display mb-6 text-2xl font-extrabold md:text-[2rem]">
            Perguntas frequentes
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-card border border-border">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                  {f.q}
                </summary>
                <p className="pt-2 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Ainda com dúvida? Leia nossos{' '}
            <Link href="/termos" className="text-action underline">
              termos
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="text-action underline">
              política de privacidade
            </Link>
            .
          </p>
        </section>

        <section className="bg-tinta text-nevoa">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center">
            <h2 className="font-display text-2xl font-extrabold md:text-[2rem]">
              Seu método. Seu aluno. Sua evolução.
            </h2>
            <Button asChild variant="accent" size="lg">
              <a href={`${APP_URL}/cadastro`}>Comece grátis</a>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
