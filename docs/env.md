# Variáveis de ambiente

Cada app tem um `.env.example`. Na inicialização, o app valida as variáveis com um schema Zod e, se houver erro, aborta listando todas as variáveis com problema. Valores vazios (`FOO=`) contam como ausentes. Nenhum segredo vai para o código.

## Compartilhadas (api e worker): `packages/server/src/env.ts`

| Variável                                                                                        | Obrigatória       | Descrição                                              |
| ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| `NODE_ENV`                                                                                      | não               | `development` · `test` · `production`                  |
| `LOG_LEVEL`                                                                                     | não               | `silent` … `trace` (padrão `info`)                     |
| `DATABASE_URL`                                                                                  | sim               | Postgres                                               |
| `REDIS_URL`                                                                                     | sim               | Redis (filas, cache, rate limit, Socket.IO)            |
| `APP_ENCRYPTION_KEY`                                                                            | sim               | 32 bytes em base64; cifra segredos TOTP e tokens OAuth |
| `APP_WEB_URL` · `APP_ADMIN_URL` · `APP_SITE_URL` · `APP_API_URL`                                | não               | URLs públicas (CORS, links de e-mail)                  |
| `S3_ENDPOINT` · `S3_PUBLIC_ENDPOINT`                                                            | dev               | Endpoint S3; o público é o usado nas URLs assinadas    |
| `S3_REGION` · `S3_BUCKET` · `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` · `S3_FORCE_PATH_STYLE` | sim               | Cloudflare R2 em produção                              |
| `EMAIL_PROVIDER`                                                                                | não               | `smtp` (Mailpit) ou `resend`                           |
| `EMAIL_FROM` · `SMTP_URL` · `RESEND_API_KEY`                                                    | conforme provider |                                                        |
| `EXPO_ACCESS_TOKEN`                                                                             | não               | Expo Push                                              |
| `SENTRY_DSN`                                                                                    | não               |                                                        |

## API (`apps/api/src/config/env.ts`)

| Variável                                                       | Padrão                      | Descrição                             |
| -------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| `PORT`                                                         | 4000                        |                                       |
| `JWT_ACCESS_SECRET`                                            | —                           | Mínimo de 32 caracteres               |
| `JWT_ISSUER`                                                   | https://api.vettafit.com.br |                                       |
| `ACCESS_TOKEN_TTL_SECONDS`                                     | 900                         | Access token de 15 min                |
| `REFRESH_TOKEN_TTL_DAYS`                                       | 30                          | Sessão deslizante                     |
| `CORS_ORIGINS`                                                 | —                           | Origens extras (vírgula)              |
| `GOOGLE_CLIENT_IDS` · `APPLE_CLIENT_IDS`                       | —                           | Audiences aceitas no login social     |
| `TRUST_PROXY`                                                  | false                       | `true` atrás de load balancer         |
| `RATE_LIMIT_PER_MINUTE` · `AUTH_RATE_LIMIT_PER_MINUTE`         | 300 · 10                    | Por usuário, ou por IP quando anônimo |
| `SWAGGER_ENABLED`                                              | true                        | `/docs`                               |
| `TERMS_VERSION` · `PRIVACY_VERSION` · `HEALTH_CONSENT_VERSION` | 2026-11                     | Versões gravadas em `consents`        |

## Worker (`apps/worker/src/env.ts`)

| Variável                                                                            | Padrão                   | Descrição                               |
| ----------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- |
| `WORKER_CONCURRENCY` · `MEDIA_CONCURRENCY`                                          | 4 · 2                    |                                         |
| `CLAMAV_ENABLED` · `CLAMAV_HOST` · `CLAMAV_PORT`                                    | false · localhost · 3310 | Obrigatório em produção                 |
| `VIDEO_PROVIDER`                                                                    | local                    | `local` (ffmpeg), `cloudflare` ou `mux` |
| `CLOUDFLARE_ACCOUNT_ID` · `CLOUDFLARE_STREAM_TOKEN` · `CLOUDFLARE_STREAM_SUBDOMAIN` | —                        | Com `cloudflare`                        |
| `MUX_TOKEN_ID` · `MUX_TOKEN_SECRET`                                                 | —                        | Com `mux`                               |
| `FFMPEG_PATH`                                                                       | ffmpeg-static            |                                         |

## Front-ends

| App    | Variáveis                                                              |
| ------ | ---------------------------------------------------------------------- |
| web    | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN` |
| admin  | `NEXT_PUBLIC_API_URL`                                                  |
| site   | `NEXT_PUBLIC_APP_URL`                                                  |
| mobile | `EXPO_PUBLIC_API_URL`                                                  |

## Testes

`TEST_DATABASE_URL`, `TEST_REDIS_URL` e `TEST_S3_ENDPOINT` são opcionais. Sem elas, os testes sobem os serviços via Testcontainers.
