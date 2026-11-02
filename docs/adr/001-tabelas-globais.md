# ADR-001 — Tabelas globais e tabelas por tenant

**Status:** aceito (Fase 0)

## Contexto

O CLAUDE.md pede `tenant_id` em toda tabela de negócio. Mas o mesmo usuário pode ser aluno de vários personais, e a equipe da plataforma não pertence a nenhum tenant.

## Decisão

- **Globais (sem `tenant_id`):** `users`, `user_identities`, `admin_users`, `sessions`, `refresh_tokens`, `devices`, `plans`, `features`, `plan_features`, `plan_prices`, `coupons`, `academy_*`, `notification_preferences`.
- **De sistema com `tenant_id` opcional, fora do RLS** (acessadas só pelo cliente de sistema): `consents`, `audit_logs`, `auth_tokens`, `notifications`, `delivery_logs`, `notification_templates`.
- **Mistas** (`tenant_id` nulo = conteúdo da plataforma, legível por todos e gravável só pela plataforma): `exercises`, `anamnesis_templates`, `media`.
- **Todas as demais** (44 tabelas, mais `tenants`) têm `tenant_id` obrigatório e RLS.

## Consequências

O vínculo aluno x personal fica em `student_links`. O seletor de vínculo usa `GET /v1/me` (memberships) e o header `X-Tenant-Id`.
