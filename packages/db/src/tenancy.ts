import { Prisma, type PrismaClient } from '../generated/client';
import { SHARED_MODEL_NAMES, TENANT_MODEL_NAMES } from './models';
import { PLATFORM_ROLE, TENANT_ROLE } from './rls-sql';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

const READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const WHERE_WRITE_OPS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

function withTenantData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => withTenantData(d, tenantId));
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    // Entrada "checked" (tenant: { connect }) não aceita tenantId escalar.
    if ('tenant' in d) return d;
    if (d.tenantId !== undefined && d.tenantId !== tenantId) {
      throw new Error('tenant_id divergente do tenant ativo');
    }
    return { ...d, tenantId };
  }
  return data;
}

/**
 * Camada (a) do isolamento: injeta tenant_id em where/data.
 * A camada (b) é o RLS no Postgres (ver rls-sql.ts).
 */
export function injectTenant(
  model: string,
  operation: string,
  args: AnyArgs | undefined,
  tenantId: string,
): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };

  if (model === 'Tenant') {
    if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
      a.where = { ...(a.where ?? {}), id: tenantId };
    }
    return a;
  }
  if (!TENANT_MODEL_NAMES.has(model)) return a;

  const shared = SHARED_MODEL_NAMES.has(model);
  if (READ_OPS.has(operation)) {
    a.where = shared
      ? {
          ...(a.where ?? {}),
          // Mescla com um AND existente em vez de sobrescrevê-lo.
          AND: [
            ...(Array.isArray(a.where?.AND) ? a.where.AND : a.where?.AND ? [a.where.AND] : []),
            { OR: [{ tenantId }, { tenantId: null }] },
          ],
        }
      : { ...(a.where ?? {}), tenantId };
  } else if (WHERE_WRITE_OPS.has(operation)) {
    a.where = { ...(a.where ?? {}), tenantId };
  } else if (
    operation === 'create' ||
    operation === 'createMany' ||
    operation === 'createManyAndReturn'
  ) {
    a.data = withTenantData(a.data, tenantId);
  } else if (operation === 'upsert') {
    a.where = { ...(a.where ?? {}), tenantId };
    a.create = withTenantData(a.create, tenantId) as Record<string, unknown>;
  }
  return a;
}

function assertUuid(tenantId: string) {
  if (!UUID_RE.test(tenantId)) throw new Error('tenantId inválido');
}

/** SQL que ativa o contexto do tenant na transação corrente. */
const tenantContextSql = (tenantId: string) =>
  Prisma.sql`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('role', ${TENANT_ROLE}, true)`;

const platformContextSql = () => Prisma.sql`SELECT set_config('role', ${PLATFORM_ROLE}, true)`;

/** Só a injeção de tenant_id (usada dentro de transações interativas). */
function injectionOnly(base: PrismaClient, tenantId: string) {
  return base.$extends({
    name: 'tenant-injection',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(injectTenant(model, operation, args as AnyArgs, tenantId));
        },
      },
    },
  });
}

/**
 * Cliente com escopo de tenant: cada operação roda numa transação com
 * SET LOCAL ROLE vetta_tenant + app.tenant_id, e tenant_id é injetado.
 * Para várias operações atômicas use `$tenantTransaction` (nunca `$transaction`).
 */
export function forTenant(base: PrismaClient, tenantId: string) {
  assertUuid(tenantId);
  const injected = injectionOnly(base, tenantId);
  return injected.$extends({
    name: 'tenant-rls',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRaw(tenantContextSql(tenantId)),
            query(args),
          ]);
          return result;
        },
      },
    },
    client: {
      tenantId,
      /** Transação interativa no contexto do tenant (injeção + RLS). */
      $tenantTransaction<R>(
        fn: (tx: Parameters<Parameters<typeof injected.$transaction>[0]>[0]) => Promise<R>,
        options?: { timeout?: number; maxWait?: number },
      ): Promise<R> {
        return injected.$transaction(async (tx) => {
          await tx.$executeRaw(tenantContextSql(tenantId));
          return fn(tx);
        }, options);
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof forTenant>;
export type TenantTransactionClient = Parameters<
  Parameters<TenantPrismaClient['$tenantTransaction']>[0]
>[0];

/**
 * Cliente da plataforma (painel admin): papel vetta_platform, que tem policy
 * de acesso total. Uso restrito a rotas de admin, sempre auditadas.
 */
export function forPlatform(base: PrismaClient) {
  return base.$extends({
    name: 'platform-rls',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRaw(platformContextSql()),
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type PlatformPrismaClient = ReturnType<typeof forPlatform>;

/** Executa SQL bruto dentro do contexto RLS de um tenant (usado em testes e relatórios). */
export async function withTenantSql<R>(
  base: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<R>,
): Promise<R> {
  assertUuid(tenantId);
  return base.$transaction(async (tx) => {
    await tx.$executeRaw(tenantContextSql(tenantId));
    return fn(tx);
  });
}
