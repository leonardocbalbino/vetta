/**
 * Deep links: o mesmo caminho funciona na web (app.vettafit.com.br/...) e no
 * app (vetta://...). Toda notificação push carrega um deep link.
 */
export const APP_SCHEME = 'vetta';

export const deepLinks = {
  home: () => '/',
  notifications: () => '/notificacoes',
  media: (id: string) => `/midia/${id}`,
  student: (studentLinkId: string) => `/alunos/${studentLinkId}`,
  workout: (id: string) => `/treinos/${id}`,
  todayWorkout: () => '/treino',
  feedback: (sessionId: string) => `/feedbacks/${sessionId}`,
  anamnesis: (responseId: string) => `/anamnese/${responseId}`,
  studentTab: (studentLinkId: string, tab: string) => `/alunos/${studentLinkId}?aba=${tab}`,
  records: () => '/evolucao',
  adminTenant: (tenantId: string) => `/personais/${tenantId}`,
  chat: (conversationId: string) => `/chat/${conversationId}`,
  invoice: (id: string) => `/financeiro/cobrancas/${id}`,
  appointment: (id: string) => `/agenda/${id}`,
  subscription: () => '/assinatura',
  studentPayments: () => '/pagamentos',
  finance: () => '/financeiro',
  wallet: () => '/financeiro/carteira',
  schedule: () => '/agenda',
  broadcast: (id: string) => `/comunicados/${id}`,
  documents: () => '/documentos',
  salesPage: () => '/minha-pagina',
  periodization: (id: string) => `/periodizacao/${id}`,
  security: () => '/conta/seguranca',
  storage: () => '/conta/armazenamento',
  verifyEmail: (token: string) => `/verificar-email?token=${encodeURIComponent(token)}`,
  resetPassword: (token: string) => `/redefinir-senha?token=${encodeURIComponent(token)}`,
  magicLink: (token: string) => `/entrar/link?token=${encodeURIComponent(token)}`,
  invite: (token: string) => `/convite/${encodeURIComponent(token)}`,
  teamInvite: (token: string) => `/equipe/convite/${encodeURIComponent(token)}`,
  team: () => '/equipe',
  brand: () => '/marca',
  supportTicket: (id: string) => `/suporte/${id}`,
  adminTicket: (id: string) => `/suporte/${id}`,
  academy: (slug?: string) => (slug ? `/academy/${slug}` : '/academy'),
} as const;

export function toAppUrl(path: string): string {
  return `${APP_SCHEME}://${path.replace(/^\//, '')}`;
}
