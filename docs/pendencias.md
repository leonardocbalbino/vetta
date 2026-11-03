# Pendências de todas as fases

Lista viva do que ficou para depois, com origem e o que destrava cada item. Ao concluir uma pendência, marque `[x]` e cite o commit ou PR.

## Antes do lançamento (bloqueiam produção)

- [ ] **Termos de uso e política de privacidade** (Fase 1)
  - São rascunhos e precisam de revisão jurídica.
  - Ao publicar uma nova versão no admin, os consentimentos são pedidos de novo.
- [ ] **Depoimentos reais com autorização** (Fase 1). Hoje são ilustrativos e ficam ocultos em produção (`NEXT_PUBLIC_SHOW_PLACEHOLDERS`).
- [ ] **Tokens da web em cookie httpOnly** (Fase 1)
  - Hoje ficam no `localStorage`, inclusive na impersonação.
  - Caminho: BFF no Next com cookie `Secure; SameSite=Lax`.
- [ ] **Credenciais de produção, cada uma com o que destrava**

| Credencial                                                              | Destrava |
| ----------------------------------------------------------------------- | -------- |
| Asaas (chave da conta-mãe, `walletId` da Vetta, token de webhook)       | Fase 2   |
| NFE.io (empresa e chave)                                                | Fase 2   |
| Resend com domínio verificado                                           | Fase 0   |
| Expo Push token                                                         | Fase 0   |
| Sentry DSN                                                              | Fase 0   |
| Cloudflare R2 e Stream (ou Mux)                                         | Fase 0   |
| Google e Apple OAuth                                                    | Fase 1   |
| Groq (`GROQ_API_KEY`) — feito na homologação; plano Dev para produção   | Fase 3   |
| Meta WhatsApp Business ou BSP (token, número, templates aprovados)      | Fase 3   |
| textbee (SMS de segurança; Twilio como reserva), no admin > Integrações | Fase 3   |
| Cloudflare for SaaS (zona e token de custom hostnames)                  | Fase 3   |
| Google Cloud: OAuth do Calendar (cliente web e tela de consentimento)   | Fase 3   |
| Apple: entitlement de HealthKit; Google: declaração do Health Connect   | Fase 3   |

- [ ] **Regra das lojas para link externo** (Fase 2, ADR-010)
  - Confirmar a elegibilidade antes de ligar as flags `EXPO_PUBLIC_EXTERNAL_CHECKOUT_*`.
  - Apple: StoreKit External Purchase Link. Google: programa de ofertas externas.
- [ ] **NFS-e: código de serviço e alíquota de ISS** do município da Vetta (Fase 2).

## Infra e entrega

- [ ] **PRs e merges em ordem** (Fases 0–3): cada branch nasce da anterior.
  - Abrir e mergear `feat/fase-0-fundacao` → `feat/fase-1-mvp` → `feat/fase-2-pro` → `feat/fase-3-pro-plus`.
  - O `gh` não está instalado nesta máquina.
- [ ] **CI do GitHub Actions:** ainda não rodou no GitHub (Fases 0–2).
- [ ] **EAS** (Fase 1):
  - definir `EAS_PROJECT_ID`;
  - primeiro build `development`, `preview` e `production`;
  - credenciais de assinatura.
- [ ] **Maestro:** os fluxos existem (`apps/mobile/.maestro`), mas não foram executados (não há emulador nesta máquina) (Fases 1–2).
- [ ] **Playwright web:** rodar de novo após a Fase 2 (Fase 1).
- [ ] **Migração para Prisma 7** (ADR-003, Fase 0).

## Produto (planejado para fases seguintes)

- [ ] **Download de vídeos para o player offline** (Fase 1). Hoje o vídeo exige internet; o treino e os registros funcionam offline.
- [ ] **Fonte Archivo Expanded no mobile** (Fase 1)
  - Não há pacote Expo com a fonte; usamos Archivo.
  - Caminho: embutir o `.ttf` licenciado.
- [ ] **Pagar.me** como segunda implementação de `PaymentProvider`.
- [x] **SMS de segurança** (provider real) (Fase 0): textbee (principal) e Twilio (reserva), escolhidos e configurados no admin > Integrações; falta a credencial.
  - Para ligar o textbee:
    1. Crie a conta em app.textbee.dev.
    2. Instale o app no Android (textbee.dev/download) e entre com a conta.
    3. No painel, use "Register device" e leia o QR code com o app.
    4. Gere a chave em "API Keys".
    5. No admin, em Integrações > textbee, cole a chave (e o ID do aparelho, opcional), salve e use "Enviar teste".
  - O plano grátis do textbee permite 50 SMS por dia e 300 por mês. O celular precisa ficar ligado, com chip e bateria.
