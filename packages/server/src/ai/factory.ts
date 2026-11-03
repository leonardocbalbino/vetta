import type { SharedEnv } from '../env';
import { AnthropicAiProvider, createAnthropicClient, type MessagesClient } from './anthropic';
import { createGroqClient, GroqAiProvider } from './groq';
import { UnconfiguredAiProvider, type AiProvider } from './provider';

/** Qual provedor de IA usar: AI_PROVIDER, ou o que tiver chave (Groq primeiro). */
export function aiProviderName(env: SharedEnv): 'groq' | 'anthropic' | null {
  if (env.AI_PROVIDER) return env.AI_PROVIDER;
  if (env.GROQ_API_KEY) return 'groq';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** Provider de IA conforme o ambiente (client injetável para respostas gravadas nos testes). */
export function createAiProvider(env: SharedEnv, client?: MessagesClient): AiProvider {
  const price = { input: env.AI_PRICE_INPUT_PER_MTOK, output: env.AI_PRICE_OUTPUT_PER_MTOK };
  const name = client ? 'anthropic' : aiProviderName(env);
  if (name === 'groq' && env.GROQ_API_KEY) {
    return new GroqAiProvider(createGroqClient(env.GROQ_API_KEY, env.GROQ_BASE_URL), {
      model: env.AI_MODEL ?? 'openai/gpt-oss-120b',
      effort: env.AI_EFFORT,
      price,
    });
  }
  if (name === 'anthropic' && (client || env.ANTHROPIC_API_KEY)) {
    return new AnthropicAiProvider(client ?? createAnthropicClient(env.ANTHROPIC_API_KEY!), {
      model: env.AI_MODEL ?? 'claude-opus-5-5',
      effort: env.AI_EFFORT,
      refusalFallback: env.AI_REFUSAL_FALLBACK,
      price,
    });
  }
  return new UnconfiguredAiProvider();
}
