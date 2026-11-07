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

  /** Gateway: sempre o sandbox fora de produção (a URL de produção é recusada). */
  ASAAS_BASE_URL: z.url().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(16).optional(),
  ASAAS_PLATFORM_WALLET_ID: z.string().optional(),
  NFEIO_API_KEY: z.string().optional(),
  NFEIO_COMPANY_ID: z.string().optional(),
  NFEIO_CITY_SERVICE_CODE: z.string().default('0107'),

  /**
   * IA de treino (Fase 3). Sem chave, as rotas de IA respondem 503. AI_PROVIDER escolhe;
   * sem ele, usa a Groq se houver GROQ_API_KEY, senão a Anthropic.
   */
  AI_PROVIDER: z.enum(['groq', 'anthropic']).optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.url().default('https://api.groq.com/openai/v1'),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Padrão: openai/gpt-oss-20b na Groq, claude-opus-5-5 na Anthropic. */
  AI_MODEL: z.string().optional(),
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  AI_REFUSAL_FALLBACK: envBool(true),
  AI_PRICE_INPUT_PER_MTOK: z.coerce.number().positive().optional(),
  AI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().positive().optional(),

  /** WhatsApp Cloud API (Meta) ou BSP compatível. */
  WHATSAPP_BASE_URL: z.url().default('https://graph.facebook.com/v21.0'),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  /** SMS (só segurança): textbee.dev (padrão) ou Twilio. */
  SMS_PROVIDER: z.enum(['textbee', 'twilio']).default('textbee'),
  TEXTBEE_API_KEY: z.string().optional(),
  TEXTBEE_DEVICE_ID: z.string().optional(),
  TEXTBEE_BASE_URL: z.url().default('https://api.textbee.dev/api/v1'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  /** Domínio próprio: Cloudflare for SaaS (custom hostnames). */
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  CLOUDFLARE_SAAS_TOKEN: z.string().optional(),
  CUSTOM_DOMAIN_TARGET: z.string().default('custom.vettafit.com.br'),

  /** Google Calendar (OAuth do personal). */
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
});
export type SharedEnv = z.infer<typeof SharedEnvSchema>;
