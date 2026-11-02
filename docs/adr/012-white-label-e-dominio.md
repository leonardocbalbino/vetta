# ADR-012 — White label e domínio próprio

**Status:** aceito (Fase 3)

## Decisão

- **Cores com contraste garantido** (`packages/tokens/src/brand-theme.ts`):
  - A primária vira a cor de ação, link, foco e gráficos, e precisa de 4,5:1 contra branco e névoa.
  - O destaque precisa de 3:1 contra a tinta e de 4,5:1 com o texto sobre ele.
  - Cor reprovada não é salva; a API devolve a variante mais próxima que passa.
  - No escuro, o link é clareado até 4,5:1.
- **Tema em tempo de execução:**
  - A API devolve o CSS pronto (`:root` e `.dark` sobre as variáveis `--vt-*`).
  - Web: o AppShell injeta o tema do vínculo ativo (`GET /v1/brand/active`).
  - Mobile: o `ThemeProvider` recebe as cores e aplica `brandNativeColors`.
  - Página de vendas: o tema é buscado por slug.
  - Rodapé "feito com Vetta" em todos.
- **Isolamento:**
  - O tema sai sempre do tenant do vínculo validado pelo guard, e um aluno de outro personal recebe 404.
  - Sem `brand.white_label` no plano, o tema volta ao da Vetta (dados preservados).
- **E-mails:** remetente com o nome do personal (`"Studio Ana" <nao-responda@…>`), com a mesma regra de cor e o link pelo domínio próprio, quando ativo.
- **Domínio próprio:**
  - Cloudflare for SaaS (custom hostnames, validação DV por HTTP e certificado automático).
  - O personal cria um CNAME para `CUSTOM_DOMAIN_TARGET`.
  - O worker verifica a cada 10 minutos e desiste após 7 dias.
  - O domínio aponta para o app web. Antes do login, o web resolve o tema pelo host (`GET /v1/public/brand?host=`) e já seleciona o vínculo daquele personal.
  - A API libera CORS para domínios ativos (cache de 1 minuto).

## Alternativas

- **Middleware do Next reescrevendo por host:** o tema pode ser resolvido no cliente, sem acoplar o build ao banco. Fica a opção de SSR por host quando houver necessidade de SEO no domínio próprio.

## Pendências

- Socket.IO ainda aceita só as origens fixas: no domínio próprio o chat e o sino funcionam, mas sem atualização em tempo real.
- Remetente com domínio do personal (DKIM próprio) não entra nesta fase: o nome muda, o endereço continua o da Vetta.
