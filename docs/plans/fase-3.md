# Fase 3 – Pro Plus

Branch: `feat/fase-3-pro-plus` (criada a partir de `feat/fase-2-pro`, ainda não mergeada).

**Critério de pronto:** um personal Pro Plus gera um treino com IA, revisa e publica, trabalha com um assistente e entrega o app do aluno com a própria marca e domínio.

## Ordem de execução

1. **Regras puras com testes:**
   - contraste WCAG (`packages/tokens`: razão de contraste e sugestão de cor acessível);
   - minimização dos dados de saúde enviados à IA (`packages/server/ai`);
   - métricas de relatórios: coorte, aderência, risco de cancelar (`packages/fitness`).
2. **Schema (migration aditiva + RLS):**
   - IA: gerações, uso e custo;
   - equipe: convites e permissões por assistente; registro de alterações (`change_logs`);
   - marca: cores de destaque, nome de exibição, domínio próprio com status de verificação;
   - WhatsApp: opt-in por usuário;
   - Google Calendar: canais de webhook e vínculo evento↔aula;
   - saúde: amostras importadas do HealthKit/Health Connect;
   - Academy: módulos, aulas, e-books, posts;
   - comunicados da plataforma e entregas;
   - suporte: tickets e mensagens.
3. **Providers (`packages/server`), cada um atrás de uma abstração:**

| Provider               | Implementação                                                  |
| ---------------------- | -------------------------------------------------------------- |
| `AiProvider`           | Anthropic, modelo por `AI_MODEL`                               |
| `CustomDomainProvider` | Cloudflare for SaaS (custom hostnames)                         |
| `WhatsAppProvider`     | API oficial da Meta via BSP configurável (`WHATSAPP_BASE_URL`) |
| `SmsProvider`          | só para códigos de segurança                                   |
| `CalendarProvider`     | Google Calendar                                                |

4. **API:**
   - IA de treino: gerar rascunho, sugerir carga, resumo semanal;
   - equipe;
   - white label e tema público por domínio;
   - domínio próprio;
   - opt-in de WhatsApp;
   - Google Calendar: OAuth, sincronização bidirecional, webhooks;
   - saúde: importar e exportar;
   - exportações CSV/PDF;
   - relatórios avançados;
   - Academy;
   - comunicados da plataforma;
   - suporte.
5. **Worker:**
   - verificação de domínio;
   - sincronização do Google Calendar e renovação de canais;
   - envio de comunicados da plataforma;
   - SLA de tickets.
6. **Telas:**
   - **Web:**
     - IA no construtor;
     - equipe;
     - marca e domínio;
     - integrações;
     - relatórios;
     - exportações;
     - Academy;
     - widget de suporte;
     - tema do personal aplicado ao aluno.
   - **Admin:** custo de IA, Academy, comunicados da plataforma, tickets com SLA.
   - **Site:** central de ajuda em MDX com busca; página de vendas com o tema do personal e domínio próprio.
   - **Mobile:** tema do personal, Apple Health / Health Connect, Academy, IA de resumo para o personal.
7. **Testes:**
   - IA com respostas gravadas (sem chamar a API no CI), só exercícios da biblioteca, nada publicado sem revisão;
   - assistente sem aluno não atribuído e sem financeiro;
   - white label sem vazar o tema de um personal para alunos de outro;
   - matriz de permissões das rotas novas.

## Proteção por feature key

| Recurso                                | Feature key                                                     |
| -------------------------------------- | --------------------------------------------------------------- |
| IA de treino (geração, ajuste, resumo) | `workouts.ai_assistant` + `workouts.ai_monthly` (limite mensal) |
| Equipe                                 | `team.assistants` (limite)                                      |
| White label                            | `brand.white_label`                                             |
| Domínio próprio                        | `brand.custom_domain`                                           |
| WhatsApp                               | `comms.whatsapp`                                                |
| Google Calendar                        | `schedule.google_calendar`                                      |
| Relatórios avançados e exportações     | `finance.advanced_reports` + `reports.exports`                  |
| Integração de saúde                    | `progress.health_integrations`                                  |
| Academy                                | `academy.access` (por conteúdo: plano mínimo)                   |
| Suporte prioritário (SLA menor)        | `support.priority`                                              |

As features novas entram no catálogo com o valor por plano no seed, e o admin pode alterar. A cota mensal de IA vale 0 no FREE, 20 no PRO e 200 no PRO PLUS. O PRO recebe a IA desligada (`workouts.ai_assistant` = false); a cota vale só se o admin ligar a feature.

## Decisões

