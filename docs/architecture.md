# Arquitetura

## Visão geral

```
 web / admin / site (Next.js)      mobile (Expo)
            │  @vetta/sdk (HTTP tipado, refresh automático, X-Tenant-Id)
            ▼
        apps/api (NestJS)  ── Socket.IO /ws (sino em tempo real)
   guard único · Zod · OpenAPI        │
      │            │                  │ Redis adapter
      │ Prisma     │ BullMQ           │
      ▼            ▼                  ▼
  PostgreSQL 16   Redis 7  ◄────  apps/worker (BullMQ)
   (RLS)                         eventos → NotificationService → canais
                                 mídia (magic number, EXIF, WEBP, HLS, ClamAV)
                                 agendador (trial, overrides, limpeza, recibos push)
            ▲
   Storage S3 (R2 em produção) ◄── upload direto do cliente por URL assinada
```

Nenhum front-end acessa o banco. Todos usam a mesma API versionada (`/v1`).

## Multi-tenant (CLAUDE.md §8)

**Camada (a): aplicação.** `forTenant(prisma, tenantId)` (packages/db/src/tenancy.ts) injeta `tenant_id` em todo `where`/`data` e executa cada operação numa transação com `SET LOCAL ROLE vetta_tenant` e `app.tenant_id`. Para várias operações atômicas, use `$tenantTransaction`.

**Camada (b): banco.** A migration de RLS (gerada por `rls:generate`) habilita RLS em toda tabela com `tenant_id`. Cada tabela recebe três policies:

- `tenant_isolation` para `vetta_tenant`: `tenant_id = app_current_tenant()`, com `WITH CHECK`;
- `platform_access` para `vetta_platform`: acesso total, usado só pelas rotas de admin;
- `shared_read`: leitura de linhas com `tenant_id` nulo (biblioteca global, anamneses prontas).

Tabelas sensíveis (sessions, refresh_tokens, auth_tokens, admin_users etc.) têm `REVOKE` para `vetta_tenant`.

**Prova automatizada.** `packages/db/src/isolation.test.ts` cria dois tenants com linhas em todas as 44 tabelas de negócio. Para cada tabela, verifica que B não lê, não altera e não apaga linhas de A, pelo ORM e por SQL bruto, e que não consegue mover linhas para A. Um meta-teste falha se surgir uma tabela com `tenant_id` sem RLS ou sem fixture.

Clientes de banco na API (`PrismaService`):

| Cliente      | Uso                                                       |
| ------------ | --------------------------------------------------------- |
| `tenant(id)` | Todo acesso de usuário a dados de negócio                 |
| `platform`   | Painel admin (auditado)                                   |
| `system`     | Auth, consultas globais, jobs (dono das tabelas, sem RLS) |

## Autorização: guard único

`AccessGuard` (apps/api/src/access) aplica as checagens nesta ordem:

1. Autenticação (JWT): 401 se falhar.
2. Tenant ativo (`X-Tenant-Id` validado contra vínculos): 404 se não houver vínculo, 400 `TENANT_REQUIRED` se o header faltar.
3. `can(papel, ação, recurso)`, definido em `@vetta/contracts`: 403 se negado.
4. `@RequireFeature`: 402 `FEATURE_LOCKED`.
5. `@AssertLimit`: 402 `LIMIT_REACHED`.

As respostas 402 trazem `details.requiredPlan`. O escopo (`all`, `assigned` ou `own`) fica em `req.tenantAccess.scope` para os serviços filtrarem: o assistente só vê os alunos atribuídos e o aluno, só os próprios dados.

`apps/api/test/permissions.e2e.test.ts` testa toda rota do OpenAPI com cada papel. Uma rota nova sem teste quebra o CI.

## Planos e entitlements

`resolve(tenant)` segue a ordem override do tenant (não expirado), valor do plano e padrão do catálogo. O cache fica no Redis, com chave versionada (`ent:{versão}:{tenant}`):

- quando o admin altera um plano, a versão é incrementada (invalida todos os tenants);
- quando altera um override, só a chave do tenant é apagada;
- o TTL nunca passa da expiração do override mais próximo.

Trial vencido sem o job ter rodado já resolve como FREE. O job `expireTrials` muda o plano para FREE e arquiva os alunos excedentes que estão há mais tempo sem treinar. Nada é apagado.

## Upload (CLAUDE.md §9)

1. `POST /v1/uploads` valida papel, purpose, MIME declarado, tamanho, feature do plano e cota. A cota é reservada de forma atômica, em SQL. Acima de 20 MB, o upload é multipart.
2. O cliente envia direto ao storage. `GET /v1/uploads/:id` informa as partes já recebidas e devolve URLs novas para as que faltam (retomada).
3. `POST /v1/uploads/:id/complete` confere partes e tamanho e enfileira o processamento.
4. O worker executa o pipeline: magic number → antivírus → EXIF/WEBP/thumbnail ou HLS/thumbnail/GIF → a reserva vira uso → `media.ready` ou `media.failed`.
5. A leitura é sempre por URL assinada de 15 minutos. A exclusão é lógica; a física acontece em 30 dias, e pendentes órfãos são limpos a cada 24 h.

## Notificações (CLAUDE.md §10)

Os módulos apenas publicam eventos (`EventPublisher` → fila `domain-events`). O worker roda `dispatchEvent`, que segue as regras declarativas de `packages/server/src/notifications/rules.ts`: destinatários, canais, agrupamento e atraso.

A decisão por canal é a função pura `decideDelivery`, que considera:

- preferências por categoria e canal;
- horário de silêncio no fuso do usuário (exceto segurança e eventos imediatos);
- plano (WhatsApp só no Pro Plus);
- canal permitido (SMS só para segurança).

O in-app é gravado e emitido na hora via Socket.IO. Os canais externos viram `delivery_logs` e jobs com retry exponencial. Tokens push inválidos são removidos, e todo push carrega deep link (`vetta://…`).

## Observabilidade

- Logs: pino com `x-request-id` propagado e campos sensíveis mascarados.
- Erros e traces: Sentry na API (`instrument.ts`), no worker e na web, ativado por DSN.
- Saúde: `/health` checa banco, Redis e storage.
