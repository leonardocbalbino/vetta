# ADR-011 — IA de treino

**Status:** aceito (Fase 3)

## Contexto

O Pro Plus inclui um assistente que monta programas de treino, sugere ajuste de carga e resume a semana do aluno. Os riscos:

- inventar exercícios que não existem na biblioteca;
- publicar algo que o personal não revisou;
- enviar dados de saúde além do necessário;
- custo sem controle.

## Decisão

- **Abstração `AiProvider`** em `packages/server/src/ai`, com implementação Anthropic.
  - Usa o SDK oficial (`@anthropic-ai/sdk`), modelo por `AI_MODEL` (padrão `claude-opus-5-5`) e esforço por `AI_EFFORT`.
  - Loop de ferramentas próprio: o modelo busca exercícios com `search_exercises` e entrega o resultado chamando `submit_program`, uma ferramenta com schema estrito.
  - A saída é validada com Zod e, depois, por regras de negócio. Cada id de exercício é conferido contra a biblioteca do tenant e a global.
  - Erros voltam ao modelo para correção. Se persistirem depois de 2 tentativas, a geração falha (502 `AI_FAILED`) e nada é criado.
  - Se o modelo recusar, o fallback do servidor da Anthropic repete em outro modelo (`fallbacks: "default"`, desligável por `AI_REFUSAL_FALLBACK`).
- **Revisão obrigatória.**
  - O programa gerado vira `DRAFT` com `aiGenerated = true`.
  - As justificativas ficam nas observações de cada rotina e exercício.
  - Publicar continua sendo a mesma ação explícita do construtor; o aluno não vê rascunhos.
- **Minimização (LGPD):**
  - A IA não recebe nome, e-mail, telefone, documentos nem endereço.
  - Idade vai em faixa (`30-39`).
  - Perguntas de identificação da anamnese são descartadas.
  - Nos textos livres, contatos, documentos e o nome do aluno são substituídos.
- **Custo e cota:**
  - Cada chamada grava tokens (entrada, saída e cache) e custo estimado em `ai_generations`.
  - A cota mensal é a feature `workouts.ai_monthly` (contam só as gerações bem-sucedidas no mês de São Paulo).
  - O admin vê uso e custo por mês, modelo e personal.
- **Testes sem rede:**
  - `ReplayMessagesClient` reproduz respostas gravadas no formato real da API (`packages/server/src/ai/recordings.ts`).
  - Os exercícios aparecem como `{{id:Nome}}` e só viram ids reais se o nome veio de uma busca feita na conversa. Assim, os testes provam que um exercício inventado é recusado.

## Consequências

- **Trocar de provedor:** basta implementar `AiProvider`. As tarefas (prompts, ferramentas, schemas) ficam fora do provider.
- **Tabela de preços:** fica no código (`pricing.ts`) e precisa acompanhar a tabela pública. As variáveis `AI_PRICE_*` permitem corrigir sem deploy de código.
- **Primeira validação com a chave real:** pendência registrada em `docs/pendencias.md`.
