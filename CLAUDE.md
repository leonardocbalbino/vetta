# 1. PRODUTO
Vetta é um SaaS multi-tenant de gestão de treino para personal trainers, inspirado no MFIT Personal (mfitpersonal.com.br), com paridade de funcionalidades e diferenciais em planos configuráveis, upload e notificações.
Slogan: Seu método. Seu aluno. Sua evolução.
Idioma da interface: português do Brasil (pt-BR), com i18n preparado para en e es. Moeda BRL. Fuso padrão America/Sao_Paulo, mas sempre gravar em UTC e exibir no fuso do usuário.
Domínio: vettafit.com.br
- usevetta.com.br: landing page e páginas de venda dos personais (/p/[slug])
- app.vettafit.com.br: web do personal e do aluno
- admin.vettafit.com.br: painel ADMIN
- api.vettafit.com.br: API
- cdn.vettafit.com.br: mídia

# 2. HIERARQUIA E PERFIS
- SUPER_ADMIN e ADMIN_OPERADOR (dono da plataforma): gerenciam personais, planos, features, biblioteca global, conteúdos, financeiro da plataforma, suporte e campanhas. Únicos que cruzam tenants.
- PERSONAL (dono do tenant): gerencia seus alunos, treinos, avaliações, anamneses, cobranças, agenda, marca e equipe.
- PERSONAL_ASSISTENTE (só Pro Plus): prescreve e acompanha apenas alunos atribuídos; sem acesso a financeiro, configurações ou assinatura.
- ALUNO: vê e executa seus treinos, registra cargas, envia feedback, responde anamneses, envia fotos, paga e conversa com o personal. Um mesmo usuário pode ser aluno de mais de um personal (tabela student_links); o app mostra seletor de vínculo.

# 3. PRODUTOS
1. Landing page (Next.js, SSG)
2. Web ADMIN (Next.js)
3. Web Personal + Aluno (Next.js, layout por perfil)
4. App mobile (React Native + Expo) com modo Aluno e modo Personal
Todos consomem a mesma API. Nenhum front-end acessa o banco diretamente.

# 4. MÓDULOS E FEATURE KEYS
Cada módulo registra suas feature keys no catálogo de features:
M1 core.auth – contas, login (senha, Google, Apple, magic link, biometria no mobile), 2FA, convites
M2 students.* – ficha do aluno, grupos, importação CSV, linha do tempo, frequência, alerta de aluno sumido
M3 assessment.anamnesis – modelos prontos (PAR-Q, saúde geral, lesões) e construtor de formulários
M4 assessment.physical / assessment.posture – protocolos Pollock 3 e 7 dobras, Jackson-Pollock, Guedes, Petroski, Faulkner, Durnin-Womersley, bioimpedância manual, perimetria, IMC, RCQ; avaliação postural com fotos e marcações; comparativos e PDF
M5 library.* – biblioteca global (admin) e própria (personal) de exercícios com vídeo, GIF e imagem, pastas e favoritos
M6 workouts.* – programa > rotina (A, B, C) > exercícios > séries; métodos bi-set, tri-set, circuito, drop-set, rest-pause, pirâmide, AMRAP, EMOM, cardio; clonar, modelos, aplicar a grupo, treino extra, periodização, link público e WhatsApp, assistente de IA
M7 training.player – player do aluno com vídeo, cronômetro de descanso, registro de carga por série, offline-first, feedback obrigatório ao finalizar, recordes pessoais
M8 progress.* – gráficos de peso, medidas, % gordura, cargas e volume; fotos antes/depois
M9 comms.* – chat 1:1 com texto, áudio, imagem e vídeo; atalho WhatsApp; comunicados em massa
M10 schedule.* – agenda presencial e online, recorrência, confirmação, Google Calendar
M11 finance.* – planos de consultoria, cobrança Pix/boleto/cartão com split, recorrência, lembretes, bloqueio de inadimplente, carteira, saque, despesas, relatório mensal
M12 brand.* – página de vendas do personal com checkout; white label (logo, cores, domínio próprio, e-mails)
M13 docs.* – pasta de documentos por aluno (exames, plano alimentar, contratos)
M14 academy.* – cursos, e-books e posts publicados pelo admin

