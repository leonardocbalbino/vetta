/** Índice da central de ajuda (cada artigo é uma página MDX em src/app/ajuda/<slug>/page.mdx). */
export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  summary: string;
  keywords: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'primeiros-passos',
    title: 'Primeiros passos na Vetta',
    category: 'Começar',
    summary: 'Crie sua conta, configure seu perfil e convide o primeiro aluno.',
    keywords: ['cadastro', 'conta', 'início', 'começar'],
  },
  {
    slug: 'convidar-alunos',
    title: 'Como convidar alunos',
    category: 'Alunos',
    summary: 'Convites por e-mail, link ou WhatsApp, e o que o aluno precisa fazer.',
    keywords: ['convite', 'aluno', 'link', 'whatsapp', 'importar'],
  },
  {
    slug: 'montar-treinos',
    title: 'Montar e publicar treinos',
    category: 'Treinos',
    summary: 'Programas, rotinas, métodos como bi-set e drop-set, e publicação para o aluno.',
    keywords: ['treino', 'rotina', 'exercício', 'bi-set', 'publicar'],
  },
  {
    slug: 'ia-de-treino',
    title: 'Gerar treinos com IA',
    category: 'Treinos',
    summary: 'Como a IA monta um rascunho com a sua biblioteca e por que você sempre revisa antes.',
    keywords: ['ia', 'inteligência artificial', 'gerar', 'rascunho', 'pro plus'],
  },
  {
    slug: 'equipe-assistentes',
    title: 'Equipe e assistentes',
    category: 'Equipe',
    summary: 'Convide assistentes, defina permissões e atribua alunos.',
    keywords: ['equipe', 'assistente', 'permissão', 'atribuir'],
  },
  {
    slug: 'marca-e-dominio',
    title: 'Sua marca e domínio próprio',
    category: 'Marca',
    summary: 'Logo, cores com contraste acessível, remetente dos e-mails e domínio próprio.',
    keywords: ['white label', 'marca', 'logo', 'cores', 'domínio', 'cname'],
  },
  {
    slug: 'google-calendar',
    title: 'Conectar o Google Calendar',
    category: 'Agenda',
    summary: 'Sincronização nos dois sentidos entre a agenda Vetta e o Google.',
    keywords: ['agenda', 'google', 'calendar', 'sincronizar'],
  },
  {
    slug: 'whatsapp',
    title: 'Avisos pelo WhatsApp',
    category: 'Comunicação',
    summary: 'Cobranças, lembretes de treino e de aula pelo WhatsApp oficial.',
    keywords: ['whatsapp', 'aviso', 'lembrete', 'cobrança'],
  },
  {
    slug: 'cobrar-alunos',
    title: 'Cobrar seus alunos',
    category: 'Financeiro',
    summary: 'Planos de consultoria, Pix, boleto e cartão, e bloqueio de inadimplentes.',
    keywords: ['cobrança', 'pix', 'boleto', 'cartão', 'financeiro', 'inadimplente'],
  },
  {
    slug: 'abrir-chamado',
    title: 'Falar com o suporte',
    category: 'Suporte',
    summary: 'Como abrir um chamado e os prazos de resposta de cada plano.',
    keywords: ['suporte', 'chamado', 'ajuda', 'prazo', 'sla'],
  },
];
