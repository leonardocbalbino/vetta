# Fase 2 – Pro

Branch: `feat/fase-2-pro` (criada a partir de `feat/fase-1-mvp`, ainda não mergeada).

**Critério de pronto:** um personal assina o Pro, vende consultoria pela página de vendas, recebe com split, agenda aulas e conversa com mídia.

## Ordem de execução

1. **Cálculos puros com testes:**
   - `packages/fitness`: progressão de periodização (linear, ondulatória, em blocos, deload) e calendário de semanas.
   - `packages/server/billing`: pró-rata, cupons, datas de ciclo, carência e régua de lembretes.
   - `packages/server/schedule`: expansão de recorrência (RRULE semanal) e slots de disponibilidade.
2. **Schema (migration aditiva + RLS regenerada):**
   - webhooks processados e conciliação;
   - cartão tokenizado e tentativas de cobrança;
   - checkout público;
   - planos de consultoria completos (formas, meios, tolerância);
   - KYC da subconta;
   - disponibilidade, bloqueios e participantes de aula;
   - citação e mídia no chat;
   - comunicados por filtro;
   - progressão por fase;
   - anamnese com reaplicação;
   - checklist postural;
   - configurações financeiras e de agenda do tenant.
3. **Providers (`packages/server`):**
   - `PaymentProvider` com implementação `AsaasPaymentProvider` (HTTP real, sempre apontando para o sandbox fora de produção);
   - `InvoiceIssuer` com implementação NFE.io;
   - roteamento e verificação dos webhooks.
4. **API:**
   - assinatura da plataforma (checkout, troca de plano com pró-rata, cupons, cancelamento);
   - webhooks;
   - carteira e KYC;
   - planos de consultoria;
   - venda ao aluno com split;
   - painel financeiro, extrato, saque, despesas e relatório CSV;
   - página de vendas e checkout público;
   - agenda;
   - chat (REST + Socket.IO);
   - comunicados;
   - periodização;
   - anamnese avançada;
   - avaliação postural;
   - documentos;
   - admin financeiro (assinaturas, faturas, falhas, estornos, métricas).
5. **Worker/jobs:**
   - carência e downgrade (D-7, D-1, dia, falha do cartão; FREE após 7 dias);
   - lembretes de fatura do aluno (D-3, D0, D+1, D+5);
   - bloqueio do aluno inadimplente;
   - aviso de fim de plano vendido;
   - lembretes de aula (24 h e 1 h);
   - comunicados agendados;
   - troca de fase da periodização;
   - reaplicação de anamnese;
   - emissão de NFS-e;
   - envio de documentos de KYC ao gateway;
   - conciliação diária.
6. **Web personal + aluno:**
   - upgrade e checkout;
   - financeiro completo;
   - editor da página de vendas;
   - agenda (dia, semana, mês);
   - chat e comunicados;
   - periodização com calendário;
   - construtor de anamnese;
   - avaliação postural com marcações;
   - barra de cota;
   - documentos;
   - telas do aluno (pagar, bloqueio, agenda, documentos).
7. **Site:** `/p/[slug]` com ISR, Open Graph do personal e checkout.
8. **Mobile:**
   - upgrade via checkout web, conforme as regras das lojas;
   - pagamento do aluno e tela de bloqueio;
   - chat com áudio, imagem e vídeo;
   - agenda em lista;
   - fotos posturais com guia;
   - documentos;
   - gravação de vídeo de exercício.
9. **Admin:** assinaturas, faturas, falhas, estornos, MRR/ARR/churn/LTV, receita por plano, conciliação.
10. **Testes:**
    - webhooks com payloads no formato do sandbox (duplicados e fora de ordem);
    - ponta a ponta: visitante compra pela página de vendas > vira aluno > recebe treino > paga a renovação;
    - downgrade/upgrade preservando dados;
    - matriz de permissões para todas as rotas novas.

## Proteção por feature key

| Recurso                              | Feature key                                     |
| ------------------------------------ | ----------------------------------------------- |
| Cobrança de alunos, carteira, planos | `finance.student_billing`                       |
| Taxa da plataforma no split          | `finance.split_fee_bps` (limite, por plano)     |
| Relatório exportável                 | `finance.advanced_reports` (relatório avançado) |
| Página de vendas                     | `brand.sales_page`                              |
| Agenda                               | `schedule.calendar`                             |
| Chat texto / mídia                   | `comms.chat` / `comms.chat_media`               |
| Comunicados                          | `comms.broadcast`                               |
| Periodização                         | `workouts.periodization`                        |
| Anamnese personalizada               | `assessment.anamnesis_custom`                   |
| Avaliação postural                   | `assessment.posture`                            |
| Avaliações ilimitadas                | `assessment.physical_per_student`               |
| Vídeos próprios e cota               | `library.custom_videos` + `storage.quota_mb`    |
| Documentos do aluno                  | `docs.student_folder`                           |
| Logo nos PDFs                        | `assessment.pdf_branding`                       |

