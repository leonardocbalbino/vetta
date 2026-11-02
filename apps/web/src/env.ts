import { z } from 'zod';

/** Variáveis públicas validadas no build e na inicialização (falha com mensagem clara). */
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:4000'),
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

const raw = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
};

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuração inválida em apps/web (veja .env.example):\n${lines}`);
}

export const env = parsed.data;
