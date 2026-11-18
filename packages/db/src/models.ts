import { Prisma } from '../generated/client';

/**
 * Tabelas que têm coluna tenant_id mas são de sistema (acessadas só pelo
 * cliente de sistema) e por isso ficam fora do RLS por tenant. Ver ADR-001.
 */
export const SYSTEM_MODELS_WITH_TENANT_COLUMN = new Set([
  'Consent',
  'AuditLog',
  'AuthToken',
  'Notification',
  'DeliveryLog',
  'NotificationTemplate',
  // Fase 3: suporte e comunicados da plataforma são lidos pelo admin (cruzam tenants).
  'SupportTicket',
  'SupportMessage',
  'PlatformBroadcastRecipient',
]);

/** Tabelas que o papel vetta_tenant não pode acessar de forma alguma. */
export const TENANT_ROLE_REVOKED_MODELS = new Set([
  'AdminUser',
  'Session',
  'RefreshToken',
  'AuthToken',
  'UserIdentity',
  'AuditLog',
  'DeliveryLog',
  'PlatformIntegration',
]);

export interface ModelInfo {
  name: string;
  table: string;
  /** tenant_id obrigatório. */
  tenantRequired: boolean;
}

const models = Prisma.dmmf.datamodel.models;

function tableOf(name: string): string {
  const m = models.find((x) => x.name === name);
  if (!m) throw new Error(`Modelo desconhecido: ${name}`);
  return m.dbName ?? m.name;
}

/** Modelos com isolamento por tenant (RLS + injeção de tenant_id). */
export const TENANT_MODELS: readonly ModelInfo[] = models
  .filter((m) => !SYSTEM_MODELS_WITH_TENANT_COLUMN.has(m.name))
  .flatMap((m) => {
    const f = m.fields.find((x) => x.name === 'tenantId');
    return f ? [{ name: m.name, table: m.dbName ?? m.name, tenantRequired: f.isRequired }] : [];
  });

export const TENANT_MODEL_NAMES: ReadonlySet<string> = new Set(TENANT_MODELS.map((m) => m.name));

/** tenant_id opcional: nulo = conteúdo da plataforma, legível por todos os tenants. */
export const SHARED_MODEL_NAMES: ReadonlySet<string> = new Set(
  TENANT_MODELS.filter((m) => !m.tenantRequired).map((m) => m.name),
);

export const ALL_TABLES: readonly string[] = models.map((m) => m.dbName ?? m.name);
export const REVOKED_TABLES: readonly string[] = [...TENANT_ROLE_REVOKED_MODELS].map(tableOf);
export const TENANTS_TABLE = tableOf('Tenant');
