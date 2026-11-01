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

| Credencial                                                        | Destrava |
| ----------------------------------------------------------------- | -------- |
| Asaas (chave da conta-mãe, `walletId` da Vetta, token de webhook) | Fase 2   |
| NFE.io (empresa e chave)                                          | Fase 2   |
| Resend com domínio verificado                                     | Fase 0   |
| Expo Push token                                                   | Fase 0   |
| Sentry DSN                                                        | Fase 0   |
| Cloudflare R2 e Stream (ou Mux)                                   | Fase 0   |
| Google e Apple OAuth                                              | Fase 1   |

- [ ] **Regra das lojas para link externo** (Fase 2, ADR-010)
  - Confirmar a elegibilidade antes de ligar as flags `EXPO_PUBLIC_EXTERNAL_CHECKOUT_*`.
  - Apple: StoreKit External Purchase Link. Google: programa de ofertas externas.
- [ ] **NFS-e: código de serviço e alíquota de ISS** do município da Vetta (Fase 2).

## Infra e entrega

- [ ] **PRs e merges em ordem** (Fases 0–2): cada branch nasce da anterior.
  - Abrir e mergear `feat/fase-0-fundacao` → `feat/fase-1-mvp` → `feat/fase-2-pro`.
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
- [ ] **Pro Plus** (Fase 3):
  - Google Calendar, WhatsApp oficial, white label;
  - domínio próprio, IA de treino;
  - relatórios avançados completos, assistentes.
- [ ] **Pagar.me** como segunda implementação de `PaymentProvider`.
- [ ] **SMS de segurança** (provider real) (Fase 0).
- [ ] **Academy** (M14): telas do personal e do admin.

## Riscos acompanhados

- **Prévia de impacto no admin** (Fase 1): lista nominalmente só quem passa do limite de alunos; para as outras features mostra apenas a contagem.
- **PCI** (Fase 2): o cartão passa pela API para tokenização (SAQ D). Avaliar o checkout hospedado do Asaas.
- **ClamAV** (Fase 0): usa cerca de 1 GB de RAM e fica desligado por padrão no ambiente local.

## Fase 2 – itens abertos

(preenchido ao fim da fase)
