/**
 * Curadoria de vídeos do YouTube para a biblioteca global (uma vez; o resultado é revisado
 * por gente e versionado em src/seed/exercise-videos.ts).
 *   pnpm --filter @vetta/db exec tsx scripts/curate-exercise-videos.ts
 *
 * Para cada exercício: busca em português, valida no oEmbed (público e com incorporação
 * liberada) e exige que o título cite o movimento. Sem candidato aprovado, fica de fora.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeText } from '@vetta/contracts';
import { DEV_EXERCISE_NAMES } from '../src/seed/exercises';

const STOP = new Set([
  'com',
  'de',
  'do',
  'da',
  'no',
  'na',
  'em',
  'e',
  'a',
  'o',
  'para',
  'barra',
  'halteres',
  'halter',
  'maquina',
  'polia',
  'cabo',
  'sentado',
  'em pe',
]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string): Promise<string[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=pt-BR&gl=BR`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        // Cookie de consentimento: sem ele o YouTube redireciona em loop para consent.youtube.com.
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'pt-BR',
          cookie: 'CONSENT=YES+1; SOCS=CAI',
        },
      });
      const html = await res.text();
      return [
        ...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]!)),
      ].slice(0, 10);
    } catch {
      await sleep(3000 * (attempt + 1));
    }
  }
  return [];
}

async function oembed(id: string): Promise<{ title: string; author: string } | null> {
  const r = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
  );
  if (!r.ok) return null; // 401 = incorporação desligada; 404 = privado/removido
  const j = (await r.json()) as { title: string; author_name: string };
  return { title: j.title, author: j.author_name };
}

/** Palavras que caracterizam o movimento (ex.: "supino", "inclinado"). */
function keywords(name: string) {
  return normalizeText(name)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w));
}

async function main() {
  const out: Record<string, { url: string; title: string; author: string }> = {};
  const missing: string[] = [];
  for (const ex of DEV_EXERCISE_NAMES) {
    const keys = keywords(ex.name);
    let picked: (typeof out)[string] | null = null;
    for (const q of [`${ex.name} como fazer execução correta`, `${ex.name} exercício`]) {
      for (const id of await search(q)) {
        const meta = await oembed(id);
        if (!meta) continue;
        const title = normalizeText(meta.title);
        // Primeira palavra-chave (o movimento) obrigatória; e ao menos metade das demais.
        const hits = keys.filter((k) => title.includes(k)).length;
        if (!keys.length || !title.includes(keys[0]!) || hits < Math.ceil(keys.length / 2))
          continue;
        picked = {
          url: `https://www.youtube.com/watch?v=${id}`,
          title: meta.title,
          author: meta.author,
        };
        break;
      }
      if (picked) break;
      await sleep(400);
    }
    if (picked) out[ex.code] = picked;
    else missing.push(`${ex.code} (${ex.name})`);
    console.warn(picked ? 'ok ' : '-- ', ex.code, picked?.title ?? '');
    await sleep(300);
  }

  const file = path.join(__dirname, '../src/seed/exercise-videos.ts');
  writeFileSync(
    file,
    `/**
 * Vídeos do YouTube da biblioteca global, por código do exercício.
 * Gerado por scripts/curate-exercise-videos.ts e REVISADO por gente antes de ir para produção:
 * confira se o vídeo mostra o exercício certo e com boa técnica. Para trocar, edite o link.
 * Sem vídeo próprio, o link vira o vídeo e a capa (foto) do exercício.
 */
export const EXERCISE_VIDEOS: Record<string, { url: string; title: string; author: string }> = ${JSON.stringify(out, null, 2)};
`,
  );
  console.warn(
    `\n${Object.keys(out).length} com vídeo; sem vídeo: ${missing.length ? missing.join(', ') : 'nenhum'}`,
  );
}

void main();
