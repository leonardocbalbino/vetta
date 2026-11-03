import { costMicroUsd, priceFor } from './pricing';
import {
  AiError,
  checkAiOutput,
  type AiProvider,
  type AiResult,
  type AiTask,
  type AiTool,
  type AiUsage,
} from './provider';

/**
 * IA via Groq (API compatível com OpenAI Chat Completions). Mesmo contrato do provider da
 * Anthropic: ferramentas de consulta + uma ferramenta de entrega validada por Zod.
 */

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatCompletion {
  model?: string;
  choices: {
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | string;
    message: { content: string | null; tool_calls?: ToolCall[] };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

/** O mínimo do cliente HTTP (injetável nos testes). */
export interface ChatClient {
  create(body: Record<string, unknown>): Promise<ChatCompletion>;
}

export class ChatHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Espera sugerida pela Groq num 429 ("retry-after" em segundos ou "try again in 27.1s"). */
export function retryAfterMs(res: Response, message: string): number {
  const header = Number(res.headers.get('retry-after'));
  const fromText = /try again in ([\d.]+)s/i.exec(message)?.[1];
  const seconds = header > 0 ? header : fromText ? Number(fromText) : 10;
  return Math.ceil(seconds * 1000) + 250;
}

/**
 * Cliente HTTP da Groq. No limite por minuto (429, comum no plano grátis) espera o tempo
 * indicado e tenta de novo, até `maxWaitMs` somados.
 */
export function createGroqClient(
  apiKey: string,
  baseUrl = 'https://api.groq.com/openai/v1',
  opts: { fetch?: typeof fetch; maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): ChatClient {
  const f = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWaitMs = opts.maxWaitMs ?? 90_000;
  return {
    async create(body) {
      let waited = 0;
      for (;;) {
        const res = await f(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
        const json = (await res.json().catch(() => ({}))) as ChatCompletion & {
          error?: { message?: string };
        };
        if (res.ok) return json;
        const message = json.error?.message ?? 'falha na Groq';
        const wait = res.status === 429 ? retryAfterMs(res, message) : 0;
        if (!wait || waited + wait > maxWaitMs) throw new ChatHttpError(res.status, message);
        waited += wait;
        await sleep(wait);
      }
    },
  };
}

export interface GroqAiConfig {
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens?: number;
  price?: { input?: number; output?: number };
}

/** Só os modelos de raciocínio (gpt-oss, qwen) aceitam reasoning_effort. */
const REASONING = /gpt-oss|qwen/;

export class GroqAiProvider implements AiProvider {
  readonly name = 'groq';
  readonly model: string;

  constructor(
    private readonly client: ChatClient,
    private readonly config: GroqAiConfig,
  ) {
    this.model = config.model;
  }

  async run<T>(task: AiTask<T>): Promise<AiResult<T>> {
    const started = Date.now();
    const usage: AiUsage = {
      provider: this.name,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicroUsd: 0,
      toolCalls: 0,
      turns: 0,
      durationMs: 0,
    };
    const finish = () => {
      usage.durationMs = Date.now() - started;
      usage.costMicroUsd = costMicroUsd(priceFor(this.model, this.config.price), {
        input: usage.inputTokens - usage.cacheReadTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheWrite: 0,
      });
      return usage;
    };
    const fail = (code: ConstructorParameters<typeof AiError>[0], message: string) =>
      new AiError(code, message, finish());

    const toolsByName = new Map<string, AiTool>((task.tools ?? []).map((t) => [t.name, t]));
    const tools = [
      ...(task.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
      {
        name: task.output.name,
        description: task.output.description,
        parameters: task.output.inputSchema,
      },
    ].map((fn) => ({ type: 'function', function: fn }));

    const messages: ChatMessage[] = [
      { role: 'system', content: task.system },
      { role: 'user', content: task.prompt },
    ];
    const maxTurns = task.maxTurns ?? 12;
    const maxRepairs = task.maxRepairs ?? 2;
    let repairs = 0;
    let nudged = false;

    for (let turn = 0; turn < maxTurns; turn++) {
      let res: ChatCompletion;
      try {
        res = await this.client.create({
          model: this.model,
          messages,
          tools,
          tool_choice: 'auto',
          max_completion_tokens: this.config.maxTokens ?? 16_000,
          ...(REASONING.test(this.model)
            ? {
                reasoning_effort:
                  this.config.effort === 'low'
                    ? 'low'
                    : this.config.effort === 'medium'
                      ? 'medium'
                      : 'high',
              }
            : {}),
        });
      } catch (e) {
        if (e instanceof ChatHttpError && e.status === 429)
          throw fail('UPSTREAM', 'Limite de uso da IA atingido. Tente de novo em instantes.');
        const status = e instanceof ChatHttpError ? ` (HTTP ${e.status})` : '';
        throw fail('UPSTREAM', `Falha ao chamar a IA${status}.`);
      }
      usage.turns++;
      usage.model = res.model || usage.model;
      usage.inputTokens += res.usage?.prompt_tokens ?? 0;
      usage.outputTokens += res.usage?.completion_tokens ?? 0;
      usage.cacheReadTokens += res.usage?.prompt_tokens_details?.cached_tokens ?? 0;

      const choice = res.choices[0];
      if (!choice) throw fail('NO_OUTPUT', 'A IA não respondeu.');
      if (choice.finish_reason === 'content_filter')
        throw fail('REFUSED', 'A IA recusou a solicitação.');
      if (choice.finish_reason === 'length')
        throw fail('INVALID_OUTPUT', 'A resposta da IA ficou incompleta.');

      const calls = choice.message.tool_calls ?? [];
      messages.push({
        role: 'assistant',
        content: choice.message.content ?? null,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
      if (!calls.length) {
        if (nudged) throw fail('NO_OUTPUT', 'A IA não entregou o resultado.');
        nudged = true;
        messages.push({
          role: 'user',
          content: `Entregue o resultado agora chamando a ferramenta ${task.output.name}.`,
        });
        continue;
      }

      let final: { value: T } | null = null;
      for (const call of calls) {
        usage.toolCalls++;
        const reply = (content: string) =>
          messages.push({ role: 'tool', tool_call_id: call.id, content });
        let input: unknown;
        try {
          input = JSON.parse(call.function.arguments || '{}');
        } catch {
          if (call.function.name === task.output.name) repairs++;
          reply('ERRO: argumentos não são um JSON válido. Envie de novo.');
          continue;
        }
        if (call.function.name === task.output.name) {
          const checked = await checkAiOutput(task, input);
          if (checked.ok) {
            final = { value: checked.value };
            reply('Recebido.');
          } else {
            repairs++;
            reply(`ERRO. Corrija e envie de novo:\n- ${checked.messages.join('\n- ')}`);
          }
          continue;
        }
        const tool = toolsByName.get(call.function.name);
        if (!tool) {
          reply(`ERRO: ferramenta desconhecida: ${call.function.name}.`);
          continue;
        }
        try {
          reply(JSON.stringify(await tool.execute(input)));
        } catch (e) {
          reply(`ERRO: ${e instanceof Error ? e.message : 'entrada inválida.'}`);
        }
      }
      if (final) return { output: final.value, usage: finish() };
      if (repairs > maxRepairs)
        throw fail('INVALID_OUTPUT', 'A IA não produziu um resultado válido.');
    }
    throw fail('TOO_MANY_TURNS', 'A IA excedeu o limite de etapas.');
  }
}
