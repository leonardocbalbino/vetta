/** Preço em US$ por milhão de tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Tabela de preços (Anthropic e Groq, out/2026). Pode ser sobrescrita por
 * AI_PRICE_INPUT_PER_MTOK e AI_PRICE_OUTPUT_PER_MTOK quando o preço mudar.
 * Escrita em cache: 1,25× o preço de entrada (TTL de 5 min).
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // Groq (preço público; confira em groq.com/pricing e ajuste por AI_PRICE_* se mudar).
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
  'openai/gpt-oss-20b': { input: 0.075, output: 0.3, cacheRead: 0.0375, cacheWrite: 0 },
};

export function priceFor(
  model: string,
  override?: { input?: number; output?: number },
): ModelPrice {
  const base = MODEL_PRICES[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (override?.input === undefined && override?.output === undefined) return base;
  const input = override.input ?? base.input;
  return {
    input,
    output: override.output ?? base.output,
    cacheRead: override.input !== undefined ? input * 0.1 : base.cacheRead,
    cacheWrite: override.input !== undefined ? input * 1.25 : base.cacheWrite,
  };
}

/** Custo em milionésimos de dólar (US$ 1 = 1.000.000). */
export function costMicroUsd(
  price: ModelPrice,
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number {
  // US$/MTok × tokens / 1e6 × 1e6 micro = US$/MTok × tokens
  return Math.round(
    price.input * tokens.input +
      price.output * tokens.output +
      price.cacheRead * tokens.cacheRead +
      price.cacheWrite * tokens.cacheWrite,
  );
}
