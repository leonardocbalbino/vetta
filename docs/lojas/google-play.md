# Publicar o Vetta na Google Play (Expo / EAS)

Passo a passo do zero até a produção. As imagens estão em `apps/mobile/store/android/` e os textos da ficha no fim deste documento.

> As regras do Play Console mudam com frequência (nível de API exigido, testes fechados, formulários). Antes de cada etapa, confira o aviso que o próprio Console mostra.

## 0. Antes de começar

| Item                               | Onde                                            | Observação                                                                                |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Conta de desenvolvedor Google Play | play.google.com/console                         | Taxa única de US$ 25. Prefira conta de **organização** (exige número D-U-N-S da empresa). |
| Conta Expo                         | expo.dev                                        | Gratuita. O build roda na nuvem do EAS.                                                   |
| Política de privacidade publicada  | https://vettafit.com.br/privacidade             | Já existe. Revise com o jurídico (pendência da Fase 1).                                   |
| Página de exclusão de conta        | https://app.vettafit.com.br/perfil              | A Play exige um link web para o titular pedir a exclusão.                                 |
| Usuário de teste para a revisão    | `aluno01@vettafit.dev` e `proplus@vettafit.dev` | A Google precisa entrar no app. Use a senha da homologação.                               |

**Conta pessoal × organização:** contas **pessoais** criadas depois de nov/2023 precisam de um **teste fechado com pelo menos 12 testadores por 14 dias seguidos** antes de liberar a produção. Contas de organização não têm essa exigência.

## 1. Preparar o projeto no Expo (uma vez)

No computador, na pasta do projeto:

```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas init          # cria o projeto no expo.dev e mostra o projectId
```

Guarde o `projectId` e defina a variável `EAS_PROJECT_ID` (no `.env` local e nas variáveis do projeto no expo.dev). O `app.config.ts` usa esse valor para push e atualizações.

Conferências no `app.json`:

- `android.package`: `br.com.vettafit.app` (definitivo; não muda depois de publicar).
- `version`: `0.1.0`. O `versionCode` é controlado pelo EAS (`appVersionSource: remote` + `autoIncrement`).

## 2. Primeiro build de teste (APK)

```bash
eas build -p android --profile preview
```

- Na primeira vez, o EAS pergunta se pode **gerar a keystore**. Responda **sim**: ela fica guardada no Expo.
- No fim, o EAS mostra um link e um QR code do APK. Instale num Android e teste:
  - login de aluno e de personal;
  - treino do dia e player;
  - foto de progresso;
  - Saúde (Health Connect).
- Este perfil aponta para `api.vettafit.com.br`, a homologação atual.

## 3. Build da loja (AAB)

```bash
eas build -p android --profile production
```

Gera um **.aab** (Android App Bundle), o formato exigido pela Play. Baixe o arquivo pelo link do build.

## 4. Criar o app no Play Console

1. **Criar app.**
   - Nome: **Vetta**.
   - Idioma padrão: **Português (Brasil)**.
   - Tipo: **App**, **Gratuito**.
   - Aceite as declarações.
2. **Configurar o app** (painel "Configure seu app"):
   - **Política de privacidade:** `https://vettafit.com.br/privacidade`.
   - **Acesso ao app:** "Todas ou algumas funcionalidades estão restritas". Informe os dois usuários de teste e a senha.
   - **Anúncios:** "Não, meu app não contém anúncios".
   - **Classificação do conteúdo:** questionário, categoria "Utilitário/Produtividade" ou "Saúde e fitness". Não há violência, apostas nem compras de itens digitais. Resultado esperado: Livre.
   - **Público-alvo:** 18 anos ou mais. Evita as regras de apps para crianças.
   - **App de notícias:** não.
   - **Apps de saúde:** marque **Fitness**. Declare que **não** é dispositivo médico.
   - **Segurança dos dados:** ver a seção 6.
   - **Health Connect:** formulário de declaração de permissões (ver a seção 7).
   - **Exclusão de conta:** informe `https://app.vettafit.com.br/perfil` e diga que a exclusão também pode ser feita no app (Perfil → Excluir minha conta).
   - **Governo / financeiro:** não.