# 5. PLANOS (configuráveis pelo ADMIN, nunca fixos no código)
Seed inicial:
- FREE (R$ 0): 2 alunos; biblioteca global; rotinas; player; feedback; anamnese pronta; 1 avaliação física por aluno; chat só texto.
- PRO (R$ 39,90/mês): 50 alunos; + anamnese personalizada, avaliações ilimitadas, postural, 5 GB de vídeos próprios, periodização, chat com mídia, comunicados, agenda, cobrança de alunos, página de vendas, PDF com logo.
- PRO_PLUS (R$ 79,90/mês): alunos ilimitados; + 50 GB, IA de treino, até 5 assistentes, white label e domínio próprio, WhatsApp, Google Calendar, relatórios avançados e exportação, suporte prioritário, taxa de split menor.
Trial: 14 dias de PRO_PLUS sem cartão; ao fim, cai para FREE e alunos excedentes são arquivados (nunca apagados).
Ciclos: mensal, trimestral, semestral e anual; cupons.
Resolução de feature: override do tenant (com expiração) ?? valor do plano ?? padrão do catálogo. Tipos: boolean e limit (-1 = ilimitado). Cache em Redis por tenant, invalidado quando o admin altera plano ou override.
Backend: decorator @RequireFeature(key) e assertLimit(key) antes de criar recursos; erro HTTP 402 com código FEATURE_LOCKED e o plano mínimo. Front: GET /me/entitlements e hook useFeature(key) que esconde ou mostra cadeado com CTA de upgrade. Downgrade nunca apaga dados: o que sai do plano vira somente leitura.

# 6. STACK OBRIGATÓRIA
- Monorepo: Turborepo + pnpm workspaces. TypeScript strict em tudo. Node 22 LTS.
- API: NestJS 11, Prisma ORM, PostgreSQL 16, Redis 7, BullMQ, Zod para validação compartilhada (nestjs-zod), OpenAPI gerado automaticamente, Socket.IO para tempo real.
- Web: Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui, TanStack Query, React Hook Form + Zod, next-intl.
- Mobile: Expo SDK atual, Expo Router, TanStack Query, SQLite (expo-sqlite) para offline do player, expo-notifications, expo-av/expo-video, expo-camera, expo-local-authentication, EAS Build e EAS Update.
- Storage: Cloudflare R2 (API S3) com URLs pré-assinadas; vídeo via Mux ou Cloudflare Stream (abstração VideoProvider).
- Pagamentos: abstração PaymentProvider com implementação Asaas (subcontas, split, Pix, boleto, cartão, recorrência); preparar Pagar.me como segunda implementação.
- E-mail: Resend (abstração EmailProvider) com templates em React Email. Push: Expo Push. WhatsApp: API oficial da Meta via abstração WhatsAppProvider.
- Observabilidade: Sentry (api, web, mobile), logs estruturados com pino, OpenTelemetry.
- Testes: Vitest (unit), Supertest (API e2e com Postgres em container via Testcontainers), Playwright (web e2e), Maestro (mobile e2e).
- Infra local: docker-compose com postgres, redis, minio (simula R2), mailpit (simula e-mail).
- CI: GitHub Actions (lint, typecheck, testes, build) em todo PR.

# 7. ESTRUTURA DO MONOREPO
apps/api            NestJS
apps/worker         processadores BullMQ (mídia, notificações, cobranças, agendador)
apps/web            Next.js personal + aluno (app.usevetta.com.br)
apps/admin          Next.js admin (admin.usevetta.com.br)
apps/site           Next.js landing + páginas de venda (usevetta.com.br)
apps/mobile         Expo
packages/db         schema Prisma, migrations, seed, cliente
packages/contracts  schemas Zod, tipos e enums compartilhados (fonte única de DTOs)
packages/sdk        cliente HTTP tipado da API (usado por web, admin, mobile)
packages/ui         componentes web (shadcn) com os tokens da marca
packages/ui-native  componentes mobile com os mesmos tokens
packages/tokens     design tokens (cores, tipografia, espaços, raios) exportados para Tailwind e React Native
packages/emails     templates React Email
packages/config     eslint, tsconfig, prettier, tailwind preset
packages/fitness    cálculos puros: protocolos de dobras, IMC, RCQ, 1RM, volume, progressão de periodização (100% testado)

# 8. MULTI-TENANT E SEGURANÇA
- Toda tabela de negócio tem id (UUID v7), tenant_id, created_at, updated_at, deleted_at.
- Isolamento em duas camadas: (a) extensão do Prisma que injeta tenant_id em toda query; (b) Row Level Security no Postgres usando SET LOCAL app.tenant_id por transação. Testes automatizados devem provar que um tenant não lê dados de outro.
- Autorização centralizada: can(user, action, resource) para papel + hasFeature(tenant, key) para plano, num único guard.
- Senhas com Argon2id; JWT de acesso de 15 min + refresh rotativo com detecção de reuso; sessões por dispositivo revogáveis; 2FA TOTP obrigatório para admin.
- Impersonação só para admin, com motivo obrigatório, banner visível e registro em audit_logs.
- Rate limit por IP e usuário; helmet; CORS restrito aos subdomínios; validação Zod em toda entrada; nenhum segredo no código (usar .env com schema validado na inicialização).
- LGPD: dados de saúde são sensíveis; consentimento específico versionado (tabela consents); exportação e exclusão de dados pelo titular; remoção de EXIF/GPS de fotos.

