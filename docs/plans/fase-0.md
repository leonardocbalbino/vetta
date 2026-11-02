# Fase 0 – Fundação

Branch: `feat/fase-0-fundacao`

## Objetivo

Entregar a base sobre a qual todos os módulos serão construídos: monorepo, design system, schema completo do banco com isolamento por tenant, API base com autenticação/autorização, planos e entitlements, upload e notificações. Critério de pronto: CI verde, `pnpm dev` sobe tudo, seed funciona, `/docs` lista as rotas.

## Versões fixadas

Node 22 LTS, pnpm (corepack), Turborepo 2, TypeScript 5.9 (o TS 7 nativo ainda não é suportado pelo Next 15/typescript-eslint), NestJS 11, Prisma 6.19, PostgreSQL 16, Redis 7, BullMQ 5, Zod 4, Next.js 15.5, React 19, Tailwind 4, Expo SDK 58 (atual), Vitest 3, ESLint 9.

## Passos

1. **Monorepo** (0.1): workspace pnpm, turbo.json, packages/config (eslint flat, prettier, tsconfig base/next/nest/lib, preset tailwind), husky + lint-staged + commitlint, docker-compose (postgres, redis, minio + bucket, mailpit, clamav), `.env.example` por app com schema Zod, CI GitHub Actions, README.
2. **Tokens e UI** (0.2): packages/tokens (TS → CSS variables, preset Tailwind 4 via `@theme`, objeto RN), packages/ui (shadcn/Radix tematizado + componentes listados), packages/ui-native, fontes.
3. **Banco** (0.3): schema Prisma multi-arquivo por domínio (identidade, planos, mídia/notificações, biblioteca, treinos, avaliações, progresso, chat, agenda, financeiro, marca, documentos, academy), migration inicial, migration RLS, extensão de tenancy, seed.
4. **API base** (0.4): módulos auth, users, tenants, plans, entitlements, uploads, notifications, audit, health; nestjs-zod, filtro de erros, OpenAPI em `/docs`, prefixo `/v1`, pino com request id, Sentry.
5. **Auth** (0.5): cadastro de personal com trial, verificação de e-mail, senha, Google/Apple (validação do ID token via JWKS), magic link, recuperação de senha, convite de aluno, JWT 15 min + refresh rotativo com detecção de reuso, sessões, 2FA TOTP, guard único, X-Tenant-Id, impersonação.
6. **Entitlements** (0.6): resolve com cache Redis versionado, `/v1/me/entitlements`, 402 FEATURE_LOCKED/LIMIT_REACHED com `requiredPlan`, jobs de trial e overrides, hooks no sdk.
7. **Upload** (0.7): purposes em contracts, endpoints, StorageProvider S3 (R2/MinIO), VideoProvider (local ffmpeg em dev; Cloudflare Stream e Mux como implementações de produção), worker de mídia, Uploader web, `useUpload` mobile com fila offline, jobs de limpeza.
8. **Notificações** (0.8): event bus (EventEmitter2 + fila BullMQ), NotificationService no worker com regras declarativas, canais in-app/push/e-mail (WhatsApp/SMS como interfaces), preferências, silêncio, delivery logs com retry, endpoints, agendador.
9. **Testes** (0.9): isolamento entre tenants (todas as tabelas com tenant_id), matriz de permissões, upload ponta a ponta com MinIO, notificações com preferência e silêncio, rotação/reuso de refresh token.
10. **Docs**: arquitetura, ADRs, variáveis de ambiente, como rodar; resumo da fase.

## Decisões (detalhadas em docs/adr)

- **ADR-001 Tabelas globais vs. tenant.** `users`, `admin_users`, `tenants`, `sessions`, `devices`, `plans`, `features`, `notifications` e afins são globais (o usuário é global porque pode ser aluno de vários personais). Todas as tabelas de negócio têm `tenant_id` + RLS. Tabelas mistas (biblioteca de exercícios, mídia) aceitam `tenant_id` nulo = conteúdo da plataforma, legível por todos e gravável só pela plataforma.
- **ADR-002 RLS por troca de papel.** A migration cria os papéis `vetta_tenant` (sujeito às policies por `app.tenant_id`) e `vetta_platform` (policy `USING (true)`, usada pelos endpoints de admin). O cliente de tenant executa cada query em transação com `SET LOCAL ROLE vetta_tenant` + `set_config('app.tenant_id', …, true)`. O cliente de sistema (dono das tabelas) é usado só por auth, workers e seed. Não exige superusuário em produção (apenas CREATEROLE na primeira migration).
- **ADR-003 Prisma 6** em vez do 7 (que exige driver adapters e gera código ESM): menor risco agora; migração planejada.
- **ADR-004 Refresh token opaco** (32 bytes, hash SHA-256) com tabela de tokens por sessão; reuso de token já rotacionado revoga a sessão inteira. Access JWT HS256 de 15 min com `sid`; revogação imediata via Redis.
- **ADR-005 Detecção de tipo própria** (assinaturas de bytes) no worker, sem depender de pacote ESM-only.
- **ADR-006 Pacote extra `packages/server`** com código de backend compartilhado entre api e worker (env, providers de storage/vídeo/e-mail/push, filas, regras de notificação), para não duplicar código.
- **ADR-007 Domínio único `vettafit.com.br`** (raiz = site; app., admin., api., cdn.).

## Fora do escopo desta fase

Telas de produto (só shells com login e demonstração de entitlements/upload), implementação real de WhatsApp/SMS (interfaces), Pagar.me, IA.

## Riscos

- Expo SDK 58 em monorepo pnpm: build do mobile no CI será `typecheck` + `expo export` só sob demanda (EAS em fase posterior).
- ClamAV consome ~1 GB de RAM; no compose fica no profile `full` e o worker trata ausência conforme `CLAMAV_ENABLED`.

## Status da execução

Concluída. Durante a execução surgiram três desvios do plano:

- **ADR-008:** a MinIO deixou de publicar imagens; o storage local é o SeaweedFS (compatível com S3).
- **ADR-009:** versões fixadas e `expo-av` descontinuado (usamos `expo-video`).
- **Permissões:** o assistente não convida, arquiva nem reativa alunos (gestão da carteira é do personal), conforme `can()` em `@vetta/contracts`.