3. **Ficha da loja principal:** textos da seção 9 e imagens da seção 8.
4. **Categoria:** Saúde e fitness. **E-mail de contato:** um e-mail de suporte da Vetta.

## 5. Primeiro envio (manual)

A API de envio só funciona depois do **primeiro upload manual**.

1. Play Console → **Testar e lançar → Testes → Teste interno** → **Criar versão**.
2. **Assinatura de apps do Google Play:** aceite. A Google guarda a chave final; a do EAS vira a chave de upload.
3. Envie o `.aab` do passo 3. Nome da versão: `0.1.0 (1)`.
4. Em **Testadores**, crie uma lista com os e-mails das contas Google que vão testar e publique a versão interna. Cada testador recebe um link para instalar.

### Envios seguintes, direto do terminal

1. No Google Cloud, crie uma **conta de serviço** e baixe a chave JSON.
2. No Play Console, em **Usuários e permissões**, convide o e-mail da conta de serviço com permissão de lançar versões.
3. Salve a chave como `apps/mobile/google-play-service-account.json` (já está no `.gitignore`).
4. Rode:

```bash
eas build -p android --profile production --auto-submit
# ou, para um build já pronto:
eas submit -p android --profile production
```

O perfil envia para o **teste interno** como rascunho (`eas.json`); a promoção para fechado ou produção é feita no Console.

## 6. Formulário "Segurança dos dados"

| Dado                                                                                  | Coletado | Compartilhado                               | Finalidade                        | Opcional?            |
| ------------------------------------------------------------------------------------- | -------- | ------------------------------------------- | --------------------------------- | -------------------- |
| Nome, e-mail, telefone                                                                | Sim      | Não                                         | Conta, comunicação com o personal | Telefone sim         |
| Fotos (progresso e postural)                                                          | Sim      | Não                                         | Funcionalidade do app             | Sim                  |
| Saúde e condicionamento físico (anamnese, medidas, cargas, passos, FC, peso, treinos) | Sim      | Não                                         | Funcionalidade do app             | Sim (Health Connect) |
| Mensagens no app (chat)                                                               | Sim      | Não                                         | Funcionalidade do app             | Sim                  |
| Informações financeiras (histórico de pagamentos ao personal)                         | Sim      | Sim, com o processador de pagamento (Asaas) | Pagamentos                        | Sim                  |
| Identificadores do dispositivo (token de push)                                        | Sim      | Não                                         | Notificações                      | Sim                  |
| Diagnóstico de falhas (Sentry)                                                        | Sim      | Não                                         | Análise e correção                | Não                  |

- **Criptografia em trânsito:** sim (HTTPS).
- **O usuário pode pedir a exclusão dos dados:** sim.
- **Localização, contatos, agenda do aparelho:** não coletados.
- **Venda de dados:** não.

## 7. Health Connect (declaração obrigatória)

O app pede leitura de **passos, frequência cardíaca, peso e exercícios** e gravação de **exercícios**. No Play Console → Conteúdo do app → **Permissões do Health Connect**, justifique cada uma:

- **Passos, frequência cardíaca, peso:** "Mostrar ao aluno e ao personal dele a evolução de atividade e peso, para ajustar o treino."
- **Exercício (ler):** "Considerar outros treinos do aluno ao planejar a semana."
- **Exercício (gravar):** "Registrar no Health Connect os treinos concluídos no Vetta."

Pontos de atenção:

- A política de privacidade precisa citar o Health Connect e dizer que esses dados não são usados para publicidade.
- A Google pode pedir um vídeo do fluxo de permissão. Grave a tela Perfil → Saúde → Conectar.

