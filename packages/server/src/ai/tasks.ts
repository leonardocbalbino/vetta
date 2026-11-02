import {
  AI_LEVEL_LABEL,
  AiLoadSuggestionsSchema,
  AiProgramDraftSchema,
  AiWeeklySummarySchema,
  SetType,
  TrainingMethod,
  type AiLoadSuggestions,
  type AiProgramDraft,
  type AiProgramRequest,
  type AiWeeklySummary,
} from '@vetta/contracts';
import { z } from 'zod';
import type { MinimizedStudent } from './minimize';
import { defineTool, type AiTask, type AiTool, type JsonSchema } from './provider';

/** Tarefas de IA de treino: prompts, ferramentas e formatos de saída. */

export interface ExerciseHit {
  id: string;
  name: string;
  category: string;
  level: string;
  primaryMuscles: string[];
  equipment: string[];
}

export interface LibraryAccess {
  search(q: {
    query: string;
    muscle: string | null;
    equipment: string | null;
    limit: number;
  }): Promise<ExerciseHit[]>;
  /** Ids (dentre os informados) que existem e estão ativos na biblioteca do personal. */
  existing(ids: string[]): Promise<Set<string>>;
}

const str = { type: 'string' } as const;
const nullable = (type: string) => ({ type: [type, 'null'] });
const obj = (properties: Record<string, unknown>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SearchInput = z.object({
  query: z.string().trim().max(100),
  muscle: z.string().trim().max(60).nullable().optional(),
  equipment: z.string().trim().max(60).nullable().optional(),
  limit: z.number().int().min(1).max(25).nullable().optional(),
});

export function searchExercisesTool(library: LibraryAccess): AiTool {
  return defineTool({
    name: 'search_exercises',
    description:
      'Busca exercícios na biblioteca do personal (a única fonte permitida). Pesquise por nome, padrão de movimento ou músculo, em português. Retorna id, nome, categoria, nível, músculos e equipamentos. Faça várias buscas curtas (ex.: "agachamento", "remada", "glúteo") em vez de uma longa.',
    inputSchema: obj({
      query: str,
      muscle: nullable('string'),
      equipment: nullable('string'),
      limit: nullable('integer'),
    }),
    parse: (raw) => SearchInput.parse(raw),
    run: async (input) => {
      const hits = await library.search({
        query: input.query,
        muscle: input.muscle ?? null,
        equipment: input.equipment ?? null,
        limit: input.limit ?? 12,
      });
      return hits.length ? hits : { results: [], hint: 'Nada encontrado. Tente outro termo.' };
    },
  });
}

const RATIONALE = { type: 'string', description: 'Justificativa curta (1 frase).' };

const PROGRAM_OUTPUT_SCHEMA: JsonSchema = obj({
  name: str,
  goal: str,
  rationale: RATIONALE,
  routines: {
    type: 'array',
    items: obj({
      label: { type: 'string', description: 'Letra da rotina: A, B, C…' },
      name: str,
      rationale: RATIONALE,
      items: {
        type: 'array',
        items: obj({
          exerciseId: { type: 'string', description: 'id retornado por search_exercises' },
          method: { type: 'string', enum: [...TrainingMethod] },
          groupId: {
            type: ['string', 'null'],
            description: 'Mesmo valor agrupa bi-set/tri-set/circuito',
          },
          restSeconds: nullable('integer'),
          rationale: RATIONALE,
          sets: {
            type: 'array',
            items: obj({
              type: { type: 'string', enum: [...SetType] },
              reps: { type: ['string', 'null'], description: 'Ex.: "10", "8-12"' },
              targetLoadKg: nullable('number'),
              durationSeconds: nullable('integer'),
              rpe: nullable('number'),
              rir: nullable('integer'),
            }),
          },
        }),
      },
    }),
  },
});

const SYSTEM_PROGRAM = `Você é um assistente de prescrição de treino para personal trainers no Brasil.
Monte um programa de musculação seguro e coerente com o objetivo, o nível, a frequência, o tempo por sessão, os equipamentos e as restrições informadas.

Regras:
- Use SOMENTE exercícios encontrados com a ferramenta search_exercises e copie o id exato. Nunca invente ids nem exercícios.
- Respeite lesões e restrições: evite exercícios que as agravem e explique a escolha.
- Uma rotina por dia de treino (rótulos A, B, C…), com volume compatível com o tempo por sessão.
- Cada rotina, cada exercício e o programa trazem uma justificativa curta (1 frase, em português, tom direto).
- Cargas: use o histórico do aluno quando houver; sem histórico, deixe targetLoadKg nulo e use RPE ou RIR.
- O personal revisa tudo antes de publicar: seja objetivo.
Quando terminar, chame a ferramenta submit_program uma única vez com o programa completo.`;

export function programTask(
  req: AiProgramRequest,
  student: MinimizedStudent | null,
  library: LibraryAccess,
): AiTask<AiProgramDraft> {
  const lines = [
    `Objetivo: ${req.objective}`,
    `Nível: ${AI_LEVEL_LABEL[req.level]}`,
    `Frequência: ${req.daysPerWeek} dia(s) por semana`,
    `Tempo por sessão: ${req.minutesPerSession} minutos`,
    `Equipamentos disponíveis: ${req.equipment.length ? req.equipment.join(', ') : 'academia completa'}`,
  ];
  if (req.injuries) lines.push(`Lesões e restrições informadas pelo personal: ${req.injuries}`);
  if (req.notes) lines.push(`Observações do personal: ${req.notes}`);
  if (student) lines.push('', 'Dados do aluno (anonimizados):', JSON.stringify(student));

  return {
    system: SYSTEM_PROGRAM,
    prompt: lines.join('\n'),
    tools: [searchExercisesTool(library)],
    maxTurns: 16,
    output: {
      name: 'submit_program',
      description: 'Entrega o programa final (rascunho para revisão do personal).',
      inputSchema: PROGRAM_OUTPUT_SCHEMA,
      schema: AiProgramDraftSchema,
      validate: async (draft) => {
        if (draft.routines.length > req.daysPerWeek)
          return [`Use no máximo ${req.daysPerWeek} rotinas (dias por semana).`];
        return unknownExerciseErrors(
          draft.routines.flatMap((r) => r.items.map((i) => i.exerciseId)),
          library,
        );
      },
    },
  };
}

export async function unknownExerciseErrors(
  ids: string[],
  library: LibraryAccess,
): Promise<string[]> {
  const unique = [...new Set(ids)];
  const found = await library.existing(unique);
  return unique
    .filter((id) => !found.has(id))
    .map(
      (id) =>
        `O exercício ${id} não existe na biblioteca. Busque com search_exercises e use um id retornado.`,
    );
}

// ─── Ajuste de carga ────────────────────────────────────────────────────────

export interface LoadHistoryItem {
  exerciseId: string;
  exerciseName: string;
  prescribed: { reps: string | null; targetLoadKg: number | null; rpe: number | null }[];
  /** Últimas sessões: data e séries feitas. */
  recent: {
    date: string;
    sets: { reps: number | null; loadKg: number | null; rpe: number | null }[];
  }[];
}

const LOAD_OUTPUT_SCHEMA: JsonSchema = obj({
  summary: str,
  suggestions: {
    type: 'array',
    items: obj({
      exerciseId: str,
      currentLoadKg: nullable('number'),
      suggestedLoadKg: nullable('number'),
      change: { type: 'string', enum: ['INCREASE', 'KEEP', 'DECREASE'] },
      rationale: RATIONALE,
    }),
  },
});

export function loadSuggestionTask(
  student: MinimizedStudent,
  history: LoadHistoryItem[],
): AiTask<AiLoadSuggestions> {
  const allowed = new Set(history.map((h) => h.exerciseId));
  return {
    system: `Você ajuda personal trainers a ajustar cargas com base no desempenho registrado pelo aluno.
Para cada exercício do histórico, compare o prescrito com o realizado (repetições, carga e RPE) e sugira aumentar, manter ou reduzir.
Seja conservador: aumentos de 2,5 a 5% em membros superiores e 5 a 10% em inferiores; reduza se o RPE estiver alto ou as repetições caírem.
Cada sugestão traz uma justificativa curta em português. Chame submit_load_suggestions uma única vez.`,
    prompt: `Aluno (anonimizado): ${JSON.stringify(student)}\n\nHistórico por exercício:\n${JSON.stringify(history)}`,
    maxTurns: 4,
    output: {
      name: 'submit_load_suggestions',
      description: 'Entrega as sugestões de ajuste de carga.',
      inputSchema: LOAD_OUTPUT_SCHEMA,
      schema: AiLoadSuggestionsSchema,
      validate: (out) =>
        out.suggestions
          .filter((s) => !allowed.has(s.exerciseId))
          .map((s) => `O exercício ${s.exerciseId} não está no histórico informado.`),
    },
  };
}

// ─── Resumo semanal ─────────────────────────────────────────────────────────

export interface WeeklyStats {
  weekStart: string;
  plannedSessions: number;
  completedSessions: number;
  sessions: {
    date: string;
    routine: string;
    durationMin: number | null;
    effort: number | null;
    feedback: string | null;
  }[];
  personalRecords: { exercise: string; value: number; type: string }[];
  bodyWeightKg: { date: string; value: number }[];
}

const SUMMARY_OUTPUT_SCHEMA: JsonSchema = obj({
  headline: str,
  adherence: str,
  highlights: { type: 'array', items: str },
  concerns: { type: 'array', items: str },
  suggestedActions: { type: 'array', items: str },
});

export function weeklySummaryTask(
  student: MinimizedStudent,
  stats: WeeklyStats,
): AiTask<AiWeeklySummary> {
  return {
    system: `Você escreve o resumo semanal de um aluno para o personal trainer, em português, tom direto e motivador.
Baseie-se só nos dados. Destaque aderência, conquistas (recordes), sinais de alerta (faltas, esforço muito alto, dor citada no feedback) e até 3 ações práticas para o personal.
Até 6 itens por lista, frases curtas. Chame submit_weekly_summary uma única vez.`,
    prompt: `Aluno (anonimizado): ${JSON.stringify(student)}\n\nSemana:\n${JSON.stringify(stats)}`,
    maxTurns: 4,
    output: {
      name: 'submit_weekly_summary',
      description: 'Entrega o resumo semanal.',
      inputSchema: SUMMARY_OUTPUT_SCHEMA,
      schema: AiWeeklySummarySchema,
    },
  };
}
