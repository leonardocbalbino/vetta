# Fase 1 – MVP

Branch: `feat/fase-1-mvp` (criada a partir de `feat/fase-0-fundacao`, ainda não mergeada).

**Critério de pronto:** um personal se cadastra, convida um aluno e prescreve um treino; o aluno treina pelo app, inclusive offline; o personal vê o feedback e a evolução.

## Ordem de execução

Back-end e testes primeiro, para que cada tela consuma uma API já validada.

1. **Cálculos (`packages/fitness`):** protocolos de dobras (Pollock 3 e 7, Jackson-Pollock 3 feminino, Guedes, Petroski, Faulkner, Durnin-Womersley), Siri e Brozek, IMC, RCQ, classificações, 1RM, volume, recordes pessoais e sugestão de carga. Testes contra valores de referência publicados.
2. **Schema (migration aditiva + RLS regenerada):**
   - campos novos de exercício, aluno, série, item de rotina, sessão e feedback;
   - `exercise_aliases` em `Exercise.aliases` e busca por coluna `search_text` sem acento;
   - `legal_documents`;
   - configurações do tenant (dias para alerta de aluno sumido);
   - horário de lembrete do usuário.
3. **API:**
   - biblioteca (global e própria, pastas, favoritos, busca, importação CSV);
   - alunos (ficha, filtros, ações em massa, tags, grupos, CSV, frequência, sumidos);
   - anamnese (modelos prontos, envio com prazo, resposta, risco PAR-Q, consentimento);
   - avaliação física (protocolos, comparativo, PDF no worker);
   - treinos (programa > rotina > item > série com save atômico, clonar, modelo, aplicar a vários alunos ou grupo, treino extra, link público revogável);
   - execução (treino do dia, sync idempotente por `client_session_id`, feedback obrigatório, recordes);
   - evolução (séries de dados para gráficos);
   - caixa de feedbacks;
   - dashboards do personal e do admin;
   - admin (personais, bloqueio, override, planos e preços, matriz, biblioteca global, audit log com busca);
   - documentos legais.
4. **Notificações e agendador (§1.11):** novos eventos e regras; jobs de lembrete de treino, aluno sumido, aniversário, reavaliação, trial no dia e novo personal (admin).
5. **Web personal + aluno:**
   - layouts por perfil, sino e selo do plano;
   - início do personal, lista e ficha de aluno;
   - construtor de treino com dnd-kit, biblioteca, avaliações e feedbacks;
   - assinatura e onboarding;
   - área do aluno com player web;
   - link público.
6. **Mobile:** seleção de modo e vínculo, player offline (SQLite + fila de sync), evolução, fotos com guia de pose, anamnese, lembrete local, modo personal enxuto, push com deep links, ícone e splash, `eas.json`.
7. **Admin:** dashboard, personais, planos e matriz com prévia de impacto, biblioteca global com importador e fila de vídeos, audit log.
8. **Site:** home, preços (API, mensal/anual), páginas legais, blog MDX, SEO, banner LGPD (GA4 e Pixel só após consentimento).
9. **Testes:** unitários (fórmulas, progressão, recordes), e2e da API por fluxo, Playwright (cadastro até o aluno concluir o treino pelo link público) e Maestro (login, treino offline, sync).

## Proteção por feature key

| Recurso                         | Feature key                                            |
| ------------------------------- | ------------------------------------------------------ |
| Biblioteca própria              | `library.custom`                                       |
| Vídeos próprios                 | `library.custom_videos`                                |
| Grupos                          | `students.groups`                                      |
| CSV                             | `students.import_csv`                                  |
| Alerta de aluno sumido          | `students.inactivity_alert`                            |
| Anamnese pronta / personalizada | `assessment.anamnesis` / `assessment.anamnesis_custom` |
| Avaliações por aluno            | `assessment.physical_per_student` (limite)             |
| PDF com logo                    | `assessment.pdf_branding`                              |
| Modelos                         | `workouts.templates`                                   |
| Aplicar a vários alunos         | `workouts.group_apply`                                 |
| Link público                    | `workouts.public_link`                                 |
| Periodização                    | `workouts.periodization`                               |
| Player                          | `training.player`                                      |
| Fotos de progresso              | `progress.photos`                                      |

## Decisões

- **Busca sem acento:** coluna `search_text` normalizada pela aplicação (NFD + minúsculas), com índice trigram (`pg_trgm`). Evita depender de `unaccent` em índice.
- **Save atômico do programa:** o construtor envia o programa inteiro (PUT) e a API reconcilia rotinas, itens e séries numa transação de tenant. Simplifica o offline e o "desfazer".
- **PDF:** react-pdf no worker (sem browser headless no container).
- **Escopo honesto:** o que não couber nesta fase fica listado em "Pendências" no resumo, nunca simulado.
