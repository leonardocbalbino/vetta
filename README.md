# Vetta

> Seu método. Seu aluno. Sua evolução.

SaaS multi-tenant de gestão de treino para personal trainers. Especificação completa em [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 22 LTS (`.nvmrc`) com Corepack habilitado (`corepack enable`)
- pnpm (a versão é fixada em `package.json#packageManager`)
- Docker com Docker Compose
- Para o app mobile: Expo Go ou um emulador Android/iOS

## Subir o ambiente em 3 comandos

```bash
pnpm i
docker compose up -d
pnpm dev
```

O `pnpm dev` cria os arquivos `.env` a partir dos `.env.example` (sem sobrescrever), aplica as migrations e sobe API, worker e os três apps web.

Dados de exemplo (opcional): `pnpm db:seed`. Todos os usuários usam a senha `Vetta@2026dev`:

| Perfil                               | E-mail                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| Super admin (2FA no primeiro acesso) | admin@vettafit.dev                                          |
| Personal Free / Pro / Pro Plus       | free@ · pro@ · proplus@vettafit.dev                         |
| Assistente (Pro Plus)                | assistente@vettafit.dev                                     |
| Alunos                               | aluno01 … aluno10@vettafit.dev (aluno01 tem dois personais) |

| Serviço                  | URL                                                |
| ------------------------ | -------------------------------------------------- |
| Web personal + aluno     | http://localhost:3000                              |
| Admin                    | http://localhost:3001                              |
| Site                     | http://localhost:3002                              |
| API + OpenAPI            | http://localhost:4000 · http://localhost:4000/docs |
| Health                   | http://localhost:4000/health                       |
| Mailpit (e-mails de dev) | http://localhost:8025                              |
| Storage S3 (SeaweedFS)   | http://localhost:9000                              |

App mobile: `pnpm dev:mobile`. Num celular físico, ajuste `EXPO_PUBLIC_API_URL` em `apps/mobile/.env` para o IP da sua máquina.

Antivírus (ClamAV, ~1 GB de RAM): `docker compose --profile full up -d clamav` e `CLAMAV_ENABLED=true` em `apps/worker/.env`.

## Comandos

| Comando                                                     | O que faz                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` | Tarefas do Turborepo em todo o monorepo                    |
| `pnpm db:migrate`                                           | Cria uma migration (desenvolvimento)                       |
| `pnpm db:deploy`                                            | Aplica as migrations                                       |
| `pnpm db:seed`                                              | Seed de desenvolvimento (catálogo + dados de exemplo)      |
| `pnpm --filter @vetta/db seed:catalog`                      | Só catálogo, planos e templates (seguro em produção)       |
| `pnpm --filter @vetta/db rls:generate`                      | Gera a migration de RLS após criar tabelas com `tenant_id` |

Os testes usam Postgres, Redis e S3 reais. Sem variáveis, sobem via Testcontainers (requer Docker). Para reaproveitar o compose:

```bash
TEST_DATABASE_URL=postgresql://vetta:vetta@localhost:5432/vetta \
TEST_REDIS_URL=redis://localhost:6379/1 \
TEST_S3_ENDPOINT=http://localhost:9000 pnpm test
```

## Mapa do monorepo

```
apps/
  api        NestJS 11 — REST /v1, OpenAPI em /docs, Socket.IO em /ws
  worker     BullMQ — eventos → notificações, entregas, mídia, jobs agendados
  web        Next.js 15 — personal + aluno (app.vettafit.com.br)
  admin      Next.js 15 — painel da plataforma (admin.vettafit.com.br)
  site       Next.js 15 SSG — landing (vettafit.com.br)
  mobile     Expo SDK 58 — modos aluno e personal
packages/
  db         Prisma (schema por domínio), migrations, RLS, tenancy, seed
  contracts  Zod: DTOs, enums, catálogo de features, permissões, purposes, eventos
  server     Backend compartilhado: providers (S3, vídeo, e-mail, push), notificações, jobs
  sdk        Cliente HTTP tipado + hooks React (useEntitlements, useFeature) + upload
  ui         Componentes web (shadcn/Radix) com os tokens da marca
  ui-native  Componentes React Native com os mesmos tokens
  tokens     Design tokens → CSS variables, preset Tailwind 4 e objeto RN
  emails     Templates React Email
  config     ESLint, Prettier, tsconfig e preset Tailwind
  fitness    Cálculos puros (IMC, RCQ, 1RM, volume), 100% testados
```

## Documentação

- [Arquitetura](docs/architecture.md)
- [Variáveis de ambiente](docs/env.md)
- [Decisões (ADRs)](docs/adr)
- [Planos de fase](docs/plans)

## Fluxo de trabalho

Branches `feat/fase-x-…`, commits em Conventional Commits (validados pelo commitlint), Prettier no pre-commit e CI (lint, typecheck, build e testes) em todo PR.
