import type { ProRoute } from './permissions-pro-routes';

/**
 * Rotas da Fase 3 (Pro Plus) na matriz de permissões (permissions.e2e.test.ts).
 * O tenant da matriz é Pro Plus; o assistente tem as três permissões padrão.
 */
type Actor = ProRoute['allowed'][number];
const A = (...a: Actor[]) => a;
const fake = '0190f1e2-0000-7000-8000-000000000000';
const P = A('PERSONAL');
const STAFF = A('PERSONAL', 'ASSISTENTE');
const USERS = A('PERSONAL', 'ASSISTENTE', 'ALUNO');
const ALUNO = A('ALUNO');
const ADMIN = A('ADMIN');
const uid = () => Math.random().toString(36).slice(2, 8);

export function proPlusRoutes(ids: () => { studentLinkId: string }): ProRoute[] {
  const lesson = `/v1/academy/lessons/${fake}/progress`;
  return [
    // 3.1 IA (sem chave no teste: 503 para quem pode)
    {
      method: 'post',
      path: '/v1/ai/programs',
      body: () => ({
        objective: 'Hipertrofia',
        level: 'BEGINNER',
        daysPerWeek: 3,
        minutesPerSession: 60,
      }),
      tenant: true,
      allowed: STAFF,
    },
    {
      method: 'post',
      path: '/v1/ai/load-suggestions',
      body: () => ({ studentLinkId: ids().studentLinkId }),
      tenant: true,
      allowed: STAFF,
    },
    {
      method: 'post',
      path: '/v1/ai/weekly-summary',
      body: () => ({ studentLinkId: ids().studentLinkId }),
      tenant: true,
      allowed: STAFF,
    },
    { method: 'get', path: '/v1/ai/usage', tenant: true, allowed: STAFF },
    { method: 'get', path: '/v1/admin/ai/usage', tenant: false, allowed: ADMIN },
    // 3.2 equipe
    { method: 'get', path: '/v1/team', tenant: true, allowed: P },
    {
      method: 'post',
      path: '/v1/team/invites',
      body: () => ({ name: 'Nova assistente', email: `nova-${uid()}@test.dev` }),
      tenant: true,
      allowed: P,
    },
    {
      method: 'patch',
      path: '/v1/team/members/{id}',
      url: () => `/v1/team/members/${fake}`,
      body: () => ({ permissions: ['chat'] }),
      tenant: true,
      allowed: P,
    },
    {
      method: 'delete',
      path: '/v1/team/members/{id}',
      url: () => `/v1/team/members/${fake}`,
      tenant: true,
      allowed: P,
    },
    {
      method: 'post',
      path: '/v1/team/assignments',
      body: () => ({ studentLinkIds: [fake], memberId: null }),
      tenant: true,
      allowed: P,
    },
    { method: 'get', path: '/v1/team/activity', tenant: true, allowed: P },
    // 3.3 white label e domínio
    { method: 'get', path: '/v1/brand/settings', tenant: true, allowed: P },
    {
      method: 'put',
      path: '/v1/brand/settings',
      body: () => ({ displayName: 'Studio Teste' }),
      tenant: true,
      allowed: P,
    },
    {
      method: 'post',
      path: '/v1/brand/check-colors',
      body: () => ({ primaryColor: '#2F5BFF' }),
      tenant: true,
      allowed: P,
    },
    { method: 'get', path: '/v1/brand/active', tenant: true, allowed: USERS },
    {
      method: 'put',
      path: '/v1/brand/domain',
      body: () => ({ domain: `app.${uid()}-teste.com.br` }),
      tenant: true,
      allowed: P,
    },
    { method: 'post', path: '/v1/brand/domain/verify', tenant: true, allowed: P },
    { method: 'delete', path: '/v1/brand/domain', tenant: true, allowed: P },
    // 3.4 e 3.5 integrações
    { method: 'get', path: '/v1/integrations/google', tenant: true, allowed: STAFF },
    { method: 'post', path: '/v1/integrations/google/connect', tenant: true, allowed: STAFF },
    { method: 'post', path: '/v1/integrations/google/sync', tenant: true, allowed: STAFF },
    { method: 'delete', path: '/v1/integrations/google', tenant: true, allowed: STAFF },
    { method: 'get', path: '/v1/integrations/whatsapp', tenant: false, allowed: USERS },
    {
      method: 'put',
      path: '/v1/integrations/whatsapp',
      body: () => ({ granted: false }),
      tenant: false,
      allowed: USERS,
    },
    {
      method: 'post',
      path: '/v1/integrations/health/samples',
      body: () => ({
        samples: [
          {
            source: 'HEALTHKIT',
            type: 'STEPS',
            externalId: `s-${uid()}`,
            startAt: '2026-11-01T03:00:00.000Z',
            endAt: '2026-11-02T02:59:59.000Z',
            value: 8000,
            unit: 'count',
          },
        ],
      }),
      tenant: true,
      allowed: ALUNO,
    },
    { method: 'get', path: '/v1/integrations/health/samples', tenant: true, allowed: ALUNO },
    {
      method: 'get',
      path: '/v1/integrations/health/students/{studentLinkId}',
      url: () => `/v1/integrations/health/students/${ids().studentLinkId}`,
      tenant: true,
      allowed: STAFF,
    },
    { method: 'get', path: '/v1/integrations/health/workouts', tenant: true, allowed: ALUNO },
    {
      method: 'get',
      path: '/v1/exports/{kind}',
      url: () => '/v1/exports/students',
      tenant: true,
      allowed: STAFF,
    },
    // 3.6 relatórios
    { method: 'get', path: '/v1/reports/overview', tenant: true, allowed: P },
    // 3.7 Academy e comunicados da plataforma
    { method: 'get', path: '/v1/academy', tenant: true, allowed: STAFF },
    {
      method: 'get',
      path: '/v1/academy/{slug}',
      url: () => '/v1/academy/nao-existe',
      tenant: true,
      allowed: STAFF,
    },
    {
      method: 'put',
      path: '/v1/academy/lessons/{lessonId}/progress',
      url: () => lesson,
      body: () => ({ completed: true }),
      tenant: true,
      allowed: STAFF,
    },
    { method: 'get', path: '/v1/admin/academy', tenant: false, allowed: ADMIN },
    {
      method: 'post',
      path: '/v1/admin/academy',
      body: () => ({ type: 'POST', slug: `post-${uid()}`, title: 'Post de teste' }),
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'put',
      path: '/v1/admin/academy/{id}',
      url: () => `/v1/admin/academy/${fake}`,
      body: () => ({ type: 'POST', slug: `post-${uid()}`, title: 'Post de teste' }),
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'delete',
      path: '/v1/admin/academy/{id}',
      url: () => `/v1/admin/academy/${fake}`,
      tenant: false,
      allowed: ADMIN,
    },
    { method: 'get', path: '/v1/admin/broadcasts', tenant: false, allowed: ADMIN },
    {
      method: 'post',
      path: '/v1/admin/broadcasts/preview',
      body: () => ({ plans: ['PRO_PLUS'] }),
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'post',
      path: '/v1/admin/broadcasts',
      body: () => ({ title: 'Novidade', body: 'Texto do comunicado' }),
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'post',
      path: '/v1/admin/broadcasts/{id}/send',
      url: () => `/v1/admin/broadcasts/${fake}/send`,
      body: () => ({}),
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'post',
      path: '/v1/admin/broadcasts/{id}/cancel',
      url: () => `/v1/admin/broadcasts/${fake}/cancel`,
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'post',
      path: '/v1/platform-broadcasts/{id}/opened',
      url: () => `/v1/platform-broadcasts/${fake}/opened`,
      tenant: false,
      allowed: USERS,
    },
    // badge de mensagens não lidas
    { method: 'get', path: '/v1/chat/unread', tenant: true, allowed: USERS },
    // 3.8 suporte
    { method: 'get', path: '/v1/support/tickets', tenant: true, allowed: STAFF },
    {
      method: 'post',
      path: '/v1/support/tickets',
      body: () => ({
        subject: 'Dúvida teste',
        category: 'other',
        body: 'Preciso de ajuda com algo.',
      }),
      tenant: true,
      allowed: STAFF,
    },
    {
      method: 'get',
      path: '/v1/support/tickets/{id}',
      url: () => `/v1/support/tickets/${fake}`,
      tenant: true,
      allowed: STAFF,
    },
    {
      method: 'post',
      path: '/v1/support/tickets/{id}/messages',
      url: () => `/v1/support/tickets/${fake}/messages`,
      body: () => ({ body: 'Mais detalhes' }),
      tenant: true,
      allowed: STAFF,
    },
    { method: 'get', path: '/v1/admin/support/tickets', tenant: false, allowed: ADMIN },
    {
      method: 'get',
      path: '/v1/admin/support/tickets/{id}',
      url: () => `/v1/admin/support/tickets/${fake}`,
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'post',
      path: '/v1/admin/support/tickets/{id}/messages',
      url: () => `/v1/admin/support/tickets/${fake}/messages`,
      body: () => ({ body: 'Resposta' }),
      tenant: false,
      allowed: ADMIN,
    },
    {
      method: 'patch',
      path: '/v1/admin/support/tickets/{id}',
      url: () => `/v1/admin/support/tickets/${fake}`,
      body: () => ({ status: 'RESOLVED' }),
      tenant: false,
      allowed: ADMIN,
    },
  ];
}

/** Rotas públicas da Fase 3 testadas nos fluxos (pro-plus.e2e.test.ts). */
export const PRO_PLUS_COVERED_ELSEWHERE = [
  'GET /v1/team/invites/{token}',
  'POST /v1/team/invites/accept',
  'GET /v1/public/brand',
  'GET /v1/public/brand/{tenantId}/logo',
  'GET /v1/integrations/google/callback',
  'POST /v1/integrations/google/webhook',
];