- **IA:**
  - O modelo vem de `AI_MODEL`.
  - A IA só escolhe exercícios por uma ferramenta de busca na biblioteca do tenant. A saída é validada por Zod, e cada exercício é conferido contra o banco. O erro volta ao modelo para correção; se persistir após 2 tentativas, a geração inteira falha e nada é criado.
  - O resultado vira um programa `DRAFT` com `aiGenerated = true`, aberto no construtor. Publicar continua sendo uma ação explícita do personal.
  - Dados minimizados: sem nome, e-mail, telefone ou documentos. A idade vai em faixa, e as lesões e a anamnese vão como texto com padrões de contato removidos.
  - O custo de cada chamada é estimado pela tabela de preços configurável e gravado em `ai_usages`, visível no admin.
- **Equipe:**
  - As permissões do assistente são granulares (`prescribe`, `assess`, `chat`). Elas restringem o que `can()` já concede ao papel e são checadas no guard.
  - O assistente nunca acessa o financeiro: o papel não tem esse recurso.
- **White label:**
  - O contraste é validado na API: cor primária ≥ 4,5:1 contra o texto e cor de destaque ≥ 3:1 contra o fundo, para elementos gráficos.
  - Cor reprovada não é salva, e a API sugere a variante mais próxima que passa.
  - O tema é resolvido por tenant ativo (app) ou por domínio (site/web) e aplicado em tempo de execução por variáveis CSS e pelo ThemeProvider nativo.
- **Domínio próprio:**
  - O personal informa o domínio, e o sistema mostra o CNAME para `custom.vettafit.com.br`.
  - O provider cria o custom hostname; o worker consulta até ficar `active`, com certificado emitido pelo provider.
  - O app web resolve o tema pelo host no cliente (`GET /v1/public/brand?host=`) e a API libera CORS para domínios ativos (ver ADR-012).
- **WhatsApp:**
  - Só envia com opt-in registrado (em `consents`, tipo `WHATSAPP`).
  - Só com templates aprovados, mapeados por evento.
  - Respeita o horário de silêncio, que o motor de notificações já aplica.
- **SMS:** canal restrito à categoria `SECURITY`.
- **Saúde:**
  - Importação e exportação no app, com permissão explícita por tipo de dado.
  - A API recebe amostras agregadas (passos/dia, FC média, peso, treinos), idempotentes por id da amostra.

## Fora do escopo

- **IA por voz e IA no app do aluno:** a Fase 3 entrega a IA para o personal.
- **Pagar.me:** fica para depois.

## Riscos

- **Credenciais:** sem chaves reais (Anthropic, Meta/BSP, Cloudflare, Google), a validação usa dublês com o contrato documentado de cada API.
- **Apple Health:** só roda em dispositivo iOS com build de desenvolvimento, e o Health Connect só no Android. Não dá para validar sem aparelho.

## Status de execução

Tudo do plano foi implementado. Desvios em relação ao planejado:

- **Exportações:** ficaram sob `finance.advanced_reports`, sem uma feature `reports.exports` separada.
- **Domínio próprio:** resolvido no cliente (sem middleware do Next).
- **IA:** a correção do modelo é tentada até 2 vezes antes de falhar.

### Entregas

| Item                      | Entrega                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 IA                    | `AiProvider`/Anthropic, rascunho com justificativas, ajuste de carga, resumo semanal, cota `workouts.ai_monthly`, custo no admin (ADR-011) |
| 3.2 Equipe                | Convite e aceite, permissões por assistente no guard, atribuição, log de alterações                                                        |
| 3.3 White label           | Cores com AA e sugestão, logo, nome, remetente, tema em web, mobile, e-mail e vendas; domínio via Cloudflare for SaaS (ADR-012)            |
| 3.4 WhatsApp e SMS        | Meta Cloud API/BSP com templates por evento, opt-in em `consents`, silêncio mesmo em imediatos; Twilio só para segurança                   |
| 3.5 Integrações           | Google Calendar bidirecional; HealthKit e Health Connect no app; exportações CSV/PDF                                                       |
| 3.6 Relatórios            | Coorte, aderência, receita por plano, inadimplência, risco de cancelar, exercícios mais prescritos                                         |
| 3.7 Academy e comunicados | Conteúdo por plano com progresso; comunicados da plataforma segmentados com entrega e abertura                                             |
| 3.8 Suporte               | Central de ajuda MDX com busca, widget na web, fila no admin com prioridade e SLA                                                          |
| 3.9 Testes                | IA por respostas gravadas, isolamento do assistente, white label sem vazamento, matriz de permissões completa                              |
