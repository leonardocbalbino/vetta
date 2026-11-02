import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';

/**
 * Respostas gravadas da API de mensagens (formato real do Messages API), usadas nos testes
 * e no CI no lugar da rede. Ids de exercício vêm como {{id:Nome}} (ver ReplayMessagesClient).
 */

const usage = (input: number, output: number, cacheRead = 0) =>
  ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: 0,
  }) as BetaMessage['usage'];

const message = (
  id: string,
  content: unknown[],
  stop: BetaMessage['stop_reason'],
  u: BetaMessage['usage'],
): BetaMessage =>
  ({
    id,
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: u,
  }) as unknown as BetaMessage;

const thinking = { type: 'thinking', thinking: '', signature: 'rec-signature' };

const set = (reps: string, rir: number | null = 2) => ({
  type: 'WORK',
  reps,
  targetLoadKg: null,
  durationSeconds: null,
  rpe: null,
  rir,
});

const item = (name: string, rationale: string, reps = '8-12', sets = 3) => ({
  exerciseId: `{{id:${name}}}`,
  method: 'STANDARD',
  groupId: null,
  restSeconds: 90,
  rationale,
  sets: Array.from({ length: sets }, () => set(reps)),
});

const program = (extra?: ReturnType<typeof item>) => ({
  name: 'Hipertrofia 3x — corpo inteiro',
  goal: 'Hipertrofia com foco em membros inferiores',
  rationale: 'Três sessões de corpo inteiro distribuem o volume e cabem em 60 minutos.',
  routines: [
    {
      label: 'A',
      name: 'Corpo inteiro A',
      rationale: 'Base de agachamento e empurrar na horizontal.',
      items: [
        item('Agachamento livre', 'Multiarticular principal para quadríceps e glúteos.', '6-10', 4),
        item('Supino reto com barra', 'Empurrar horizontal com progressão de carga simples.'),
        ...(extra ? [extra] : []),
      ],
    },
    {
      label: 'B',
      name: 'Corpo inteiro B',
      rationale: 'Puxar e cadeia posterior para equilibrar a semana.',
      items: [
        item('Remada curvada com barra', 'Puxar horizontal para dorsais e postura.'),
        item('Leg press 45°', 'Volume de quadríceps com menor exigência lombar.', '10-15'),
      ],
    },
  ],
});

/**
 * Geração de programa em 4 chamadas:
 * 1. busca dois termos; 2. busca mais dois; 3. entrega com um exercício que não veio de
 * nenhuma busca (o provider devolve o erro); 4. entrega corrigida.
 */
export const PROGRAM_GENERATION_RECORDING: BetaMessage[] = [
  message(
    'msg_rec_prog_1',
    [
      thinking,
      { type: 'text', text: 'Vou buscar os exercícios na biblioteca.' },
      {
        type: 'tool_use',
        id: 'toolu_rec_1',
        name: 'search_exercises',
        input: { query: 'agachamento', muscle: null, equipment: null, limit: 10 },
      },
      {
        type: 'tool_use',
        id: 'toolu_rec_2',
        name: 'search_exercises',
        input: { query: 'supino', muscle: null, equipment: null, limit: 10 },
      },
    ],
    'tool_use',
    usage(2100, 180),
  ),
  message(
    'msg_rec_prog_2',
    [
      thinking,
      {
        type: 'tool_use',
        id: 'toolu_rec_3',
        name: 'search_exercises',
        input: { query: 'remada', muscle: null, equipment: null, limit: 10 },
      },
      {
        type: 'tool_use',
        id: 'toolu_rec_4',
        name: 'search_exercises',
        input: { query: 'leg press', muscle: null, equipment: null, limit: 10 },
      },
    ],
    'tool_use',
    usage(2600, 150, 2000),
  ),
  message(
    'msg_rec_prog_3',
    [
      thinking,
      {
        type: 'tool_use',
        id: 'toolu_rec_5',
        name: 'submit_program',
        input: program(
          item('Cadeira flexora sentada', 'Isolador de posteriores (não veio de busca).'),
        ),
      },
    ],
    'tool_use',
    usage(3300, 1400, 2500),
  ),
  message(
    'msg_rec_prog_4',
    [thinking, { type: 'tool_use', id: 'toolu_rec_6', name: 'submit_program', input: program() }],
    'tool_use',
    usage(4900, 1300, 3200),
  ),
];

export const REFUSAL_RECORDING: BetaMessage[] = [
  message('msg_rec_refusal', [], 'refusal', usage(800, 0)),
];

/** O modelo responde em texto duas vezes sem chamar a ferramenta de saída. */
export const NO_OUTPUT_RECORDING: BetaMessage[] = [
  message(
    'msg_rec_text_1',
    [{ type: 'text', text: 'Aqui vai uma ideia de treino…' }],
    'end_turn',
    usage(900, 120),
  ),
  message(
    'msg_rec_text_2',
    [{ type: 'text', text: 'Treino A: agachamento…' }],
    'end_turn',
    usage(1100, 90),
  ),
];

export const LOAD_SUGGESTION_RECORDING: BetaMessage[] = [
  message(
    'msg_rec_load_1',
    [
      thinking,
      {
        type: 'tool_use',
        id: 'toolu_rec_load',
        name: 'submit_load_suggestions',
        input: {
          summary: 'Boa evolução: as repetições passaram do alvo com RPE controlado.',
          suggestions: [
            {
              exerciseId: '{{exercise}}',
              currentLoadKg: 40,
              suggestedLoadKg: 42.5,
              change: 'INCREASE',
              rationale: 'Bateu 12 repetições nas 3 séries com RPE 7.',
            },
          ],
        },
      },
    ],
    'tool_use',
    usage(1500, 300),
  ),
];

export const WEEKLY_SUMMARY_RECORDING: BetaMessage[] = [
  message(
    'msg_rec_week_1',
    [
      thinking,
      {
        type: 'tool_use',
        id: 'toolu_rec_week',
        name: 'submit_weekly_summary',
        input: {
          headline: 'Semana consistente, com um recorde novo.',
          adherence: '2 de 3 treinos feitos (67%).',
          highlights: ['Recorde no agachamento.'],
          concerns: ['Faltou o treino de sexta.'],
          suggestedActions: ['Mandar uma mensagem de incentivo na quinta.'],
        },
      },
    ],
    'tool_use',
    usage(1200, 250),
  ),
];

/** Troca {{exercise}} por um id (gravações sem busca). */
export function withExerciseId(recording: BetaMessage[], exerciseId: string): BetaMessage[] {
  return JSON.parse(
    JSON.stringify(recording).replace(/\{\{exercise\}\}/g, exerciseId),
  ) as BetaMessage[];
}
