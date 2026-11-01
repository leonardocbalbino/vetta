import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/client';
import { syncCatalog } from './catalog';
import { createTenantWorld, type TenantWorld } from './fixtures';
import { SYSTEM_MODELS_WITH_TENANT_COLUMN, TENANT_MODELS } from './models';
import { forTenant, withTenantSql } from './tenancy';
import { startTestDatabase, type TestDatabase } from './testing';

let tdb: TestDatabase;
let base: PrismaClient;
let A: TenantWorld;
let B: TenantWorld;
let globalExerciseId: string;

const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);
type Delegate = {
  findMany: (a?: unknown) => Promise<{ id: string; tenantId: string | null }[]>;
  findFirst: (a?: unknown) => Promise<unknown>;
  findUnique: (a?: unknown) => Promise<unknown>;
  count: (a?: unknown) => Promise<number>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
};

beforeAll(async () => {
  tdb = await startTestDatabase();
  base = new PrismaClient({ datasourceUrl: tdb.url });
  await syncCatalog(base);
  const students = (p: string) => [
    { name: `${p} 1`, email: `${p}1@test.dev` },
    { name: `${p} 2`, email: `${p}2@test.dev` },
  ];
  A = await createTenantWorld(base, {
    slug: 'tenant-a',
    ownerName: 'A',
    ownerEmail: 'a@test.dev',
    businessName: 'A',
    plan: 'PRO',
    students: students('a'),
  });
  B = await createTenantWorld(base, {
    slug: 'tenant-b',
    ownerName: 'B',
    ownerEmail: 'b@test.dev',
    businessName: 'B',
    plan: 'FREE',
    students: students('b'),
  });
  globalExerciseId = (await base.exercise.create({ data: { name: 'Global', tenantId: null } })).id;
}, 300_000);

afterAll(async () => {
  await base?.$disconnect();
  await tdb?.stop();
});

describe('cobertura', () => {
  it('as fixtures criam linhas em todas as tabelas de negócio', () => {
    const missing = TENANT_MODELS.filter((m) => !A.rows[m.name]?.length).map((m) => m.name);
    expect(missing).toEqual([]);
  });

  it('toda tabela com tenant_id (exceto as de sistema) tem RLS e policy de tenant', async () => {
    const rows = await base.$queryRaw<{ table: string; rls: boolean; policies: number }[]>`
      SELECT c.relname AS table, c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policies
      FROM pg_class c
      JOIN information_schema.columns col ON col.table_name = c.relname AND col.column_name = 'tenant_id'
      WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace`;
    const systemTables = new Set([
      'consents',
      'audit_logs',
      'auth_tokens',
      'notifications',
      'delivery_logs',
      'notification_templates',
    ]);
    expect(SYSTEM_MODELS_WITH_TENANT_COLUMN.size).toBe(systemTables.size);
    const unprotected = rows.filter(
      (r) => !systemTables.has(r.table) && (!r.rls || r.policies !== 1),
    );
    expect(unprotected).toEqual([]);
    expect(rows.length - systemTables.size).toBe(TENANT_MODELS.length);
  });
});

