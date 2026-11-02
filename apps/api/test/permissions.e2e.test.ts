import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApi } from '../src/bootstrap';
import {
  addAssistant,
  adminToken,
  as,
  createTestContext,
  login,
  seedWorld,
  type TestContext,
} from './harness';
import { PRO_COVERED_ELSEWHERE, proRoutes } from './permissions-pro-routes';
import { PRO_PLUS_COVERED_ELSEWHERE, proPlusRoutes } from './permissions-pro-plus-routes';

/**
 * Matriz de permissões (CLAUDE.md §12): papel errado = 403, plano errado = 402,
 * outro tenant = 404, sem login = 401. Toda rota da API precisa estar aqui.
 */
let ctx: TestContext;
type Actor = 'PERSONAL' | 'ASSISTENTE' | 'ALUNO' | 'ADMIN' | 'ANON';
const tokens = {} as Record<Exclude<Actor, 'ANON'>, string>;
let tenantId: string; // PRO_PLUS: tem personal, assistente e aluno
let otherTenantId: string;
let studentLinkId: string;
let assignedLinkId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  const w = await seedWorld(ctx, 'PRO_PLUS', 2);
  tenantId = w.tenantId;
  studentLinkId = w.studentLinkIds[1]!;
  assignedLinkId = w.studentLinkIds[0]!;
  const asst = await addAssistant(ctx, w, [assignedLinkId]);
  tokens.PERSONAL = await login(ctx, w.ownerEmail);
  tokens.ASSISTENTE = await login(ctx, asst.email);
  tokens.ALUNO = await login(ctx, w.studentEmails[1]!);
  tokens.ADMIN = (await adminToken(ctx)).token;
  otherTenantId = (await seedWorld(ctx, 'PRO')).tenantId;
});
afterAll(async () => ctx?.close());

interface Route {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  /** Template como no OpenAPI (para o teste de cobertura). */
  path: string;
  url?: () => string;
  body?: () => object;
  tenant: boolean;
  allowed: Actor[];
}

const A = (...a: Actor[]) => a;
const USERS = A('PERSONAL', 'ASSISTENTE', 'ALUNO');
const fake = '0190f1e2-0000-7000-8000-000000000000';

