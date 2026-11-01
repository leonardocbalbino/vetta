# ADR-002 — RLS por troca de papel na transação

**Status:** aceito (Fase 0)

## Decisão

A primeira migration de RLS cria dois papéis `NOLOGIN`:

- `vetta_tenant`: sujeito às policies de `app.tenant_id`;
- `vetta_platform`: policy `USING (true)`.

O cliente de tenant executa `set_config('role','vetta_tenant',true)` e `set_config('app.tenant_id',…,true)` dentro de cada transação, então o efeito dura só aquela transação.

O usuário de conexão é o dono das tabelas (sem `FORCE ROW LEVEL SECURITY`) e só é usado diretamente por auth, jobs e seed.

## Por quê

- Uma única connection pool, sem `SET` vazando entre requisições.
- Não exige superusuário em produção, apenas `CREATEROLE` na primeira migration.
- Escritas cruzadas são barradas pelo `WITH CHECK`, mesmo com bug na camada de aplicação.

## Riscos

Esquecer o cliente de tenant e usar o de sistema numa rota de usuário. Mitigações:

- o `PrismaService` deixa explícito qual cliente está em uso (`tenant()`, `platform`, `system`);
- a matriz de permissões cobre todas as rotas.
