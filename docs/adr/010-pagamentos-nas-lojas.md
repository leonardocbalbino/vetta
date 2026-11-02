# ADR-010 — Pagamentos no app e regras das lojas

**Status:** aceito (Fase 2)

## Contexto

O app tem dois tipos de cobrança, com regras diferentes na App Store e no Google Play:

1. **Assinatura da plataforma (personal → Vetta).** É acesso a software (conteúdo digital consumido no app).
   - Apple 3.1.1: pede compra in-app.
   - Apple 3.1.3(b), apps multiplataforma: permite usar o que foi comprado fora do app, mas proíbe link ou chamada para comprar fora, exceto com o programa StoreKit External Purchase Link nos países onde ele existe.
   - Google Play: exige o Play Billing para bens digitais, exceto com o programa de ofertas externas ou de faturamento alternativo onde ele estiver disponível.
2. **Consultoria (aluno → personal).** É um serviço prestado por uma pessoa a outra, presencial ou acompanhado.
   - Apple 3.1.3(d) e 3.1.3(e): serviços de pessoa para pessoa e serviços consumidos fora do app podem ser pagos por outros meios.
   - Google Play: a política de pagamentos isenta serviços físicos e de pessoa para pessoa.

## Decisão

- **Assinatura da plataforma no mobile:**
  - O app mostra o plano atual e a situação (renovação, atraso).
  - O botão para o checkout web (`/assinatura` no web) só aparece com uma flag por plataforma: `EXPO_PUBLIC_EXTERNAL_CHECKOUT_IOS` e `EXPO_PUBLIC_EXTERNAL_CHECKOUT_ANDROID`. As duas vêm desligadas.
  - Sem a flag, o app mostra apenas "A gestão da assinatura é feita pelo computador", sem link, sem preço e sem chamada para comprar.
  - A flag só é ligada depois de a Vetta aderir ao programa de link externo da loja naquele país e cumprir os requisitos (aviso exigido pela loja, relatório de transações).
- **Consultoria do aluno no mobile:**
  - Pagamento dentro do app: Pix (QR e copia e cola), boleto (abre no navegador do sistema) e cartão (tokenizado no Asaas).
  - A tela de bloqueio por inadimplência leva direto a esse pagamento.
- **Web:** sem restrição. O checkout completo da assinatura fica em `app.vettafit.com.br/assinatura`.

## Consequências

- **iOS e Android sem a flag:** a conversão do upgrade acontece no computador ou no navegador. A cobrança da plataforma fica de fora das taxas das lojas.
- **Mudança de regra:** se a loja mudar a regra num país (ex.: decisões de autoridades de concorrência), basta ligar a flag naquele build, sem mudar código.
- **Pendência:** confirmar a elegibilidade no Brasil antes de ligar qualquer flag (`docs/pendencias.md`).
