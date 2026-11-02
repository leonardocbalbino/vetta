import { envBool, envList, parseEnv, SharedEnvSchema } from '@vetta/server';
import { z } from 'zod';

export const ApiEnvSchema = SharedEnvSchema.extend({
  PORT: z.coerce.number().int().default(4000),
  JWT_ACCESS_SECRET: z.string().min(32, 'use pelo menos 32 caracteres'),
  JWT_ISSUER: z.string().default('https://api.vettafit.com.br'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** Origens extras além de APP_WEB_URL, APP_ADMIN_URL e APP_SITE_URL. */
  CORS_ORIGINS: envList,
  GOOGLE_CLIENT_IDS: envList,
  APPLE_CLIENT_IDS: envList,
  TRUST_PROXY: envBool(false),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(10),
  SWAGGER_ENABLED: envBool(true),
  /** Versões vigentes dos documentos aceitos no cadastro (LGPD). */
  TERMS_VERSION: z.string().default('2026-11'),
  PRIVACY_VERSION: z.string().default('2026-11'),
  HEALTH_CONSENT_VERSION: z.string().default('2026-11'),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export const ENV = Symbol('ENV');

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return parseEnv(ApiEnvSchema, source, 'apps/api');
}
