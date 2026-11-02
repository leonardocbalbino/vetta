// Cria os arquivos .env de desenvolvimento a partir dos .env.example (nunca sobrescreve).
import { copyFileSync, existsSync } from 'node:fs';

const pairs = [
  ['.env.example', '.env'],
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/worker/.env.example', 'apps/worker/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
  ['apps/admin/.env.example', 'apps/admin/.env.local'],
  ['apps/site/.env.example', 'apps/site/.env.local'],
  ['apps/mobile/.env.example', 'apps/mobile/.env'],
];
for (const [from, to] of pairs) {
  if (existsSync(from) && !existsSync(to)) {
    copyFileSync(from, to);
    console.log(`criado ${to}`);
  }
}