O relatório mensal em CSV fica disponível a todo personal com `finance.student_billing`. `finance.advanced_reports` (Pro Plus) libera o relatório por período e por plano.

## Decisões

- **Domínio:** o prompt cita `usevetta.com.br/p/[slug]`. O domínio definido (CLAUDE.md, ADR-007) é `vettafit.com.br`, então a página fica em `vettafit.com.br/p/[slug]`.
- **Gateway sempre em sandbox:**
  - `ASAAS_BASE_URL` padrão é `https://api-sandbox.asaas.com/v3`; a API recusa a URL de produção fora de `NODE_ENV=production`.
  - Sem `ASAAS_API_KEY`, as rotas de pagamento respondem 503 `PAYMENT_NOT_CONFIGURED`.
  - Os testes exercitam o cliente HTTP real contra um servidor que reproduz o contrato do sandbox, com payloads de webhook no formato documentado.
- **Split:**
  - As cobranças do aluno são emitidas pela subconta do personal (ele é o vendedor e o emissor do recibo).
  - O split envia a taxa da plataforma (`finance.split_fee_bps` do plano) para a carteira da Vetta.
  - O admin configura a taxa na matriz de planos.
- **Webhooks:**
  - Endpoint único `POST /v1/webhooks/asaas`, autenticado pelo token `asaas-access-token` (o Asaas não assina com HMAC; comparação em tempo constante).
  - Idempotência pela tabela `webhook_events` (único por provedor + id do evento).
  - Fora de ordem: cada status tem precedência e nunca regride (ex.: `PAYMENT_CREATED` atrasado não desfaz `RECEIVED`; estorno pode vir depois do pagamento).
- **Cartão:** tokenizado no Asaas na hora do checkout. Guardamos só token, bandeira e últimos 4 dígitos. Os campos do cartão são mascarados nos logs.
- **Nota fiscal:** abstração `InvoiceIssuer` com NFE.io, disparada pelo pagamento confirmado da assinatura da plataforma. Sem chave configurada, a emissão fica `PENDING_CONFIG` e aparece no admin.
- **Pró-rata:**
  - Upgrade: crédito dos dias restantes do plano atual vira desconto na primeira cobrança do novo plano, que começa na hora.
  - Downgrade: vale no fim do período.
  - Tudo em centavos, com arredondamento a favor do cliente.
- **Lojas de apps:**
  - O upgrade no mobile abre o checkout web só quando a loja permite link externo (flag por plataforma); senão mostra instrução sem link.
  - A cobrança do personal ao aluno é serviço presencial ou pessoa a pessoa e pode ser paga no app.
  - Detalhado no ADR-010.
- **Recorrência da agenda:** RRULE semanal (`FREQ=WEEKLY;BYDAY;INTERVAL;COUNT|UNTIL`). As ocorrências são materializadas até 26 semanas, para permitir reservas por ocorrência.
- **Chat:** mesmo Socket.IO das notificações (salas `user:` e `conversation:`). O status "lido" vem dos carimbos de leitura da conversa. A busca é textual (ILIKE) paginada por cursor.

## Fora do escopo

- Google Calendar e WhatsApp (Pro Plus, Fase 3).
- Pagar.me (segunda implementação).
- Domínio próprio e white label.
- IA.

## Riscos

- **Sandbox:** sem credencial de sandbox nesta máquina; a integração real só será validada com uma chave.
- **PCI:** o cartão passa pela API para tokenização (escopo SAQ D). Alternativa futura: checkout hospedado do Asaas.
- **NFS-e:** regras municipais (ISS, código de serviço) dependem da prefeitura do CNPJ da Vetta.

## Status da execução

Concluída: backend, web, admin, site e mobile.

Desvios do plano:

- **Datas em Brasília:** vencimentos, liberação de crédito, conciliação e reaplicação de anamnese usam dias civis de Brasília. A data UTC deslocava um dia depois das 21h.
- **Ids de job sem dois-pontos:** o BullMQ recusa `:` nos ids; o publicador troca por `__` só no id do job.
- **Rotas compartilhadas na web:** `/mensagens` e `/agenda` servem ao personal e ao aluno, com telas por papel.
- **Decisões das lojas:** registradas no ADR-010.
