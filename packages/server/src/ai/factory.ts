import type { SharedEnv } from '../env';
import { AnthropicAiProvider, createAnthropicClient, type MessagesClient } from './anthropic';
import { UnconfiguredAiProvider, type AiProvider } from './provider';

/** Provider de IA conforme o ambiente (client injetável para respostas gravadas nos testes). */
export function createAiProvider(env: SharedEnv, client?: MessagesClient): AiProvider {
  if (!client && !env.ANTHROPIC_API_KEY) return new UnconfiguredAiProvider();
  return new AnthropicAiProvider(client ?? createAnthropicClient(env.ANTHROPIC_API_KEY!), {
    model: env.AI_MODEL,
    effort: env.AI_EFFORT,
    refusalFallback: env.AI_REFUSAL_FALLBACK,
    price: { input: env.AI_PRICE_INPUT_PER_MTOK, output: env.AI_PRICE_OUTPUT_PER_MTOK },
  });
}