const ROUTES: Route[] = [
  // usuário autenticado (sem tenant)
  { method: 'get', path: '/v1/me', tenant: false, allowed: USERS },
  {
    method: 'patch',
    path: '/v1/me',
    body: () => ({ timezone: 'America/Sao_Paulo' }),
    tenant: false,
    allowed: USERS,
  },
  { method: 'get', path: '/v1/me/export', tenant: false, allowed: USERS },
  { method: 'get', path: '/v1/auth/sessions', tenant: false, allowed: USERS },
  {
    method: 'delete',
    path: '/v1/auth/sessions/{id}',
    url: () => `/v1/auth/sessions/${fake}`,
    tenant: false,
    allowed: USERS,
  },
  { method: 'post', path: '/v1/auth/verify-email/resend', tenant: false, allowed: USERS },
  {
    method: 'post',
    path: '/v1/auth/2fa/disable',
    body: () => ({ code: '123456' }),
    tenant: false,
    allowed: USERS,
  },
  { method: 'get', path: '/v1/notifications', tenant: false, allowed: USERS },
  { method: 'get', path: '/v1/notifications/unread-count', tenant: false, allowed: USERS },
  { method: 'post', path: '/v1/notifications/read-all', tenant: false, allowed: USERS },
  {
    method: 'patch',
    path: '/v1/notifications/{id}/read',
    url: () => `/v1/notifications/${fake}/read`,
    tenant: false,
    allowed: USERS,
  },
  { method: 'get', path: '/v1/notifications/preferences', tenant: false, allowed: USERS },
  {
    method: 'put',
    path: '/v1/notifications/preferences',
    body: () => ({ items: [], quietHours: { enabled: true, start: '22:00', end: '07:00' } }),
    tenant: false,
    allowed: USERS,
  },
  {
    method: 'post',
    path: '/v1/devices',
    body: () => ({
      pushToken: `ExponentPushToken[${Math.random().toString(36).slice(2)}]`,
      platform: 'IOS',
    }),
    tenant: false,
    allowed: USERS,
  },
  {
    method: 'delete',
    path: '/v1/devices/{id}',
    url: () => `/v1/devices/${fake}`,
    tenant: false,
    allowed: USERS,
  },
  // uploads: usuários e equipe da plataforma
  {
    method: 'post',
    path: '/v1/uploads',
    body: () => ({ purpose: 'avatar', fileName: 'eu.jpg', mimeType: 'image/jpeg', size: 1000 }),
    tenant: false,
    allowed: [...USERS, 'ADMIN'],
  },
  {
    method: 'get',
    path: '/v1/uploads/{id}',
    url: () => `/v1/uploads/${fake}`,
    tenant: false,
    allowed: [...USERS, 'ADMIN'],
  },
  {
    method: 'post',
    path: '/v1/uploads/{id}/complete',
    url: () => `/v1/uploads/${fake}/complete`,
    tenant: false,
    allowed: [...USERS, 'ADMIN'],
  },
  {
    method: 'get',
    path: '/v1/media/{id}',
    url: () => `/v1/media/${fake}`,
    tenant: false,
    allowed: [...USERS, 'ADMIN'],
  },
  {
    method: 'delete',
    path: '/v1/media/{id}',
    url: () => `/v1/media/${fake}`,
    tenant: false,
    allowed: [...USERS, 'ADMIN'],
  },
  // tenant
  { method: 'get', path: '/v1/me/entitlements', tenant: true, allowed: USERS },
  { method: 'get', path: '/v1/tenants/current', tenant: true, allowed: USERS },
  {
    method: 'patch',
    path: '/v1/tenants/current',
    body: () => ({ cref: '123456-G/SP' }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  { method: 'get', path: '/v1/students', tenant: true, allowed: A('PERSONAL', 'ASSISTENTE') },
  {
    method: 'post',
    path: '/v1/students/invites',
    body: () => ({
      name: 'Novo',
      email: `novo-${Math.random().toString(36).slice(2)}@test.dev`,
      delivery: 'LINK',
    }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'post',
    path: '/v1/students/{id}/archive',
    url: () => `/v1/students/${assignedLinkId}/archive`,
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'post',
    path: '/v1/students/{id}/restore',
    url: () => `/v1/students/${assignedLinkId}/restore`,
    tenant: true,
    allowed: A('PERSONAL'),
  },
  // plataforma
  { method: 'get', path: '/v1/admin/auth/me', tenant: false, allowed: A('ADMIN') },
  { method: 'get', path: '/v1/admin/plans', tenant: false, allowed: A('ADMIN') },
  {
    method: 'patch',
    path: '/v1/admin/plans/{code}/features',
    url: () => '/v1/admin/plans/PRO/features',
    body: () => ({ values: {} }),
    tenant: false,
    allowed: A('ADMIN'),
  },
  { method: 'get', path: '/v1/admin/tenants', tenant: false, allowed: A('ADMIN') },
  {
    method: 'put',
    path: '/v1/admin/tenants/{tenantId}/overrides',
    url: () => `/v1/admin/tenants/${otherTenantId}/overrides`,
    body: () => ({ featureKey: 'support.priority', value: true, reason: 'Teste de matriz' }),
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'delete',
    path: '/v1/admin/tenants/{tenantId}/overrides/{featureKey}',
    url: () => `/v1/admin/tenants/${otherTenantId}/overrides/support.priority`,
    tenant: false,
    allowed: A('ADMIN'),
  },
  { method: 'get', path: '/v1/admin/audit-logs', tenant: false, allowed: A('ADMIN') },
  {
    method: 'post',
    path: '/v1/admin/impersonations',
    body: () => ({ userId: fake, reason: 'Teste de matriz de permissões', minutes: 5 }),
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'delete',
    path: '/v1/admin/impersonations/{sessionId}',
    url: () => `/v1/admin/impersonations/${fake}`,
    tenant: false,
    allowed: A('ADMIN'),
  },
  // ─── Fase 1 ───────────────────────────────────────────────────────────
  // biblioteca
  { method: 'get', path: '/v1/exercises', tenant: true, allowed: USERS },
  {
    method: 'get',
    path: '/v1/exercises/{id}',
    url: () => `/v1/exercises/${fake}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'post',
    path: '/v1/exercises',
    body: () => ({ name: 'Exercício da matriz' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'put',
    path: '/v1/exercises/{id}',
    url: () => `/v1/exercises/${fake}`,
    body: () => ({ name: 'X1' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/exercises/{id}/duplicate',
    url: () => `/v1/exercises/${fake}/duplicate`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'delete',
    path: '/v1/exercises/{id}',
    url: () => `/v1/exercises/${fake}`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/exercises/{id}/favorite',
    url: () => `/v1/exercises/${fake}/favorite`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'delete',
    path: '/v1/exercises/{id}/favorite',
    url: () => `/v1/exercises/${fake}/favorite`,
    tenant: true,
    allowed: USERS,
  },
  { method: 'get', path: '/v1/exercise-folders', tenant: true, allowed: USERS },
  {
    method: 'post',
    path: '/v1/exercise-folders',
    body: () => ({ name: 'Pasta' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'patch',
    path: '/v1/exercise-folders/{id}',
    url: () => `/v1/exercise-folders/${fake}`,
    body: () => ({ name: 'P' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'delete',
    path: '/v1/exercise-folders/{id}',
    url: () => `/v1/exercise-folders/${fake}`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  // alunos
  {
    method: 'get',
    path: '/v1/students/frequency',
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'get',
    path: '/v1/students/inactive',
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/students/bulk',
    body: () => ({ ids: [fake], action: 'add_tag', tag: 'x' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/students/import',
    body: () => ({ csv: 'nome\n' }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'get',
    path: '/v1/students/{id}',
    url: () => `/v1/students/${assignedLinkId}`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'patch',
    path: '/v1/students/{id}',
    url: () => `/v1/students/${assignedLinkId}`,
    body: () => ({ goal: 'Força' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'get',
    path: '/v1/students/{id}/timeline',
    url: () => `/v1/students/${assignedLinkId}/timeline`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  { method: 'get', path: '/v1/student-groups', tenant: true, allowed: A('PERSONAL', 'ASSISTENTE') },
  {
    method: 'post',
    path: '/v1/student-groups',
    body: () => ({ name: 'Turma' }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'patch',
    path: '/v1/student-groups/{id}',
    url: () => `/v1/student-groups/${fake}`,
    body: () => ({ name: 'Turma' }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'delete',
    path: '/v1/student-groups/{id}',
    url: () => `/v1/student-groups/${fake}`,
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'post',
    path: '/v1/student-groups/{id}/members',
    url: () => `/v1/student-groups/${fake}/members`,
    body: () => ({ studentLinkIds: [fake] }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'delete',
    path: '/v1/student-groups/{id}/members/{studentLinkId}',
    url: () => `/v1/student-groups/${fake}/members/${fake}`,
    tenant: true,
    allowed: A('PERSONAL'),
  },
  {
    method: 'patch',
    path: '/v1/tenants/current/settings',
    body: () => ({ inactivityAlertDays: 5 }),
    tenant: true,
    allowed: A('PERSONAL'),
  },
  // anamnese
  { method: 'get', path: '/v1/anamnesis/templates', tenant: true, allowed: USERS },
  {
    method: 'post',
    path: '/v1/anamnesis/templates',
    body: () => ({ name: 'Modelo', questions: [{ id: 'q', type: 'text', label: 'Pergunta' }] }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/anamnesis/requests',
    body: () => ({ templateId: fake, studentLinkIds: [fake] }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  { method: 'get', path: '/v1/anamnesis/responses', tenant: true, allowed: USERS },
  {
    method: 'get',
    path: '/v1/anamnesis/responses/{id}',
    url: () => `/v1/anamnesis/responses/${fake}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'post',
    path: '/v1/anamnesis/responses/{id}/answer',
    url: () => `/v1/anamnesis/responses/${fake}/answer`,
    body: () => ({ answers: {}, acceptHealthDataConsent: true }),
    tenant: true,
    allowed: A('ALUNO'),
  },
  {
    method: 'post',
    path: '/v1/anamnesis/responses/{id}/review',
    url: () => `/v1/anamnesis/responses/${fake}/review`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  // avaliações
  {
    method: 'post',
    path: '/v1/students/{studentLinkId}/assessments',
    url: () => `/v1/students/${fake}/assessments`,
    body: () => ({}),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'get',
    path: '/v1/students/{studentLinkId}/assessments',
    url: () => `/v1/students/${fake}/assessments`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'get',
    path: '/v1/students/{studentLinkId}/assessments/compare',
    url: () => `/v1/students/${fake}/assessments/compare`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'get',
    path: '/v1/assessments/{id}',
    url: () => `/v1/assessments/${fake}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'delete',
    path: '/v1/assessments/{id}',
    url: () => `/v1/assessments/${fake}`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/assessments/{id}/pdf',
    url: () => `/v1/assessments/${fake}/pdf`,
    tenant: true,
    allowed: USERS,
  },
  // treinos
  { method: 'get', path: '/v1/programs', tenant: true, allowed: USERS },
  {
    method: 'post',
    path: '/v1/programs',
    body: () => ({}),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'get',
    path: '/v1/programs/{id}',
    url: () => `/v1/programs/${fake}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'put',
    path: '/v1/programs/{id}',
    url: () => `/v1/programs/${fake}`,
    body: () => ({}),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/programs/{id}/publish',
    url: () => `/v1/programs/${fake}/publish`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/programs/{id}/clone',
    url: () => `/v1/programs/${fake}/clone`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/programs/{id}/apply',
    url: () => `/v1/programs/${fake}/apply`,
    body: () => ({ studentLinkIds: [fake] }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'delete',
    path: '/v1/programs/{id}',
    url: () => `/v1/programs/${fake}`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/programs/{id}/public-link',
    url: () => `/v1/programs/${fake}/public-link`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'delete',
    path: '/v1/programs/{id}/public-link',
    url: () => `/v1/programs/${fake}/public-link`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  // execução, feedbacks, evolução, dashboard
  { method: 'get', path: '/v1/training/today', tenant: true, allowed: A('ALUNO') },
  {
    method: 'post',
    path: '/v1/training/sessions',
    body: () => ({}),
    tenant: true,
    allowed: A('ALUNO'),
  },
  {
    method: 'get',
    path: '/v1/training/sessions',
    url: () => `/v1/training/sessions?studentLinkId=${assignedLinkId}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'get',
    path: '/v1/training/records',
    url: () => `/v1/training/records?studentLinkId=${assignedLinkId}`,
    tenant: true,
    allowed: USERS,
  },
  { method: 'get', path: '/v1/feedbacks', tenant: true, allowed: A('PERSONAL', 'ASSISTENTE') },
  {
    method: 'patch',
    path: '/v1/feedbacks/{sessionId}/read',
    url: () => `/v1/feedbacks/${fake}/read`,
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'post',
    path: '/v1/feedbacks/{sessionId}/reply',
    url: () => `/v1/feedbacks/${fake}/reply`,
    body: () => ({ message: 'oi' }),
    tenant: true,
    allowed: A('PERSONAL', 'ASSISTENTE'),
  },
  {
    method: 'get',
    path: '/v1/progress/{studentLinkId}',
    url: () => `/v1/progress/${assignedLinkId}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'get',
    path: '/v1/progress/{studentLinkId}/exercise',
    url: () => `/v1/progress/${assignedLinkId}/exercise?exerciseId=${fake}`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'post',
    path: '/v1/progress/{studentLinkId}/measurements',
    url: () => `/v1/progress/${assignedLinkId}/measurements`,
    body: () => ({ weightKg: 70 }),
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'get',
    path: '/v1/progress/{studentLinkId}/photos',
    url: () => `/v1/progress/${assignedLinkId}/photos`,
    tenant: true,
    allowed: USERS,
  },
  {
    method: 'post',
    path: '/v1/progress/{studentLinkId}/photos',
    url: () => `/v1/progress/${assignedLinkId}/photos`,
    body: () => ({ mediaId: fake }),
    tenant: true,
    allowed: USERS,
  },
  { method: 'get', path: '/v1/dashboard', tenant: true, allowed: A('PERSONAL', 'ASSISTENTE') },
  // admin
  { method: 'get', path: '/v1/admin/dashboard', tenant: false, allowed: A('ADMIN') },
  { method: 'get', path: '/v1/admin/tenants/search', tenant: false, allowed: A('ADMIN') },
  {
    method: 'get',
    path: '/v1/admin/tenants/{id}',
    url: () => `/v1/admin/tenants/${fake}`,
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'post',
    path: '/v1/admin/tenants/{id}/block',
    url: () => `/v1/admin/tenants/${fake}/block`,
    body: () => ({ reason: 'teste de matriz' }),
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'post',
    path: '/v1/admin/tenants/{id}/unblock',
    url: () => `/v1/admin/tenants/${fake}/unblock`,
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'put',
    path: '/v1/admin/plans/{code}',
    url: () => '/v1/admin/plans/PRO',
    body: () => ({}),
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'get',
    path: '/v1/admin/plans/{code}/impact',
    url: () => '/v1/admin/plans/PRO/impact?feature=support.priority&value=true',
    tenant: false,
    allowed: A('ADMIN'),
  },
  { method: 'get', path: '/v1/admin/audit', tenant: false, allowed: A('ADMIN') },
  { method: 'get', path: '/v1/admin/exercises', tenant: false, allowed: A('ADMIN') },
  {
    method: 'post',
    path: '/v1/admin/exercises',
    body: () => ({}),
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'put',
    path: '/v1/admin/exercises/{id}',
    url: () => `/v1/admin/exercises/${fake}`,
    body: () => ({}),
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'delete',
    path: '/v1/admin/exercises/{id}',
    url: () => `/v1/admin/exercises/${fake}`,
    tenant: false,
    allowed: A('ADMIN'),
  },
  {
    method: 'post',
    path: '/v1/admin/exercises/import',
    body: () => ({ csv: 'codigo;nome\n' }),
    tenant: false,
    allowed: A('ADMIN'),
  },
  { method: 'get', path: '/v1/admin/exercises/video-queue', tenant: false, allowed: A('ADMIN') },
  ...proRoutes(() => ({ studentLinkId })),
  ...proPlusRoutes(() => ({ studentLinkId })),
];

/** Rotas públicas, de sessão ou destrutivas cobertas em outros testes. */
const COVERED_ELSEWHERE = new Set([
  'GET /health',
  'POST /v1/auth/register',
  'POST /v1/auth/login',
  'POST /v1/auth/login/2fa',
  'POST /v1/auth/refresh',
  'POST /v1/auth/logout',
  'POST /v1/auth/verify-email',
  'POST /v1/auth/password/forgot',
  'POST /v1/auth/password/reset',
  'POST /v1/auth/magic-link',
  'POST /v1/auth/magic-link/verify',
  'POST /v1/auth/oauth',
  'DELETE /v1/auth/sessions',
  'POST /v1/auth/2fa/setup',
  'POST /v1/auth/2fa/enable',
  'POST /v1/admin/auth/login',
  'POST /v1/admin/auth/2fa/setup',
  'POST /v1/admin/auth/2fa/verify',
  'GET /v1/plans',
  'GET /v1/invites/{token}',
  'POST /v1/invites/accept',
  'DELETE /v1/me',
  'GET /v1/public/workouts/{token}',
  'POST /v1/public/workouts/{token}/sessions',
  'GET /v1/legal/{kind}',
  ...PRO_COVERED_ELSEWHERE,
  ...PRO_PLUS_COVERED_ELSEWHERE,
]);

function call(r: Route, actor: Actor, tenant?: string) {
  const token = actor === 'ANON' ? null : tokens[actor];
  const client = as(ctx, token, tenant);
  const url = r.url?.() ?? r.path;
  return r.method === 'get' || r.method === 'delete'
    ? client[r.method](url)
    : client[r.method](url, r.body?.());
}

describe('cobertura', () => {
  it('toda rota do OpenAPI tem teste de permissão', () => {
    const doc = buildOpenApi(ctx.app);
    const all = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops as object).map((m) => `${m.toUpperCase()} ${path}`),
    );
    const covered = new Set([
      ...ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`),
      ...COVERED_ELSEWHERE,
    ]);
    expect(all.filter((r) => !covered.has(r))).toEqual([]);
  });
});

describe.each(ROUTES.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
  '%s',
  (_name, route) => {
    it.each(['PERSONAL', 'ASSISTENTE', 'ALUNO', 'ADMIN', 'ANON'] as Actor[])(
      '%s',
      async (actor) => {
        const res = await call(
          route,
          actor,
          route.tenant && actor !== 'ADMIN' ? tenantId : undefined,
        );
        if (actor === 'ANON') return expect(res.status).toBe(401);
        if (route.allowed.includes(actor)) {
          expect([401, 402, 403], `${actor}: ${JSON.stringify(res.body)}`).not.toContain(
            res.status,
          );
        } else {
          expect(res.status, `${actor}: ${JSON.stringify(res.body)}`).toBe(403);
          expect(res.body.code).toBe('FORBIDDEN');
        }
      },
    );

    if (route.tenant) {
      it('outro tenant = 404', async () => {
        const res = await call(route, 'PERSONAL', otherTenantId);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      });
      it('sem X-Tenant-Id = 400 TENANT_REQUIRED', async () => {
        const res = await call(route, 'PERSONAL');
        expect(res.body.code).toBe('TENANT_REQUIRED');
      });
    }
  },
);

describe('escopo e plano', () => {
  it('assistente não convida nem arquiva alunos (gestão da carteira é do personal)', async () => {
    const res = await as(ctx, tokens.ASSISTENTE, tenantId).post(
      `/v1/students/${studentLinkId}/archive`,
    );
    expect(res.status).toBe(403);
  });

  it('assistente só lista alunos atribuídos', async () => {
    const res = await as(ctx, tokens.ASSISTENTE, tenantId).get('/v1/students');
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([assignedLinkId]);
  });

  it('plano FREE no limite de alunos: 402 LIMIT_REACHED com plano mínimo', async () => {
    const free = await seedWorld(ctx, 'FREE', 2);
    const t = await login(ctx, free.ownerEmail);
    const res = await as(ctx, t, free.tenantId).post('/v1/students/invites', {
      name: 'Mais um',
      delivery: 'LINK',
    });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'LIMIT_REACHED',
      details: { feature: 'students.max', requiredPlan: 'PRO', used: 2, max: 2 },
    });
  });

  it('feature fora do plano: 402 FEATURE_LOCKED (vídeo próprio no FREE)', async () => {
    const free = await seedWorld(ctx, 'FREE');
    const t = await login(ctx, free.ownerEmail);
    const res = await as(ctx, t, free.tenantId).post('/v1/uploads', {
      purpose: 'exercise_video',
      fileName: 'agachamento.mp4',
      mimeType: 'video/mp4',
      size: 1_000_000,
    });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'FEATURE_LOCKED',
      details: { feature: 'library.custom_videos', requiredPlan: 'PRO' },
    });
  });

  it('override do admin libera a feature na hora (cache invalidado)', async () => {
    const free = await seedWorld(ctx, 'FREE');
    const t = await login(ctx, free.ownerEmail);
    const before = await as(ctx, t, free.tenantId).get('/v1/me/entitlements');
    expect(before.body.features['library.custom_videos']).toBe(false);
    await as(ctx, tokens.ADMIN).put(`/v1/admin/tenants/${free.tenantId}/overrides`, {
      featureKey: 'library.custom_videos',
      value: true,
      reason: 'Cortesia comercial',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const after = await as(ctx, t, free.tenantId).get('/v1/me/entitlements');
    expect(after.body.features['library.custom_videos']).toBe(true);
    expect(after.body.plan.code).toBe('FREE');
  });

  it('aluno arquivado perde acesso ao tenant (403)', async () => {
    const w = await seedWorld(ctx, 'PRO');
    const t = await login(ctx, w.studentEmails[0]!);
    expect((await as(ctx, t, w.tenantId).get('/v1/tenants/current')).status).toBe(200);
    await ctx.db.studentLink.update({
      where: { id: w.studentLinkIds[0]! },
      data: { status: 'ARCHIVED' },
    });
    expect((await as(ctx, t, w.tenantId).get('/v1/tenants/current')).status).toBe(403);
  });

  it('operador não gerencia o que é só do super admin', async () => {
    const op = await adminToken(ctx, 'ADMIN_OPERADOR');
    expect((await as(ctx, op.token).get('/v1/admin/plans')).status).toBe(200);
  });
});
