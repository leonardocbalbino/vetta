import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Variáveis do ambiente têm prioridade; o .env da raiz é o fallback local.
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'schema', 'migrations'),
    seed: 'tsx src/seed/index.ts',
  },
});
