import { envBool, parseEnv, SharedEnvSchema } from '@vetta/server';
import { z } from 'zod';

export const WorkerEnvSchema = SharedEnvSchema.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  MEDIA_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  CLAMAV_ENABLED: envBool(false),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  VIDEO_PROVIDER: z.enum(['local', 'cloudflare', 'mux']).default('local'),
  FFMPEG_PATH: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_STREAM_TOKEN: z.string().optional(),
  CLOUDFLARE_STREAM_SUBDOMAIN: z.string().optional(),
  MUX_TOKEN_ID: z.string().optional(),
  MUX_TOKEN_SECRET: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.CLAMAV_ENABLED) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLAMAV_ENABLED'],
      message: 'antivírus é obrigatório em produção',
    });
  }
  if (
    env.VIDEO_PROVIDER === 'cloudflare' &&
    !(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_STREAM_TOKEN && env.CLOUDFLARE_STREAM_SUBDOMAIN)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLOUDFLARE_STREAM_TOKEN'],
      message: 'credenciais do Cloudflare Stream ausentes',
    });
  }
  if (env.VIDEO_PROVIDER === 'mux' && !(env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['MUX_TOKEN_ID'],
      message: 'credenciais do Mux ausentes',
    });
  }
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export const loadWorkerEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(WorkerEnvSchema, source, 'apps/worker');
