import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '../../generated/client';

export { createTenantWorld, type TenantWorld, type TenantWorldOptions } from '../fixtures';

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

const PACKAGE_ROOT = path.resolve(__dirname, '../..');

/**
 * Banco para testes: usa TEST_DATABASE_URL (CI, com service postgres) ou sobe
 * um Postgres 16 via Testcontainers. Cria um database novo e aplica as migrations.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const base = process.env.TEST_DATABASE_URL;
  let adminUrl: string;
  let stopContainer: () => Promise<void> = async () => {};

  if (base) {
    adminUrl = base;
  } else {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16-alpine').start();
    adminUrl = container.getConnectionUri();
    stopContainer = async () => {
      await container.stop();
    };
  }

  const dbName = `vetta_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();

  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  const url = u.toString();
  migrate(url);

  return {
    url,
    stop: async () => {
      const a = new PrismaClient({ datasourceUrl: adminUrl });
      await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
      await a.$disconnect();
      await stopContainer();
    },
  };
}

export function migrate(url: string) {
  const bin = path.join(
    PACKAGE_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  execFileSync(bin, ['migrate', 'deploy'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
