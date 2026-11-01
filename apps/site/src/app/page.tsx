import { PLAN_SEED, UNLIMITED } from '@vetta/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Logo,
  PlanBadge,
} from '@vetta/ui';

export const dynamic = 'force-static';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.vettafit.com.br';
const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const HIGHLIGHTS = [
  {
    title: 'Prescreva do seu jeito',
    text: 'Programas, rotinas A/B/C, bi-set, drop-set, AMRAP, periodização e modelos.',
  },
  {
    title: 'Acompanhe de perto',
    text: 'Avaliações físicas e posturais, gráficos de evolução e fotos de antes e depois.',
  },
  {
    title: 'Receba sem dor de cabeça',
    text: 'Cobrança por Pix, boleto e cartão, com lembretes automáticos.',
  },
  {
    title: 'Seu aluno no app',
    text: 'Player de treino com cronômetro, registro de carga e feedback ao final.',
  },
];

/** Landing SSG. Os preços vêm do seed dos planos; a fonte da verdade é a API (configurável pelo admin). */
export default function Landing() {
  return (
    <main>
      <section className="bg-tinta text-nevoa">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
          <nav className="flex items-center justify-between">
            <Logo variant="positivo" />
            <Button asChild variant="accent" size="sm">
              <a href={`${APP_URL}/entrar`}>Entrar</a>
            </Button>
          </nav>
          <div className="flex max-w-3xl flex-col gap-6 py-16">
            <h1 className="font-display text-3xl font-extrabold leading-tight md:text-[3rem]">
              Seu método. Seu aluno. Sua evolução.
            </h1>
            <p className="text-lg text-nevoa/80">
              A plataforma para personal trainers que querem prescrever melhor, acompanhar de perto
              e crescer com a própria marca.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="accent" size="lg">
                <a href={`${APP_URL}/cadastro`}>Teste 14 dias grátis</a>
              </Button>
              <span className="self-center text-sm text-nevoa/70">
                Sem cartão de crédito. Plano Pro Plus completo.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-16 md:grid-cols-2">
        {HIGHLIGHTS.map((h) => (
          <Card key={h.title}>
            <CardHeader>
              <CardTitle>{h.title}</CardTitle>
              <CardDescription>{h.text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20" aria-labelledby="planos">
        <h2 id="planos" className="font-display mb-8 text-2xl font-extrabold">
          Planos
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_SEED.map((p) => {
            const students = p.features['students.max'];
            return (
              <Card key={p.code} className={p.code === 'PRO_PLUS' ? 'border-tinta' : undefined}>
                <CardHeader>
                  <PlanBadge plan={p.code} className="self-start" />
                  <CardTitle className="text-2xl">
                    {p.prices.MONTHLY ? `${brl(p.prices.MONTHLY)}/mês` : 'Grátis'}
                  </CardTitle>
                  <CardDescription>{p.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  {students === UNLIMITED ? 'Alunos ilimitados' : `Até ${students} alunos`}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Vetta · vettafit.com.br
      </footer>
    </main>
  );
}
