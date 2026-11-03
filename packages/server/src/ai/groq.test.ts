import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAiProvider } from './factory';
import { createGroqClient, GroqAiProvider, type ChatClient, type ChatCompletion } from './groq';
import { type AiError, type AiTask } from './provider';
import type { SharedEnv } from '../env';

const call = (name: string, args: unknown, id = name): ChatCompletion => ({
  model: 'openai/gpt-oss-120b',
  choices: [
    {
      finish_reason: 'tool_calls',
      message: {
        content: null,
        tool_calls: [
          {
            id,
            type: 'function',
            function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
          },
        ],
      },
    },
  ],
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 400 },
  },
});

const replay = (...responses: ChatCompletion[]) => {
  const bodies: Record<string, unknown>[] = [];
  const client: ChatClient = {
    create: (body) => {
      bodies.push(structuredClone(body));
      const next = responses.shift();
      return next ? Promise.resolve(next) : Promise.reject(new Error('sem resposta gravada'));
    },
  };
  return { client, bodies };
};

const task = (): AiTask<{ total: number }> => ({
  system: 'Some números.',
  prompt: 'Quanto é 2 + 3?',
  tools: [
    {
      name: 'add',
      description: 'Soma',
      inputSchema: { type: 'object' },
      execute: (raw) => {
        const { a, b } = raw as { a: number; b: number };
        return Promise.resolve({ sum: a + b });
      },
    },
  ],
  output: {
    name: 'submit',
    description: 'Entrega',
    inputSchema: { type: 'object' },
    schema: z.object({ total: z.number() }),
    validate: (o) => (o.total === 5 ? [] : ['O total está errado.']),
  },
});

const provider = (client: ChatClient) =>
  new GroqAiProvider(client, { model: 'openai/gpt-oss-120b', effort: 'medium' });

describe('GroqAiProvider', () => {
  it('usa as ferramentas, devolve os resultados e entrega a saída validada', async () => {
    const { client, bodies } = replay(call('add', { a: 2, b: 3 }), call('submit', { total: 5 }));
    const r = await provider(client).run(task());
    expect(r.output).toEqual({ total: 5 });
    expect(r.usage).toMatchObject({ provider: 'groq', turns: 2, toolCalls: 2, inputTokens: 2000 });
    // Entrada sem cache (600×2) a US$ 0,15/M + cache (400×2) a 0,075 + saída 400 a 0,60.
    expect(r.usage.costMicroUsd).toBe(480);

    const first = bodies[0]!;
    expect(first).toMatchObject({
      model: 'openai/gpt-oss-120b',
      reasoning_effort: 'medium',
      tool_choice: 'auto',
    });
    expect((first.tools as { function: { name: string } }[]).map((t) => t.function.name)).toEqual([
      'add',
      'submit',
    ]);
    const second = bodies[1]!.messages as { role: string; content: string }[];
    expect(second.at(-1)).toMatchObject({ role: 'tool', content: '{"sum":5}' });
  });

  it('erro de validação volta ao modelo para correção; insistência vira INVALID_OUTPUT', async () => {
    const { client, bodies } = replay(call('submit', { total: 4 }), call('submit', { total: 5 }));
    expect((await provider(client).run(task())).output.total).toBe(5);
    const msgs = bodies[1]!.messages as { content: string }[];
    expect(msgs.at(-1)!.content).toContain('O total está errado.');

    const wrong = replay(...[1, 2, 3].map(() => call('submit', '{quebrado')));
    const err = await provider(wrong.client)
      .run(task())
      .catch((e: unknown) => e);
    expect((err as AiError).code).toBe('INVALID_OUTPUT');
  });

  it('sem ferramenta de saída: lembra uma vez e depois falha', async () => {
    const text: ChatCompletion = {
      choices: [{ finish_reason: 'stop', message: { content: 'oi' } }],
    };
    const err = await provider(replay(text, text).client)
      .run(task())
      .catch((e: unknown) => e);
    expect((err as AiError).code).toBe('NO_OUTPUT');
  });
});

describe('cliente da Groq', () => {
  const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it('no limite por minuto espera o tempo pedido e tenta de novo', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, { error: { message: 'Please try again in 2.5s.' } }))
      .mockResolvedValueOnce(res(200, { choices: [] }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await createGroqClient('k', undefined, { fetch, sleep }).create({});
    expect(sleep).toHaveBeenCalledWith(2750);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });

  it('desiste quando a espera passaria do limite', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(res(429, { error: { message: 'x' } }, { 'retry-after': '60' }));
    const c = createGroqClient('k', undefined, {
      fetch,
      sleep: () => Promise.resolve(),
      maxWaitMs: 90_000,
    });
    await expect(c.create({})).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('escolha do provedor de IA', () => {
  const env = (e: Partial<SharedEnv>) =>
    ({ AI_EFFORT: 'medium', AI_REFUSAL_FALLBACK: true, ...e }) as SharedEnv;
  it('Groq quando há chave; Anthropic se pedido; sem chave, não configurado', () => {
    expect(createAiProvider(env({ GROQ_API_KEY: 'g' })).name).toBe('groq');
    expect(createAiProvider(env({ GROQ_API_KEY: 'g' })).model).toBe('openai/gpt-oss-120b');
    expect(
      createAiProvider(env({ GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_PROVIDER: 'anthropic' }))
        .name,
    ).toBe('anthropic');
    expect(createAiProvider(env({ ANTHROPIC_API_KEY: 'a' })).model).toBe('claude-opus-5-5');
    expect(createAiProvider(env({})).name).toBe('unconfigured');
  });
});