describe.each(TENANT_MODELS.map((m) => [m.name, m] as const))('isolamento: %s', (name, model) => {
  const idOfA = () => A.rows[name]![0]!;

  it('camada ORM: B não lê, não altera e não apaga linhas de A', async () => {
    const dbB = forTenant(base, B.tenantId) as unknown as Record<string, Delegate>;
    const d = dbB[delegateName(name)]!;
    const visible = await d.findMany();
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((r) => r.tenantId === B.tenantId || r.tenantId === null)).toBe(true);
    expect(await d.findFirst({ where: { id: idOfA() } })).toBeNull();
    expect(await d.findUnique({ where: { id: idOfA() } })).toBeNull();
    expect(await d.count({ where: { id: idOfA() } })).toBe(0);
    expect(
      (await d.updateMany({ where: { id: idOfA() }, data: { updatedAt: new Date() } })).count,
    ).toBe(0);
    expect((await d.deleteMany({ where: { id: idOfA() } })).count).toBe(0);
    // A linha continua lá para o dono
    const dbA = forTenant(base, A.tenantId) as unknown as Record<string, Delegate>;
    expect(await dbA[delegateName(name)]!.findUnique({ where: { id: idOfA() } })).not.toBeNull();
  });

  it('camada RLS: SQL bruto no contexto de B não enxerga nem altera A', async () => {
    const t = `"${model.table}"`;
    const seen = await withTenantSql(base, B.tenantId, (tx) =>
      tx.$queryRawUnsafe<{ c: number }[]>(
        `SELECT count(*)::int AS c FROM ${t} WHERE tenant_id = $1::uuid`,
        A.tenantId,
      ),
    );
    expect(seen[0]!.c).toBe(0);
    const own = await withTenantSql(base, A.tenantId, (tx) =>
      tx.$queryRawUnsafe<{ c: number }[]>(
        `SELECT count(*)::int AS c FROM ${t} WHERE tenant_id = $1::uuid`,
        A.tenantId,
      ),
    );
    expect(own[0]!.c).toBeGreaterThan(0);
    const updated = await withTenantSql(base, B.tenantId, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE ${t} SET updated_at = now() WHERE tenant_id = $1::uuid`,
        A.tenantId,
      ),
    );
    expect(updated).toBe(0);
    const deleted = await withTenantSql(base, B.tenantId, (tx) =>
      tx.$executeRawUnsafe(`DELETE FROM ${t} WHERE tenant_id = $1::uuid`, A.tenantId),
    );
    expect(deleted).toBe(0);
  });

  it('camada RLS: B não consegue mover as próprias linhas para A (WITH CHECK)', async () => {
    const t = `"${model.table}"`;
    await expect(
      withTenantSql(base, B.tenantId, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE ${t} SET tenant_id = $1::uuid WHERE tenant_id = $2::uuid`,
          A.tenantId,
          B.tenantId,
        ),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });
});

describe('casos especiais', () => {
  it('tabela tenants: cada tenant vê só a própria linha', async () => {
    const list = await forTenant(base, B.tenantId).tenant.findMany();
    expect(list.map((t) => t.id)).toEqual([B.tenantId]);
    const raw = await withTenantSql(
      base,
      B.tenantId,
      (tx) =>
        tx.$queryRaw<
          { c: number }[]
        >`SELECT count(*)::int AS c FROM tenants WHERE id = ${A.tenantId}::uuid`,
    );
    expect(raw[0]!.c).toBe(0);
  });

  it('conteúdo global é legível por todos, mas não alterável por tenants', async () => {
    const dbB = forTenant(base, B.tenantId);
    expect(await dbB.exercise.findUnique({ where: { id: globalExerciseId } })).not.toBeNull();
    expect(
      (await dbB.exercise.updateMany({ where: { id: globalExerciseId }, data: { name: 'x' } }))
        .count,
    ).toBe(0);
    const updated = await withTenantSql(
      base,
      B.tenantId,
      (tx) =>
        tx.$executeRaw`UPDATE exercises SET name = 'hack' WHERE id = ${globalExerciseId}::uuid`,
    );
    expect(updated).toBe(0);
  });

  it('create injeta o tenant ativo e recusa tenant divergente', async () => {
    const dbB = forTenant(base, B.tenantId);
    const g = await dbB.studentGroup.create({ data: { name: 'Novo' } as never });
    expect(g.tenantId).toBe(B.tenantId);
    await expect(
      dbB.studentGroup.create({ data: { name: 'x', tenantId: A.tenantId } }),
    ).rejects.toThrow(/divergente/);
  });

  it('tabelas sensíveis são inacessíveis ao papel de tenant', async () => {
    for (const table of ['sessions', 'refresh_tokens', 'admin_users', 'auth_tokens']) {
      await expect(
        withTenantSql(base, B.tenantId, (tx) =>
          tx.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('transação interativa mantém injeção e RLS', async () => {
    const dbB = forTenant(base, B.tenantId);
    const result = await dbB.$tenantTransaction(async (tx) => {
      const groups = await tx.studentGroup.findMany();
      const leaked = await tx.$queryRaw<
        { c: number }[]
      >`SELECT count(*)::int AS c FROM student_groups WHERE tenant_id = ${A.tenantId}::uuid`;
      return { groups, leaked: leaked[0]!.c };
    });
    expect(result.groups.every((g) => g.tenantId === B.tenantId)).toBe(true);
    expect(result.leaked).toBe(0);
  });
});