# 9. UPLOAD (regra geral)
Nunca enviar bytes pela API. Fluxo: POST /uploads (purpose, nome, mime, tamanho) > API valida papel, plano, cota e regras do purpose > cria media(status=pending) e devolve URL pré-assinada (multipart acima de 20 MB) > cliente envia direto ao R2 com progresso e retomada > POST /uploads/:id/complete > worker processa (status processing > ready ou failed) > evento media.ready.
Purposes e limites: exercise_video 500 MB (MP4/MOV, HLS 360p/720p, thumbnail, GIF de prévia); exercise_image 10 MB; progress_photo 15 MB e posture_photo 15 MB (JPG/PNG/HEIC, remover EXIF, WEBP); document 20 MB (PDF/JPG/PNG, antivírus ClamAV, prévia); chat_media 100 MB; avatar e brand_logo 5 MB (SVG sanitizado); kyc_document 10 MB (acesso só admin financeiro); academy_content 2 GB.
Validar tipo pelos bytes (magic number). Buckets privados, leitura por URL assinada de 15 min. Cota por tenant em tenant_storage_usage com aviso em 80% e bloqueio em 100%. Exclusão lógica e física após 30 dias; limpeza de pending órfãos a cada 24 h.

# 10. NOTIFICAÇÕES (regra geral)
Módulos só publicam eventos de domínio (ex.: workout.completed, invoice.overdue). Um NotificationService central decide destinatário, canal e horário com base em regras, preferências por categoria (treino, chat, financeiro, marketing, segurança), horário de silêncio (22h às 7h no fuso do usuário, exceto segurança), plano e agrupamento. Canais: in-app (sino + WebSocket), push (Expo), e-mail, WhatsApp (Pro Plus) e SMS (só segurança). Templates versionados por evento, canal e idioma, com white label. delivery_logs com status enviado, entregue, aberto, clicado e falhou; retry com backoff; tokens push inválidos removidos. Todo push tem deep link.

# 11. MARCA E DESIGN
Logo: símbolo em forma de V que vira check (traço arredondado, pontos 7,16 / 19,36 / 41,9 num viewBox 48x48, stroke 7.5, cantos e pontas round) + palavra vetta em minúsculas, Archivo Expanded (font-stretch 125%) peso 800, letter-spacing -0.03em.
Cores (tokens):
- tinta #101418 (fundo escuro, texto principal)
- cume #C6F432 (destaque, conquistas, botão principal do aluno; nunca como texto sobre fundo claro)
- cobalto #2F5BFF (ações, links, selo Pro)
- nevoa #F4F5F1 (fundo claro)
- grafite #5B6168 (texto secundário)
- linha #E3E5DF (bordas)
- sucesso #1F8A4C, alerta #C98A0B, erro #D03838
Tipografia: Archivo Expanded 700/800 para títulos e números de destaque; Inter 400 a 700 para interface. Escala 12, 14, 16, 20, 24, 32, 48.
Raios: 12 px em botões e inputs, 16 a 24 px em cartões. Espaçamento em múltiplos de 4.
Selos de plano: Free (contorno grafite), Pro (fundo cobalto, texto branco), Pro Plus (fundo tinta, texto cume).
Modo claro e escuro em web e mobile. Acessibilidade WCAG 2.2 AA: contraste 4.5:1, alvos de toque de 44 px, navegação por teclado, labels em todos os campos.
Tom de voz: direto, motivador, sem jargão; tratar o usuário por você.

# 12. REGRAS DE TRABALHO
- Trabalhe em fases e em branches (feat/fase-x-...). Commits pequenos no padrão Conventional Commits.
- Antes de codar uma fase, escreva um plano curto em docs/plans/fase-x.md e siga-o.
- Toda regra de negócio tem teste. Toda rota tem teste e2e de permissão (papel errado = 403, plano errado = 402, outro tenant = 404).
- Nada de dados falsos em produção; seed de desenvolvimento separado (1 admin, 3 personais – um por plano –, 10 alunos, treinos e pagamentos de exemplo).
- Mantenha docs/ atualizada: arquitetura, decisões (ADRs), variáveis de ambiente e como rodar.
- Ao fim de cada fase, entregue: resumo do que foi feito, como testar manualmente, pendências e riscos.
- Se algo deste documento for inviável ou conflitante, pare e pergunte antes de decidir sozinho.
