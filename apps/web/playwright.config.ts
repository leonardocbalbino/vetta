import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do fluxo principal. Precisa de Postgres e Redis (docker compose ou serviços do CI)
 * com migrations e seed aplicados; sobe a API compilada e o web em modo produção.
 */
const apiEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  PORT: '4000',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://vetta:vetta@localhost:5432/vetta',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  APP_WEB_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'vetta-media',
  S3_ACCESS_KEY_ID: 'vetta',
  S3_SECRET_ACCESS_KEY: 'vetta-s3-secret',
  RATE_LIMIT_PER_MINUTE: '10000',
  AUTH_RATE_LIMIT_PER_MINUTE: '10000',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:4000/health',
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start --port 3000',
      url: 'http://localhost:3000/entrar',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
