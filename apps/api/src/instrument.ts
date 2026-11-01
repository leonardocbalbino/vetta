/**
 * Precisa ser o primeiro import do main.ts: inicializa o Sentry (que também
 * configura o OpenTelemetry para traces) antes de qualquer outro módulo.
 */
import * as Sentry from '@sentry/nestjs';

// Carrega apps/api/.env em desenvolvimento (variáveis já definidas no ambiente têm prioridade).
try {
  process.loadEnvFile('.env');
} catch {
  // sem .env: usa apenas o ambiente
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RELEASE_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
  });
}