## 8. Imagens (já geradas)

| Arquivo                                 | Uso no Console               | Tamanho   |
| --------------------------------------- | ---------------------------- | --------- |
| `store/android/icon-512.png`            | Ícone do app                 | 512×512   |
| `store/android/feature-graphic.png`     | Gráfico de recursos          | 1024×500  |
| `store/android/screenshots/01…06-*.png` | Capturas de tela do telefone | 1080×1920 |

- **Ícone do aparelho:** vem do `app.json` (`assets/icon.png` e `assets/adaptive-icon.png`, fundo tinta `#101418`).
- **Capturas:** foram geradas a partir do sistema em tamanho de celular, com dados de exemplo. Antes de publicar em produção, troque por capturas do **app instalado** (a Google pede que as imagens mostrem o app real).
- **Regerar as imagens:**

```bash
node apps/mobile/store/generate.mjs https://app.vettafit.com.br <senha-dos-usuarios-de-exemplo>
```

## 9. Textos da ficha

**Nome do app (até 30):**

```
Vetta: treino com seu personal
```

**Descrição curta (até 80):**

```
Seu treino, sua evolução e seu personal no mesmo app. Treine até sem internet.
```

**Descrição completa (até 4.000):**

```
O Vetta conecta você ao seu personal trainer. Seu método. Seu aluno. Sua evolução.

PARA O ALUNO
• Treino do dia com vídeo de cada exercício, séries, cargas e descanso
• Registro de carga por série, com sugestão de progressão
• Funciona sem internet: o treino fica salvo no celular e sincroniza depois
• Feedback ao fim do treino e recordes pessoais
• Gráficos de peso, medidas, % de gordura e cargas
• Fotos de evolução (antes e depois)
• Chat com seu personal, com áudio, foto e vídeo
• Agenda de aulas presenciais e online
• Pagamentos por Pix, boleto ou cartão
• Integração com o Health Connect: passos, frequência cardíaca, peso e treinos

PARA O PERSONAL
• Alunos, treinos, avaliações e anamneses na palma da mão
• Treinos com bi-set, tri-set, drop-set, circuito, AMRAP e EMOM
• Avaliação física e postural com fotos
• Agenda, mensagens e comunicados
• Resumo semanal de cada aluno

O Vetta é usado com o acompanhamento do seu personal trainer. Se você é aluno, peça o convite a ele. Se você é personal, crie sua conta grátis em vettafit.com.br.

Seus dados de saúde são protegidos e só são usados para o seu acompanhamento.
```

**Novidades da versão (primeira versão):**

```
Primeira versão do Vetta: treino do dia, player com cronômetro, evolução, chat, agenda e pagamentos.
```

## 10. Do teste à produção

1. **Teste interno** (até 100 pessoas, sem revisão longa): valide com a equipe.
2. **Teste fechado:** obrigatório para conta pessoal (12 testadores por 14 dias). Recomendado também para organização.
3. **Produção:** em **Produção → Criar versão**, promova o build testado. Comece com lançamento gradual (por exemplo 20%).
4. **Revisão da Google:** costuma levar de algumas horas a 7 dias. Apps com Health Connect e dados de saúde podem levar mais.

## Checklist rápido

- [ ] Conta Play Console (organização, se possível)
- [ ] `eas init` feito e `EAS_PROJECT_ID` configurado
- [ ] APK de teste aprovado pela equipe
- [ ] AAB de produção gerado
- [ ] Política de privacidade revisada (citar o Health Connect)
- [ ] Formulários: acesso ao app, anúncios, classificação, público-alvo, saúde, segurança dos dados, Health Connect, exclusão de conta
- [ ] Ficha com textos, ícone, gráfico e capturas do app real
- [ ] Teste interno → fechado → produção
- [ ] Antes da produção: API apontando para o ambiente de **produção** (hoje `api.vettafit.com.br` é a homologação, com dados de exemplo)
