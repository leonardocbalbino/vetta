import { describe, expect, it } from 'vitest';
import { AnthropicAiProvider } from './anthropic';
import { ageRange, minimizeStudent, scrubText } from './minimize';
import { costMicroUsd, priceFor } from './pricing';
import { AiError } from './provider';
import {
  LOAD_SUGGESTION_RECORDING,
  NO_OUTPUT_RECORDING,
  PROGRAM_GENERATION_RECORDING,
  REFUSAL_RECORDING,
  WEEKLY_SUMMARY_RECORDING,
  withExerciseId,
} from './recordings';
import { ReplayMessagesClient } from './replay';
import {
  loadSuggestionTask,
  programTask,
  weeklySummaryTask,
  type ExerciseHit,
  type LibraryAccess,
} from './tasks';

const LIBRARY: ExerciseHit[] = [
  ['01900000-0000-7000-8000-000000000001', 'Agachamento livre', ['quadríceps']],
  ['01900000-0000-7000-8000-000000000002', 'Supino reto com barra', ['peitoral']],
  ['01900000-0000-7000-8000-000000000003', 'Remada curvada com barra', ['dorsais']],
  ['01900000-0000-7000-8000-000000000004', 'Leg press 45°', ['quadríceps']],
  // Existe na biblioteca, mas nunca é retornado pelas buscas da gravação.
  ['01900000-0000-7000-8000-000000000005', 'Cadeira flexora sentada', ['posteriores']],
].map(([id, name, muscles]) => ({
  id: id as string,
  name: name as string,
  category: 'STRENGTH',
  level: 'BEGINNER',
  primaryMuscles: muscles as string[],
  equipment: [],
}));

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const library: LibraryAccess = {
  search: ({ query }) =>
    Promise.resolve(
      LIBRARY.filter((e) => norm(e.name).includes(norm(query)) && !e.name.startsWith('Cadeira')),
    ),
  existing: (ids) => Promise.resolve(new Set(ids.filter((id) => LIBRARY.some((e) => e.id === id)))),
};

const provider = (client: ReplayMessagesClient, model = 'claude-opus-5-5') =>
  new AnthropicAiProvider(client, { model, effort: 'medium', refusalFallback: true });

const request = {
  objective: 'Hipertrofia de membros inferiores',
  level: 'INTERMEDIATE' as const,
  daysPerWeek: 3,
  minutesPerSession: 60,
  equipment: [],
  useAnamnesis: true,
  useLoadHistory: true,
};

describe('AnthropicAiProvider: geração de programa (respostas gravadas)', () => {
  it('usa só exercícios devolvidos pela busca e corrige o id desconhecido', async () => {
    const client = new ReplayMessagesClient(PROGRAM_GENERATION_RECORDING);
    const { output, usage } = await provider(client).run(programTask(request, null, library));

    const ids = output.routines.flatMap((r) => r.items.map((i) => i.exerciseId));
    expect(ids).toHaveLength(4);
    const searchable = new Set(LIBRARY.slice(0, 4).map((e) => e.id));
    for (const id of ids) expect(searchable.has(id)).toBe(true);
    expect(output.routines.every((r) => r.rationale && r.items.every((i) => i.rationale))).toBe(
      true,
    );
    expect(client.remaining).toBe(0);

    // A 3ª resposta citou um exercício que não veio de busca: o erro voltou ao modelo.
    const repairTurn = client.requests[3]!.messages.at(-1)!;
    expect(JSON.stringify(repairTurn)).toContain('não existe na biblioteca');
    expect(JSON.stringify(repairTurn)).toContain('"is_error":true');

    expect(usage).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      inputTokens: 2100 + 2600 + 3300 + 4900,
      outputTokens: 180 + 150 + 1400 + 1300,
      cacheReadTokens: 2000 + 2500 + 3200,
      turns: 4,
      toolCalls: 6,
    });
    expect(usage.costMicroUsd).toBe(
      costMicroUsd(priceFor('claude-opus-5-5'), {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheWrite: 0,
      }),
    );
  });

  it('monta a requisição conforme a API atual', async () => {
    const client = new ReplayMessagesClient(PROGRAM_GENERATION_RECORDING);
    await provider(client).run(programTask(request, null, library));
    const first = client.requests[0]!;
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.tool_choice).toEqual({ type: 'auto' });
    expect(first.output_config).toEqual({ effort: 'medium' });
    expect(first).not.toHaveProperty('thinking');
    expect(first.fallbacks).toBe('default');
    expect(first.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(first.tools?.map((t) => ('name' in t ? t.name : null))).toEqual([
      'search_exercises',
      'submit_program',
    ]);
    // O histórico devolve a resposta inteira, inclusive o bloco de raciocínio.
    const second = client.requests[1]!;
    expect(second.messages[1]).toMatchObject({ role: 'assistant' });
    expect(JSON.stringify(second.messages[1])).toContain('rec-signature');
  });

  it('não envia fallback para modelos que não aceitam', async () => {
    const client = new ReplayMessagesClient(PROGRAM_GENERATION_RECORDING);
    await provider(client, 'claude-haiku-5-5').run(programTask(request, null, library));
    expect(client.requests[0]).not.toHaveProperty('fallbacks');
  });

  it('falha quando o modelo insiste em exercício fora da biblioteca', async () => {
    const bad = PROGRAM_GENERATION_RECORDING.slice(0, 3);
    const client = new ReplayMessagesClient([...bad, bad[2]!, bad[2]!]);
    const err = await provider(client)
      .run(programTask(request, null, library))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe('INVALID_OUTPUT');
    expect((err as AiError).usage?.turns).toBe(5);
  });

  it('recusa vira AiError REFUSED com o uso registrado', async () => {
    const err = await provider(new ReplayMessagesClient(REFUSAL_RECORDING))
      .run(programTask(request, null, library))
      .catch((e: unknown) => e);
    expect((err as AiError).code).toBe('REFUSED');
    expect((err as AiError).usage?.inputTokens).toBe(800);
  });

  it('sem chamar a ferramenta de saída: lembra uma vez e depois falha', async () => {
    const client = new ReplayMessagesClient(NO_OUTPUT_RECORDING);
    const err = await provider(client)
      .run(programTask(request, null, library))
      .catch((e: unknown) => e);
    expect((err as AiError).code).toBe('NO_OUTPUT');
    expect(JSON.stringify(client.requests[1]!.messages.at(-1))).toContain('submit_program');
  });

  it('erro da API vira UPSTREAM', async () => {
    const err = await provider(new ReplayMessagesClient([]))
      .run(programTask(request, null, library))
      .catch((e: unknown) => e);
    expect((err as AiError).code).toBe('UPSTREAM');
  });
});