- [ ] **Vídeos da biblioteca global**: links do YouTube escolhidos automaticamente em `packages/db/src/seed/exercise-videos.ts`. Revise antes da produção e troque o que não agradar (o seed só preenche exercício sem mídia).
- [x] **Academy** (M14): telas do personal e do admin (Fase 3).

## Riscos acompanhados

- **Prévia de impacto no admin** (Fase 1): lista nominalmente só quem passa do limite de alunos; para as outras features mostra apenas a contagem.
- **PCI** (Fase 2): o cartão passa pela API para tokenização (SAQ D). Avaliar o checkout hospedado do Asaas.
- **ClamAV** (Fase 0): usa cerca de 1 GB de RAM e fica desligado por padrão no ambiente local.

## Fase 2 – itens abertos

- [ ] **Validar com o sandbox real do Asaas.** Os testes usam um dublê com o contrato do sandbox. Com a chave, rodar o fluxo: checkout, webhooks, subconta e KYC, split, saque.
- [ ] **Webhook da conta-mãe no painel do Asaas** apontando para `https://api.vettafit.com.br/v1/webhooks/asaas` com o `ASAAS_WEBHOOK_TOKEN`. As subcontas já nascem configuradas.
- [ ] **Sitemap com as páginas de vendas publicadas.** Exige rota pública que liste os slugs.
- [ ] **Marcação de pontos e linhas na foto postural** só existe na web; no app há captura com guia, grade e checklist.
- [ ] **Vídeo de exercício pelo app:** o PUT reaproveita os dados atuais do exercício. Validar com exercícios que tenham todos os campos preenchidos.
- [ ] **Maestro:** fluxos novos (chat, agenda, pagamento do aluno) ainda não escritos nem executados.
- [ ] **Playwright web:** cobrir checkout e agenda. Hoje há só a fumaça manual, feita com navegador headless.
- [ ] **Cartão do aluno com confirmação tardia:** a tela trata o pagamento aprovado na hora; quando o gateway confirma depois, o status chega por webhook e aparece ao recarregar.
- [ ] **Tempo real em várias instâncias da API:** o Socket.IO usa o adapter Redis (já configurado). Validar com mais de uma instância.
- [ ] **Login do aluno:** depois de entrar, o aluno passa por `/inicio` antes de ir para `/treino`, o que gera dois 403 no console (vem da Fase 1).

## Fase 3 – itens abertos

- [ ] **Validar a IA com a chave real.** Os testes usam respostas gravadas. Com a chave:
  - rodar algumas gerações reais e conferir qualidade, tempo e custo;
  - regravar as respostas se o formato mudar;
  - ajustar `AI_EFFORT` se o custo pedir.
- [ ] **Templates do WhatsApp aprovados na Meta** (em espera: decidido usar a Meta direto, sem BSP; retomar depois), com os nomes de `WHATSAPP_TEMPLATES`:
  - `vetta_cobranca_nova`, `vetta_cobranca_lembrete`, `vetta_cobranca_atraso`;
  - `vetta_lembrete_treino`, `vetta_lembrete_aula`.
  - As variáveis seguem a ordem do código.
- [ ] **Cloudflare for SaaS:**
  - criar o registro `custom.vettafit.com.br` (fallback origin) apontando para o app web;
  - testar um domínio real de ponta a ponta.
- [ ] **Google Calendar** (o projeto OAuth no Google Cloud será criado pelo responsável do produto):
  - verificar o app OAuth (o escopo `calendar.events` é sensível);
  - registrar o domínio do webhook no Google;
  - testar com uma conta real.
- [ ] **HealthKit e Health Connect:**
  - gerar build de desenvolvimento (EAS) e testar em iPhone e Android reais;
  - publicar a política de privacidade de dados de saúde exigida pelas lojas.
- [ ] **Socket.IO no domínio próprio:** liberar as origens dinâmicas também no adapter do Socket.IO. Hoje, no domínio próprio, chat e sino não atualizam em tempo real.
- [ ] **Remetente com domínio do personal** (DKIM próprio). Hoje só o nome do remetente muda.
- [ ] **PDFs de treino e avaliação com as cores do personal.** Hoje levam a logo; as cores do white label ainda não.
- [ ] **Maestro e Playwright:** fluxos novos (IA, equipe, marca, saúde) ainda não escritos.
- [ ] **Central de ajuda:** revisar os textos com o time de produto e incluir capturas de tela.
