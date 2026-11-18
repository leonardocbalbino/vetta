import { Directory, File, Paths } from 'expo-file-system';

/**
 * Mídia dos exercícios guardada no aparelho para o player funcionar sem internet.
 * Um arquivo por exercício (vídeo leve de 360p, ou GIF/foto), baixado quando o aluno abre
 * o treino. As URLs assinadas expiram, então a chave é o id do exercício, não a URL.
 */

export type OfflineMedia = { kind: 'video' | 'image'; url: string };

const EXT = { video: 'mp4', image: 'img' } as const;

const folder = () => new Directory(Paths.document, 'exercise-media');
const fileFor = (exerciseId: string, kind: OfflineMedia['kind']) =>
  new File(folder(), `${exerciseId}.${EXT[kind]}`);

/** Arquivo local do exercício, se já foi baixado (o vídeo tem prioridade). */
export function localMedia(exerciseId: string): { kind: OfflineMedia['kind']; uri: string } | null {
  for (const kind of ['video', 'image'] as const) {
    try {
      const f = fileFor(exerciseId, kind);
      if (f.exists) return { kind, uri: f.uri };
    } catch {
      // Sem acesso ao armazenamento: segue com a mídia online.
    }
  }
  return null;
}

const running = new Set<string>();

async function download(exerciseId: string, media: OfflineMedia) {
  const dest = fileFor(exerciseId, media.kind);
  if (dest.exists || running.has(dest.uri)) return;
  running.add(dest.uri);
  // Baixa num arquivo temporário: um download interrompido nunca vira um arquivo "pronto".
  const part = new File(folder(), `${exerciseId}.${EXT[media.kind]}.part`);
  try {
    const f = await File.downloadFileAsync(media.url, part, { idempotent: true });
    await f.move(dest);
  } catch {
    try {
      if (part.exists) part.delete();
    } catch {
      // ignora: na próxima abertura do treino tenta de novo
    }
  } finally {
    running.delete(dest.uri);
  }
}

/**
 * Baixa em segundo plano a mídia dos exercícios que ainda não estão no aparelho,
 * dois por vez. Falhas são silenciosas: o player continua usando a versão online.
 */
export async function prefetchExerciseMedia(
  items: { exerciseId: string; offline?: OfflineMedia | null }[],
): Promise<void> {
  const todo = items.filter(
    (i): i is { exerciseId: string; offline: OfflineMedia } =>
      !!i.offline && !localMedia(i.exerciseId),
  );
  if (!todo.length) return;
  try {
    folder().create({ intermediates: true, idempotent: true });
  } catch {
    return;
  }
  const queue = [...new Map(todo.map((i) => [i.exerciseId, i])).values()];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift())
      await download(next.exerciseId, next.offline);
  };
  await Promise.all([worker(), worker()]);
}
