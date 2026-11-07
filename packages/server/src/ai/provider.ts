import type { z } from 'zod';

/**
 * Abstração do provedor de IA. A aplicação descreve a tarefa (instruções, ferramentas de
 * consulta e o formato da resposta); o provider conduz o diálogo com o modelo e devolve a
 * saída já validada pelo schema Zod, junto com o uso de tokens e o custo estimado.
 */

/** JSON Schema (subconjunto aceito por ferramentas com strict). */
export type JsonSchema = Record<string, unknown>;

export interface AiTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Valida a entrada vinda do modelo e executa (erros voltam ao modelo como is_error). */
  execute: (raw: unknown) => Promise<unknown>;
}

/** Ferramenta tipada: valida com `parse` e executa `run`. */
export function defineTool<I>(def: {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  parse: (raw: unknown) => I;
  run: (input: I) => Promise<unknown>;
}): AiTool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    execute: (raw) => def.run(def.parse(raw)),
  };
}

export interface AiOutputSpec<T> {
  /** Nome da ferramenta que o modelo chama para entregar o resultado. */
  name: string;
  description: string;
  inputSchema: JsonSchema;
  schema: z.ZodType<T>;
  /**
   * Regras de negócio além do schema (ex.: só exercícios da biblioteca). Erros voltam ao
   * modelo para correção; se persistirem, a tarefa falha.
   */
  validate?: (output: T) => Promise<string[]> | string[];
}

export interface AiTask<T> {
  system: string;
  prompt: string;
  tools?: AiTool[];
  output: AiOutputSpec<T>;
  /** Limite de idas e voltas com o modelo (padrão 12). */
  maxTurns?: number;
  /** Tentativas de correção da saída (padrão 2). */
  maxRepairs?: number;
}

export interface AiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
  toolCalls: number;
  turns: number;
  durationMs: number;
}

export interface AiResult<T> {
  output: T;
  usage: AiUsage;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  run<T>(task: AiTask<T>): Promise<AiResult<T>>;
}

export type AiErrorCode =
  'NOT_CONFIGURED' | 'REFUSED' | 'INVALID_OUTPUT' | 'NO_OUTPUT' | 'TOO_MANY_TURNS' | 'UPSTREAM';

/** Falha da IA com o uso consumido até ali (o custo é registrado mesmo na falha). */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly usage: AiUsage | null = null,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'unconfigured';
  readonly model = 'none';
  run<T>(): Promise<AiResult<T>> {
    return Promise.reject(
      new AiError('NOT_CONFIGURED', 'IA não configurada (GROQ_API_KEY ou ANTHROPIC_API_KEY).'),
    );
  }
}

/** Valida a saída entregue pelo modelo: schema Zod e depois as regras de negócio da tarefa. */
export async function checkAiOutput<T>(
  task: AiTask<T>,
  raw: unknown,
): Promise<{ ok: true; value: T } | { ok: false; messages: string[] }> {
  const parsed = task.output.schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      messages: parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`),
    };
  }
  const errors = (await task.output.validate?.(parsed.data)) ?? [];
  return errors.length
    ? { ok: false, messages: errors.slice(0, 20) }
    : { ok: true, value: parsed.data };
}
