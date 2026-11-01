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
  chat: (conversationId: string) => `/chat/${conversationId}`,
  invoice: (id: string) => `/financeiro/cobrancas/${id}`,
  appointment: (id: string) => `/agenda/${id}`,
  subscription: () => '/assinatura',
  security: () => '/conta/seguranca',
  storage: () => '/conta/armazenamento',
  verifyEmail: (token: string) => `/verificar-email?token=${encodeURIComponent(token)}`,
  resetPassword: (token: string) => `/redefinir-senha?token=${encodeURIComponent(token)}`,
  magicLink: (token: string) => `/entrar/link?token=${encodeURIComponent(token)}`,
  invite: (token: string) => `/convite/${encodeURIComponent(token)}`,
} as const;

export function toAppUrl(path: string): string {
  return `${APP_SCHEME}://${path.replace(/^\//, '')}`;
}
