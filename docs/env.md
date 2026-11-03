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

### Pagamentos e NFS-e (Fase 2)

| Variável                             | Padrão                             | Uso                                                                                   |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `ASAAS_BASE_URL`                     | `https://api-sandbox.asaas.com/v3` | Gateway. A URL de produção só é aceita com `NODE_ENV=production`.                     |
| `ASAAS_API_KEY`                      | —                                  | Chave da conta Vetta (sandbox no desenvolvimento). Sem ela, pagamentos respondem 503. |
| `ASAAS_WEBHOOK_TOKEN`                | —                                  | Token dos webhooks (mín. 16 caracteres), também gravado nas subcontas.                |
| `ASAAS_PLATFORM_WALLET_ID`           | —                                  | Carteira da Vetta que recebe a taxa no split.                                         |
| `NFEIO_API_KEY` · `NFEIO_COMPANY_ID` | —                                  | Emissão de NFS-e. Sem elas, as notas ficam `PENDING_CONFIG`.                          |
| `NFEIO_CITY_SERVICE_CODE`            | `0107`                             | Código do serviço na prefeitura (confirmar com a contabilidade).                      |

### Pro Plus (Fase 3)

Sem credenciais, cada integração responde 503 com código próprio, e o resto do app funciona.

| Variável                                                     | Padrão                                                                                                 | Uso                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`                                                | Groq se houver `GROQ_API_KEY`, senão Anthropic                                                         | `groq` ou `anthropic`.                                                                                                  |
| `GROQ_API_KEY` · `GROQ_BASE_URL`                             | — · `https://api.groq.com/openai/v1`                                                                   | IA de treino pela Groq (console.groq.com/keys). No plano grátis há limite por minuto: a API espera e tenta de novo.     |
| `ANTHROPIC_API_KEY`                                          | —                                                                                                      | IA de treino pela Anthropic. Sem nenhuma chave: `AI_NOT_CONFIGURED`.                                                    |
| `AI_MODEL`                                                   | `openai/gpt-oss-20b` (Groq; `openai/gpt-oss-120b` para mais qualidade) · `claude-opus-5-5` (Anthropic) | Modelo usado nas gerações.                                                                                              |
| `AI_EFFORT`                                                  | `medium`                                                                                               | `low` … `max`. Equilibra qualidade e custo.                                                                             |
| `AI_REFUSAL_FALLBACK`                                        | `true`                                                                                                 | Se o modelo recusar, o servidor da Anthropic repete em outro modelo (só nos modelos que aceitam o recurso).             |
| `AI_PRICE_INPUT_PER_MTOK` · `AI_PRICE_OUTPUT_PER_MTOK`       | tabela interna                                                                                         | Sobrescrevem o preço (US$ por milhão de tokens) usado na estimativa de custo.                                           |
| `WHATSAPP_BASE_URL`                                          | `https://graph.facebook.com/v21.0`                                                                     | Cloud API da Meta ou endpoint compatível do BSP.                                                                        |
| `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID`                | —                                                                                                      | Envio de templates aprovados (worker).                                                                                  |
| `SMS_PROVIDER`                                               | `textbee`                                                                                              | Reserva quando o admin não tem provedor de SMS ligado (Integrações). `textbee` ou `twilio`.                             |
| `TEXTBEE_API_KEY` · `TEXTBEE_DEVICE_ID` · `TEXTBEE_BASE_URL` | — · — · `https://api.textbee.dev/api/v1`                                                               | SMS via textbee (chip de um Android). Sem `DEVICE_ID`, usa o aparelho padrão da conta.                                  |
| `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_FROM`   | —                                                                                                      | SMS só para segurança. `TWILIO_FROM` aceita número ou Messaging Service (`MG…`).                                        |
| `CLOUDFLARE_ZONE_ID` · `CLOUDFLARE_SAAS_TOKEN`               | —                                                                                                      | Cloudflare for SaaS: custom hostnames e certificados. Sem eles: `INTEGRATION_NOT_CONFIGURED`.                           |
| `CUSTOM_DOMAIN_TARGET`                                       | `custom.vettafit.com.br`                                                                               | Destino do CNAME mostrado ao personal.                                                                                  |
| `GOOGLE_OAUTH_CLIENT_ID` · `GOOGLE_OAUTH_CLIENT_SECRET`      | —                                                                                                      | Google Calendar. Redirect: `{APP_API_URL}/v1/integrations/google/callback`. Webhook: `/v1/integrations/google/webhook`. |

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

| App    | Variáveis                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web    | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`                                                                                                                                                                                                  |
| admin  | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL` (destino da impersonação)                                                                                                                                                                                                  |
| site   | `NEXT_PUBLIC_APP_URL`, `API_URL` (preços e documentos legais no build/ISR; sem API usa o seed), `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` (só carregam após consentimento), `NEXT_PUBLIC_SHOW_PLACEHOLDERS` (depoimentos ilustrativos; nunca `true` em produção) |
| mobile | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (login Google), `EAS_PROJECT_ID` (push e EAS Update, lido em `app.config.ts`)                                                                                                              |

### Novas na Fase 2

- **Site:** `NEXT_PUBLIC_API_URL`, a URL da API vista pelo navegador no checkout da página de vendas.
- **Mobile:** `EXPO_PUBLIC_EXTERNAL_CHECKOUT_IOS` e `EXPO_PUBLIC_EXTERNAL_CHECKOUT_ANDROID` (padrão `false`; ver ADR-010).

## Testes

`TEST_DATABASE_URL`, `TEST_REDIS_URL` e `TEST_S3_ENDPOINT` são opcionais. Sem elas, os testes sobem os serviços via Testcontainers.
