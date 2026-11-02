/** Índice do blog (cada post é uma página MDX em src/app/blog/<slug>/page.mdx). */
export const POSTS = [
  {
    slug: 'dupla-progressao-de-carga',
    title: 'Dupla progressão: um jeito simples de evoluir carga com segurança',
    description: 'Como usar faixas de repetições para decidir quando subir a carga do seu aluno.',
    date: '2026-11-01',
  },
  {
    slug: 'como-usar-a-escala-de-esforco-percebido',
    title: 'Como usar a escala de esforço percebido no feedback do treino',
    description: 'O que a nota de 1 a 10 do aluno diz sobre o treino e como ajustar a prescrição.',
    date: '2026-11-01',
  },
] as const;
