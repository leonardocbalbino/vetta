import { REVOKED_TABLES, TENANT_MODELS, TENANTS_TABLE } from './models';

export const TENANT_ROLE = 'vetta_tenant';
export const PLATFORM_ROLE = 'vetta_platform';

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/**
 * Gera o SQL (idempotente) de Row Level Security:
 * - papéis vetta_tenant (sujeito às policies) e vetta_platform (acesso total controlado);
 * - policy por tenant_id em toda tabela de negócio;
 * - leitura compartilhada de linhas com tenant_id nulo (biblioteca global, modelos prontos).
 * O dono das tabelas (usuário de migração) não é afetado pelo RLS (sem FORCE): é o
 * "cliente de sistema", usado só por auth, workers e seed.
 */
export function buildRlsSql(): string {
  const out: string[] = [];
  out.push(`-- Gerado por packages/db/scripts/generate-rls.ts. Não edite à mão.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TENANT_ROLE}') THEN
    CREATE ROLE ${TENANT_ROLE} NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PLATFORM_ROLE}') THEN
    CREATE ROLE ${PLATFORM_ROLE} NOLOGIN;
  END IF;
END
$$;

GRANT ${TENANT_ROLE} TO CURRENT_USER;
GRANT ${PLATFORM_ROLE} TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO ${TENANT_ROLE}, ${PLATFORM_ROLE};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${TENANT_ROLE}, ${PLATFORM_ROLE};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${TENANT_ROLE}, ${PLATFORM_ROLE};

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $fn$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $fn$;
`);

  out.push('-- Tabelas sensíveis: inacessíveis ao papel de tenant.');
  for (const t of REVOKED_TABLES) {
    out.push(`REVOKE ALL ON ${q(t)} FROM ${TENANT_ROLE};`);
  }

  out.push('\n-- Tenant: cada tenant enxerga apenas a própria linha.');
  out.push(policyBlock(TENANTS_TABLE, 'id = app_current_tenant()', null));

  for (const m of TENANT_MODELS) {
    out.push(`\n-- ${m.name}`);
    out.push(
      policyBlock(
        m.table,
        'tenant_id = app_current_tenant()',
        m.tenantRequired ? null : 'tenant_id IS NULL',
      ),
    );
  }
  return out.join('\n') + '\n';
}

function policyBlock(table: string, predicate: string, sharedRead: string | null): string {
  const t = q(table);
  const lines = [
    `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${t};`,
    `CREATE POLICY tenant_isolation ON ${t} TO ${TENANT_ROLE} USING (${predicate}) WITH CHECK (${predicate});`,
    `DROP POLICY IF EXISTS platform_access ON ${t};`,
    `CREATE POLICY platform_access ON ${t} TO ${PLATFORM_ROLE} USING (true) WITH CHECK (true);`,
    `DROP POLICY IF EXISTS shared_read ON ${t};`,
  ];
  if (sharedRead) {
    lines.push(
      `CREATE POLICY shared_read ON ${t} FOR SELECT TO ${TENANT_ROLE} USING (${sharedRead});`,
    );
  }
  return lines.join('\n');
}
