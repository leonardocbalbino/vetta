/**
 * Depoimentos da home. Os marcados como placeholder são ilustrativos e NÃO aparecem
 * em produção (só com NEXT_PUBLIC_SHOW_PLACEHOLDERS=true). Substituir por depoimentos
 * reais, com autorização por escrito, antes do lançamento.
 */
export const TESTIMONIALS: { name: string; role: string; quote: string; placeholder: boolean }[] = [
  {
    name: 'Personal exemplo 1',
    role: 'consultoria online',
    quote: 'Montar treino ficou muito mais rápido e meus alunos finalmente registram as cargas.',
    placeholder: true,
  },
  {
    name: 'Personal exemplo 2',
    role: 'atendimento presencial',
    quote: 'O alerta de aluno sumido me ajudou a recuperar quem estava parando de treinar.',
    placeholder: true,
  },
  {
    name: 'Personal exemplo 3',
    role: 'estúdio',
    quote: 'As avaliações com comparativo em PDF deixaram meu trabalho com cara profissional.',
    placeholder: true,
  },
];
