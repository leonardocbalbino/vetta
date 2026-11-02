import type { Metadata } from 'next';
import { HelpSearch } from '@/components/help-search';
import { HELP_ARTICLES } from '@/content/help';

export const metadata: Metadata = {
  title: 'Central de ajuda',
  description:
    'Guias rápidos para usar a Vetta: alunos, treinos, IA, equipe, marca, agenda e cobranças.',
  alternates: { canonical: '/ajuda' },
};

export default function HelpCenter() {
  return (
    <>
      <h1 className="font-display text-[2rem] font-extrabold">Central de ajuda</h1>
      <p className="text-muted-foreground">
        Encontre o passo a passo. Não achou? Abra um chamado pelo botão de ajuda dentro do app.
      </p>
      <HelpSearch articles={HELP_ARTICLES} />
    </>
  );
}
