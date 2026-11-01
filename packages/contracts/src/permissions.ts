import type { Role } from './enums.js';

export const Resource = [
  // tenant
  'tenant',
  'team',
  'subscription',
  'settings',
  'students',
  'groups',
  'anamnesis',
  'assessments',
  'library',
  'workouts',
  'training',
  'progress',
  'chat',
  'broadcasts',
  'schedule',
  'finance',
  'brand',
  'documents',
  'uploads',
  'notifications',
  'academy',
  // plataforma
  'platform.tenants',
  'platform.plans',
  'platform.features',
  'platform.library',
  'platform.content',
  'platform.finance',
  'platform.support',
  'platform.admins',
  'platform.audit',
  'platform.impersonation',
] as const;
export type Resource = (typeof Resource)[number];

export const Action = ['read', 'create', 'update', 'delete', 'manage'] as const;
export type Action = (typeof Action)[number];

/**
 * Escopo concedido:
 * - all: todos os registros do tenant (ou da plataforma)
 * - assigned: só alunos atribuídos ao assistente
 * - own: só os próprios registros do usuário
 */
export type Scope = 'all' | 'assigned' | 'own';

type Grant = Partial<Record<Resource, Partial<Record<Action, Scope>>>>;

const ALL: Record<Action, Scope> = {
  read: 'all',
  create: 'all',
  update: 'all',
  delete: 'all',
  manage: 'all',
};
const crud = (scope: Scope): Record<Action, Scope> => ({
  read: scope,
  create: scope,
  update: scope,
  delete: scope,
  manage: scope,
});
const readOnly = (scope: Scope): Partial<Record<Action, Scope>> => ({ read: scope });

const TENANT_RESOURCES = Resource.filter((r) => !r.startsWith('platform.'));
const PLATFORM_RESOURCES = Resource.filter((r) => r.startsWith('platform.'));

const personal: Grant = Object.fromEntries(TENANT_RESOURCES.map((r) => [r, ALL]));

const assistant: Grant = {
  students: { read: 'assigned', update: 'assigned' },
  groups: readOnly('all'),
  anamnesis: crud('assigned'),
  assessments: crud('assigned'),
  library: { read: 'all', create: 'all', update: 'own', delete: 'own' },
  workouts: crud('assigned'),
  training: readOnly('assigned'),
  progress: crud('assigned'),
  chat: crud('assigned'),
  schedule: crud('assigned'),
  documents: crud('assigned'),
  uploads: { read: 'own', create: 'own', delete: 'own' },
  notifications: crud('own'),
  academy: readOnly('all'),
};

const student: Grant = {
  anamnesis: { read: 'own', update: 'own' },
  assessments: readOnly('own'),
  library: readOnly('all'),
  workouts: readOnly('own'),
  training: crud('own'),
  progress: crud('own'),
  chat: crud('own'),
  schedule: { read: 'own', update: 'own' },
  finance: { read: 'own', update: 'own' },
  documents: { read: 'own', create: 'own' },
  uploads: { read: 'own', create: 'own', delete: 'own' },
  notifications: crud('own'),
};

const superAdmin: Grant = Object.fromEntries(PLATFORM_RESOURCES.map((r) => [r, ALL]));

const operator: Grant = {
  ...superAdmin,
  'platform.admins': readOnly('all'),
  'platform.finance': readOnly('all'),
};

export const ROLE_GRANTS: Record<Role, Grant> = {
  SUPER_ADMIN: superAdmin,
  ADMIN_OPERADOR: operator,
  PERSONAL: personal,
  PERSONAL_ASSISTENTE: assistant,
  ALUNO: student,
};

/**
 * Autorização por papel. Retorna o escopo concedido ou false.
 * `manage` implica todas as ações.
 */
export function can(role: Role, action: Action, resource: Resource): Scope | false {
  const grant = ROLE_GRANTS[role][resource];
  if (!grant) return false;
  return grant[action] ?? grant.manage ?? false;
}

export const isPlatformRole = (role: Role) => role === 'SUPER_ADMIN' || role === 'ADMIN_OPERADOR';
