import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { costMicroUsd, priceFor, type ModelPrice } from './pricing';
import {
  AiError,
  type AiProvider,
  type AiResult,
  type AiTask,
  type AiTool,
  type AiUsage,
} from './provider';

/** O mínimo do SDK que o provider usa (permite reproduzir respostas gravadas nos testes). */
export interface MessagesClient {
  create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage>;
}

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicAiConfig {
  model: string;
  effort: AiEffort;
  /** Reenvio no servidor para outro modelo quando o principal recusa (só modelos que aceitam). */
  refusalFallback: boolean;
  maxTokens?: number;
  price?: { input?: number; output?: number };
}

/** Modelos que aceitam `fallbacks: "default"` (beta server-side-fallback-2026-07-01). */
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function createAnthropicClient(apiKey: string): MessagesClient {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  return { create: (params) => client.beta.messages.create(params) };
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly price: ModelPrice;

  constructor(
    private readonly client: MessagesClient,
    private readonly config: AnthropicAiConfig,
  ) {
    this.model = config.model;
    this.price = priceFor(config.model, config.price);
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
      usage.costMicroUsd = costMicroUsd(priceFor(usage.model, this.config.price), {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheWrite: usage.cacheWriteTokens,
      });
      return usage;
    };
    const fail = (code: ConstructorParameters<typeof AiError>[0], message: string) =>
      new AiError(code, message, finish());

    const toolsByName = new Map<string, AiTool>((task.tools ?? []).map((t) => [t.name, t]));
    // Ordem fixa das ferramentas: mantém o prefixo estável para o cache.
    const tools = [
      ...(task.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      {
        name: task.output.name,
        description: task.output.description,
        input_schema: task.output.inputSchema,
        strict: true,
      },
    ] as BetaToolUnion[];

    const messages: BetaMessageParam[] = [{ role: 'user', content: task.prompt }];
    const maxTurns = task.maxTurns ?? 12;
    const maxRepairs = task.maxRepairs ?? 2;
    let repairs = 0;
    let nudged = false;

    for (let turn = 0; turn < maxTurns; turn++) {
      let res: BetaMessage;
      try {
        res = await this.client.create(this.params(task.system, tools, messages));
      } catch (e) {
        if (e instanceof AiError) throw e;
        const status = e instanceof Anthropic.APIError ? ` (HTTP ${e.status ?? '?'})` : '';
        throw fail('UPSTREAM', `Falha ao chamar a IA${status}.`);
      }
      usage.turns++;
      usage.model = res.model || usage.model;
      usage.inputTokens += res.usage.input_tokens;
      usage.outputTokens += res.usage.output_tokens;
      usage.cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens += res.usage.cache_creation_input_tokens ?? 0;

      if (res.stop_reason === 'refusal') throw fail('REFUSED', 'A IA recusou a solicitação.');
      if (res.stop_reason === 'max_tokens')
        throw fail('INVALID_OUTPUT', 'A resposta da IA ficou incompleta.');

      // A resposta inteira volta ao histórico (inclui blocos de raciocínio).
      messages.push({ role: 'assistant', content: res.content });
      if (res.stop_reason === 'pause_turn') continue;

      const calls = res.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
      if (!calls.length) {
        if (nudged) throw fail('NO_OUTPUT', 'A IA não entregou o resultado.');
        nudged = true;
        messages.push({
          role: 'user',
          content: `Entregue o resultado agora chamando a ferramenta ${task.output.name}.`,
        });
        continue;
      }

      const results: BetaToolResultBlockParam[] = [];
      let final: { value: T } | null = null;
      for (const call of calls) {
        usage.toolCalls++;
        if (call.name === task.output.name) {
          const errors = await this.checkOutput(task, call.input);
          if (errors.ok) {
            final = { value: errors.value };
            results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Recebido.' });
          } else {
            repairs++;
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              is_error: true,
              content: `Corrija e envie de novo:\n- ${errors.messages.join('\n- ')}`,
            });
          }
          continue;
        }
        const tool = toolsByName.get(call.name);
        if (!tool) {
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: `Ferramenta desconhecida: ${call.name}.`,
          });
          continue;
        }
        try {
          const out = await tool.execute(call.input);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) });
        } catch (e) {
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: e instanceof Error ? e.message : 'Entrada inválida.',
          });
        }
      }
      if (final) return { output: final.value, usage: finish() };
      if (repairs > maxRepairs)
        throw fail('INVALID_OUTPUT', 'A IA não produziu um resultado válido.');
      messages.push({ role: 'user', content: results });
    }
    throw fail('TOO_MANY_TURNS', 'A IA excedeu o limite de etapas.');
  }

  private async checkOutput<T>(
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

  private params(
    system: string,
    tools: BetaToolUnion[],
    messages: BetaMessageParam[],
  ): MessageCreateParamsNonStreaming {
    const fallback = this.config.refusalFallback && FALLBACK_MODELS.has(this.model);
    return {
      model: this.model,
      max_tokens: this.config.maxTokens ?? 16_000,
      system,
      tools,
      tool_choice: { type: 'auto' },
      messages,
      output_config: { effort: this.config.effort },
      // Cache automático do prefixo (sistema + ferramentas + histórico do loop).
      cache_control: { type: 'ephemeral' },
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    };
  }
}
