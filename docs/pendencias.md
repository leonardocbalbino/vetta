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

- [x] **PRs e merges das Fases 0–3:** `feat/fase-3-pro-plus` entrou na `main` (PRs #1 e #2).
  - O que foi feito depois (SMS no admin, IA na Groq, vídeos da biblioteca, detalhes e edição de exercício, Instagram) ainda precisa de push e de um novo PR.
- [x] **CI do GitHub Actions:** roda em todo PR.
- [ ] **Deploy automático na VPS** (`.github/workflows/deploy.yml`):
  - instalar `deploy/remote-deploy.sh` como `/usr/local/bin/vetta-deploy`;
  - criar a chave de deploy com comando forçado;
  - cadastrar os secrets `VPS_HOST`, `VPS_SSH_KEY` e `VPS_KNOWN_HOSTS`.
  - Até lá o deploy é manual.
- [ ] **Senhas da VPS:** trocar a senha de root (foi compartilhada em conversa) e a chave da Groq (idem).
- [ ] **EAS** (Fase 1):
  - definir `EAS_PROJECT_ID`;
  - primeiro build `development`, `preview` e `production`;
  - credenciais de assinatura.
- [ ] **Maestro:** os fluxos existem (`apps/mobile/.maestro`), mas não foram executados (não há emulador nesta máquina) (Fases 1–2).
- [x] **Playwright web:** roda no CI e localmente; 4 fluxos passando (cadastro ao primeiro treino, biblioteca, chat em tempo real, agenda).
- [ ] **Migração para Prisma 7** (ADR-003, Fase 0).

## Produto (planejado para fases seguintes)

- [x] **Download de vídeos para o player offline** (Fase 1): o worker gera um MP4 leve (360p, sem áudio, até 90 s) e o app baixa a mídia do programa ao abrir o treino (vídeo, senão GIF ou foto).
  - Vídeos enviados antes desta mudança não têm o MP4 leve: o app baixa o GIF. Para ter o vídeo offline, reprocessar ou reenviar.
  - Vídeos do YouTube não podem ser baixados (termos do YouTube); offline aparece a capa.
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

- [ ] **Validar com o sandbox real do Asaas.** A chave do sandbox já está na homologação.
  - [x] Assinatura da plataforma no cartão (free@ → Pro): aprovada na hora e o plano mudou (04/11).
  - [ ] Subconta, KYC, split e saque: o Asaas só deixa conta de **pessoa jurídica (CNPJ)** criar subcontas, e a conta sandbox atual é de pessoa física. É preciso uma conta sandbox com CNPJ. A conta de produção da Vetta também precisa ser PJ.
  - [ ] Pix e boleto: a confirmação depende do webhook da conta-mãe (item abaixo).
  - Os personais do seed têm uma carteira "aprovada" de mentira, sem subconta real. Na homologação, refazer a ativação da carteira em Financeiro.
- [ ] **Webhook da conta-mãe no painel do Asaas** apontando para `https://api.vettafit.com.br/v1/webhooks/asaas` com o `ASAAS_WEBHOOK_TOKEN`. As subcontas já nascem configuradas.
- [ ] **Sitemap com as páginas de vendas publicadas.** Exige rota pública que liste os slugs.
- [ ] **Marcação de pontos e linhas na foto postural** só existe na web; no app há captura com guia, grade e checklist.
- [ ] **Vídeo de exercício pelo app:** o PUT reaproveita os dados atuais do exercício. Validar com exercícios que tenham todos os campos preenchidos.
- [ ] **Maestro:** fluxos novos (chat, agenda, pagamento do aluno) ainda não escritos nem executados.
- [ ] **Playwright web:** agenda coberta (marcar e confirmar aula); falta o checkout, que depende do sandbox do Asaas com CNPJ.
- [ ] **Cartão do aluno com confirmação tardia:** a tela trata o pagamento aprovado na hora; quando o gateway confirma depois, o status chega por webhook e aparece ao recarregar.
- [ ] **Tempo real em várias instâncias da API:** o Socket.IO usa o adapter Redis (já configurado). Validar com mais de uma instância.
- [ ] **Login do aluno:** depois de entrar, o aluno passa por `/inicio` antes de ir para `/treino`, o que gera dois 403 no console (vem da Fase 1).

## Fase 3 – itens abertos

- [x] **Validar a IA com a chave real.** A Groq (`gpt-oss-20b`) está validada na homologação: um programa sai em uns 40 s e custa uns US$ 0,002.
  - Pendente: o plano Dev da Groq para produção, porque o grátis limita a 8 mil tokens por minuto.
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
- [x] **Socket.IO no domínio próprio:** o Socket.IO usa a mesma regra de origem do HTTP (domínios próprios ativos).
- [ ] **Remetente com domínio do personal** (DKIM próprio). Hoje só o nome do remetente muda.
- [x] **PDFs de treino e avaliação com as cores do personal:** título, faixa, blocos e linhas na cor da marca, ajustada para leitura no papel.
- [ ] **Maestro e Playwright:** fluxos novos (IA, equipe, marca, saúde) ainda não escritos.
- [ ] **Central de ajuda:** revisar os textos com o time de produto e incluir capturas de tela.
