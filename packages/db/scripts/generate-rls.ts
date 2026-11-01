/**
 * Gera uma migration com as policies de RLS para todas as tabelas com tenant_id.
 * Uso: pnpm --filter @vetta/db rls:generate [nome]
 * Rode sempre que criar uma tabela de negócio nova (o SQL é idempotente).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildRlsSql } from '../src/rls-sql';

const name = process.argv[2] ?? 'rls';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const dir = path.resolve(__dirname, '../prisma/schema/migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'migration.sql'), buildRlsSql());
console.warn(`Migration de RLS gerada em ${dir}`);
