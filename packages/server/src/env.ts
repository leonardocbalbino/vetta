import { z } from 'zod';

/**
 * Valida variáveis de ambiente na inicialização. Em caso de erro, lista todas
 * as variáveis inválidas/ausentes e aborta com mensagem clara.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
  appName = 'app',
): z.infer<S> {
  // Variáveis vazias (FOO=) contam como ausentes.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;
  const lines = result.error.issues.map((i) => {
    const key = i.path.join('.') || '(raiz)';
    const value = i.path.length ? source[String(i.path[0])] : undefined;
    return `  • ${key}: ${value === undefined ? 'ausente' : i.message}`;
  });
  throw new Error(
    `Configuração inválida em ${appName}. Corrija o .env (veja .env.example):\n${lines.join('\n')}`,
  );
}

/** "true"/"1"/"yes" → true. */
export const envBool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .optional()
    .transform((v) => (v === undefined ? def : ['true', '1', 'yes'].includes(v)));

/** Lista separada por vírgula. */
export const envList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Blocos de variáveis reutilizados por api e worker. */
export const SharedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  SENTRY_DSN: z.url().optional(),
  /** Chave de 32 bytes (base64) para cifrar segredos em repouso (TOTP, tokens OAuth). */
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'precisa ter 32 bytes em base64'),
  APP_WEB_URL: z.url().default('http://localhost:3000'),
  APP_ADMIN_URL: z.url().default('http://localhost:3001'),
  APP_SITE_URL: z.url().default('http://localhost:3002'),
  APP_API_URL: z.url().default('http://localhost:4000'),

  S3_ENDPOINT: z.url().optional(),
  /** Endpoint usado nas URLs pré-assinadas (o navegador precisa alcançá-lo). */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: envBool(true),

  EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  EMAIL_FROM: z.string().default('Vetta <nao-responda@vettafit.com.br>'),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  RESEND_API_KEY: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
});
export type SharedEnv = z.infer<typeof SharedEnvSchema>;