describe('ajuste de carga e resumo semanal', () => {
  const student = minimizeStudent({ name: 'Ana Souza' });
  const exerciseId = LIBRARY[0]!.id;
  const history = [
    {
      exerciseId,
      exerciseName: 'Agachamento livre',
      prescribed: [{ reps: '10-12', targetLoadKg: 40, rpe: 8 }],
      recent: [{ date: '2026-10-28', sets: [{ reps: 12, loadKg: 40, rpe: 7 }] }],
    },
  ];

  it('sugere carga só para exercícios do histórico', async () => {
    const ok = await provider(
      new ReplayMessagesClient(withExerciseId(LOAD_SUGGESTION_RECORDING, exerciseId)),
    ).run(loadSuggestionTask(student, history));
    expect(ok.output.suggestions[0]).toMatchObject({ change: 'INCREASE', suggestedLoadKg: 42.5 });

    const other = withExerciseId(LOAD_SUGGESTION_RECORDING, LIBRARY[1]!.id);
    const err = await provider(new ReplayMessagesClient([...other, ...other, ...other]))
      .run(loadSuggestionTask(student, history))
      .catch((e: unknown) => e);
    expect((err as AiError).code).toBe('INVALID_OUTPUT');
  });

  it('resume a semana', async () => {
    const { output } = await provider(new ReplayMessagesClient(WEEKLY_SUMMARY_RECORDING)).run(
      weeklySummaryTask(student, {
        weekStart: '2026-10-26',
        plannedSessions: 3,
        completedSessions: 2,
        sessions: [],
        personalRecords: [],
        bodyWeightKg: [],
      }),
    );
    expect(output.headline).toContain('recorde');
    expect(output.suggestedActions).toHaveLength(1);
  });
});

describe('minimização dos dados de saúde', () => {
  it('remove contatos, documentos e o nome do aluno', () => {
    const out = scrubText(
      'Ana Souza (ana@x.com, 11 98765-4321, CPF 123.456.789-09, CEP 01310-100) sente dor no joelho. Veja https://x.com/a',
      ['Ana Souza'],
    );
    expect(out).not.toMatch(/ana@|98765|123\.456|01310|https|Ana|Souza/i);
    expect(out).toContain('dor no joelho');
    expect(out).toContain('[e-mail]');
    expect(out).toContain('[telefone]');
    expect(out).toContain('[documento]');
  });

  it('idade em faixa e perguntas de identificação descartadas', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    expect(ageRange(new Date('1990-11-03'), now)).toBe('30-39');
    expect(ageRange(new Date('1990-11-02'), now)).toBe('30-39');
    expect(ageRange(new Date('2010-01-01'), now)).toBe('menor de 18');
    expect(ageRange(new Date('1950-01-01'), now)).toBe('70+');
    expect(ageRange(null)).toBeNull();

    const m = minimizeStudent(
      {
        name: 'Bruno Lima',
        birthDate: new Date('1985-05-05'),
        sex: 'MALE',
        anamnesis: [
          { question: 'Nome completo', answer: 'Bruno Lima' },
          { question: 'Telefone', answer: '11 99999-0000' },
          { question: 'Tem dor lombar?', answer: 'Sim, Bruno sente ao agachar' },
          { question: 'Fuma?', answer: '' },
        ],
        injuries: 'Lesão no ombro; contato bruno@lima.com',
      },
      now,
    );
    expect(m.ageRange).toBe('40-49');
    expect(m.anamnesis).toEqual([
      { question: 'Tem dor lombar?', answer: 'Sim, o aluno sente ao agachar' },
    ]);
    expect(m.injuries).toBe('Lesão no ombro; contato [e-mail]');
    expect(JSON.stringify(m)).not.toMatch(/Bruno|Lima|9999/);
  });
});

describe('preços', () => {
  it('calcula o custo em micro-dólares e aceita sobrescrita', () => {
    const p = priceFor('claude-opus-5-5');
    expect(costMicroUsd(p, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(
      4_000_000,
    );
    expect(costMicroUsd(p, { input: 0, output: 1000, cacheRead: 1000, cacheWrite: 0 })).toBe(
      20_200,
    );
    expect(priceFor('modelo-desconhecido').input).toBe(0);
    expect(priceFor('claude-opus-5-5', { input: 3 })).toMatchObject({ input: 3, output: 20 });
  });
});
