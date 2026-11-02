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

## Treino e player (Fase 1)

- **Prescrição:** programa → rotinas (A, B, C) → itens → séries. O construtor web envia o programa inteiro em `PUT /v1/programs/:id` e a API reconcilia a árvore numa transação (ids existentes são atualizados, ausentes recebem `deleted_at`). Publicar incrementa `version` e emite `workout.published`.
- **Player:** a lógica é pura e compartilhada em `packages/sdk/src/player.ts` (`buildPlayer`, `nextPosition` com alternância de bi-set/circuito, `toSyncPayload`) e usada pela web e pelo mobile.
- **Offline-first (mobile):** `apps/mobile/src/lib/offline.ts` guarda o treino do dia e o progresso da sessão em SQLite. Sem internet, a sessão finalizada vai para `pending_sessions` e é reenviada ao voltar a conexão. A idempotência vem do `clientSessionId` gerado no aparelho: reenviar a mesma sessão devolve o registro existente.
- **Recordes:** `detectRecords` (`packages/fitness`) compara a sessão com os melhores anteriores (carga máxima, 1RM estimado, volume) e publica `record.achieved`.
- **Feedback:** obrigatório para finalizar. Nota ≤ 2 ou dor marcam a sessão como crítica (`feedback.critical`). A resposta do personal vira mensagem no chat do aluno.

## Avaliações e PDF

As fórmulas (Pollock 3 e 7, Jackson-Pollock, Guedes, Petroski, Faulkner, Durnin-Womersley, IMC, RCQ) vivem em `packages/fitness`, com 100% de cobertura. O PDF é gerado no worker (fila `documents`, `@react-pdf/renderer`) e salvo como mídia `document` do tenant.

## Site

SSG com ISR de 1 h: preços (`GET /v1/plans`) e documentos legais (`GET /v1/legal/:kind`) vêm da API, então o admin altera sem novo deploy. Sem API no build (CI), os preços caem para o seed. GA4 e Meta Pixel só carregam após consentimento por finalidade (banner LGPD versionado em `localStorage`).

## Impersonação (admin → web)

O admin cria a sessão em `POST /v1/admin/impersonations` (motivo obrigatório, auditado) e abre `app…/impersonar#<tokens>`. Os tokens vão no fragmento, que o navegador não envia a servidores; a página grava a sessão e apaga o fragmento. A web mostra o banner de impersonação a partir de `impersonatedBy` em `/me`.

## Pagamentos e assinatura (Fase 2)

- **`PaymentProvider`** (`packages/server/src/payments`):
  - A implementação Asaas é um cliente HTTP real.
  - Sempre aponta para o sandbox fora de produção: a URL de produção é recusada se `NODE_ENV` não for `production`.
  - Sem chave, as rotas de pagamento respondem 503 `PAYMENT_NOT_CONFIGURED`.
- **Assinatura da plataforma** (personal → Vetta):
  - O checkout cria uma fatura com a primeira cobrança: Pix, boleto ou cartão tokenizado.
  - A recorrência no gateway nasce só depois do primeiro pagamento.
  - Upgrade abate o crédito pró-rata; downgrade vale no fim do período.
  - Cupom pode durar N ciclos.
  - **Inadimplência:** carência de 7 dias com avisos D-7, D-1, no dia e na falha do cartão; depois, volta ao FREE com os alunos excedentes arquivados (nada é apagado).
- **NFS-e:** abstração `InvoiceIssuer`, implementação NFE.io. O worker emite as notas das faturas pagas; sem configuração, ficam `PENDING_CONFIG`.
- **Personal → aluno:**
  - Cada personal tem uma subconta no gateway, criada pelo KYC.
  - A cobrança sai pela subconta, com split para a carteira da Vetta (`finance.split_fee_bps`, configurável por plano no admin).
  - O livro-razão `wallet_entries` registra créditos (com data de liberação), estornos e saques.
- **Webhooks** (`POST /v1/webhooks/asaas`):
  - Token `asaas-access-token` comparado em tempo constante.
  - `webhook_events` com chave única por id do evento.
  - O processamento acontece na hora; falhas ficam `FAILED` e o worker reprocessa.
  - O status de uma fatura só avança (eventos fora de ordem não regridem).
  - Datas do Asaas são dias civis de Brasília.
- **Conciliação diária:** cobranças de ontem no gateway (conta da Vetta e subcontas) comparadas com as nossas faturas. As divergências confirmadas são corrigidas pelo mesmo caminho dos webhooks.
- **Regras das lojas:** ver ADR-010.

## Página de vendas (Fase 2)

- **Rota pública:** `vettafit.com.br/p/[slug]` (site, ISR de 5 min, Open Graph gerado com a foto e a chamada do personal).
- **API pública:** `GET /v1/public/pages/:slug`.
  - Sai do ar se o plano perde `brand.sales_page`.
  - As imagens passam por um proxy que só serve a foto, a logo e os antes/depois autorizados pelo aluno.
- **Checkout:** `POST /v1/public/pages/:slug/checkout`. Com o pagamento confirmado, o webhook cria o usuário, o vínculo, a assinatura e a fatura paga, envia o convite e avisa o personal.
- **Sem vaga no plano do personal:** a página não vende (409).

## Agenda, chat e comunicados (Fase 2)

- **Agenda:**
  - Disponibilidade semanal, bloqueios e aulas individuais ou turmas.
  - Recorrência RRULE semanal, materializada em até 26 semanas.
  - Política de antecedência para agendar e cancelar.
  - Lembretes de 24 h e 1 h no worker.
- **Chat:**
  - Mesmo Socket.IO das notificações (`chat:message`, `chat:read`, `chat:typing`).
  - Mensagens idempotentes por `clientId`.
  - Mídia via upload `chat_media` (`comms.chat_media`; o FREE só envia texto).
  - Responder um feedback envia a mensagem com a citação do treino.
- **Comunicados:**
  - Público: todos, grupo ou filtro.
  - Envio imediato ou agendado.
  - Os canais escolhidos viram filtro na regra de notificação.
  - Taxa de abertura = notificações in-app lidas sobre destinatários.

## Periodização (Fase 2)

- **Regras:** `packages/fitness/periodization.ts` (linear, ondulatória, blocos, deload).
- **API:** devolve o calendário semana a semana.
- **Treino do dia:** já vem ajustado (séries, reps e carga) pela semana atual.
- **Troca de fase:** o worker publica o programa da nova fase na data. É idempotente: publica o aviso antes de marcar a fase ativa.
