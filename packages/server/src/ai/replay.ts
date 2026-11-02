import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { MessagesClient } from './anthropic';

/**
 * Cliente que reproduz respostas gravadas da API (testes e CI, sem rede).
 *
 * As gravações podem citar exercícios por nome com `{{id:Nome do exercício}}`: o token é
 * trocado pelo id que apareceu nos resultados de ferramenta já enviados na conversa. Se o
 * nome não foi retornado por nenhuma busca, o token vira um id inexistente — exatamente o
 * que aconteceria se o modelo inventasse um exercício.
 */
export class ReplayMessagesClient implements MessagesClient {
  readonly requests: MessageCreateParamsNonStreaming[] = [];
  private index = 0;

  constructor(private readonly recordings: BetaMessage[]) {}

  get remaining(): number {
    return this.recordings.length - this.index;
  }

  create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage> {
    // Cópia profunda: o provider continua mutando o histórico depois da chamada.
    this.requests.push(JSON.parse(JSON.stringify(params)) as MessageCreateParamsNonStreaming);
    const recording = this.recordings[this.index++];
    if (!recording) return Promise.reject(new Error('Sem resposta gravada para esta chamada.'));
    const seen = idsSeen(params);
    const text = JSON.stringify(recording).replace(/\{\{id:([^}]+)\}\}/g, (_, name: string) => {
      return seen.get(name.trim().toLowerCase()) ?? '00000000-0000-7000-8000-00000000dead';
    });
    return Promise.resolve(JSON.parse(text) as BetaMessage);
  }
}

/** Nome (minúsculo) → id, a partir dos tool_result que já voltaram ao modelo. */
function idsSeen(params: MessageCreateParamsNonStreaming): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of params.messages) {
    if (m.role !== 'user' || typeof m.content === 'string') continue;
    for (const block of m.content) {
      if (block.type !== 'tool_result' || typeof block.content !== 'string') continue;
      try {
        const data = JSON.parse(block.content) as unknown;
        if (!Array.isArray(data)) continue;
        for (const hit of data as { id?: unknown; name?: unknown }[]) {
          if (typeof hit.id === 'string' && typeof hit.name === 'string')
            out.set(hit.name.toLowerCase(), hit.id);
        }
      } catch {
        // resultado que não é JSON de busca
      }
    }
  }
  return out;
}
