import { z } from 'zod';

/** Normaliza para busca: sem acento, minúsculas, espaços simples. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function exerciseSearchText(e: {
  name: string;
  aliases?: readonly string[];
  primaryMuscles?: readonly string[];
  secondaryMuscles?: readonly string[];
  equipment?: readonly string[];
}): string {
  return normalizeText(
    [
      e.name,
      ...(e.aliases ?? []),
      ...(e.primaryMuscles ?? []),
      ...(e.secondaryMuscles ?? []),
      ...(e.equipment ?? []),
    ].join(' '),
  );
}

export const ExerciseCategory = [
  'STRENGTH',
  'CARDIO',
  'MOBILITY',
  'STRETCHING',
  'FUNCTIONAL',
  'PLYOMETRIC',
  'OTHER',
] as const;
export type ExerciseCategory = (typeof ExerciseCategory)[number];
export const ExerciseLevel = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type ExerciseLevel = (typeof ExerciseLevel)[number];

export const LEVEL_LABEL: Record<ExerciseLevel, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  STRENGTH: 'Força',
  CARDIO: 'Cardio',
  MOBILITY: 'Mobilidade',
  STRETCHING: 'Alongamento',
  FUNCTIONAL: 'Funcional',
  PLYOMETRIC: 'Pliometria',
  OTHER: 'Outro',
};

export const MUSCLE_GROUPS = [
  'peitoral',
  'dorsais',
  'trapézio',
  'ombros',
  'bíceps',
  'tríceps',
  'antebraço',
  'core',
  'lombar',
  'glúteos',
  'quadríceps',
  'posteriores',
  'adutores',
  'abdutores',
  'panturrilha',
  'corpo inteiro',
] as const;

const strList = z.array(z.string().trim().min(1).max(60)).max(20).default([]);

export const ExerciseInputSchema = z.object({
  code: z.string().trim().max(60).optional(),
  name: z.string().trim().min(2).max(120),
  aliases: strList,
  category: z.enum(ExerciseCategory).default('STRENGTH'),
  level: z.enum(ExerciseLevel).default('BEGINNER'),
  primaryMuscles: strList,
  secondaryMuscles: strList,
  equipment: strList,
  instructions: z.string().max(4000).nullable().optional(),
  tips: z.string().max(2000).nullable().optional(),
  commonMistakes: z.string().max(2000).nullable().optional(),
  videoMediaId: z.uuid().nullable().optional(),
  imageMediaId: z.uuid().nullable().optional(),
  gifMediaId: z.uuid().nullable().optional(),
  /** Vídeo no YouTube (não ocupa espaço da cota; a miniatura vira a foto do exercício). */
  externalVideoUrl: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(
      (v) => !v || youtubeId(v) !== null,
      'Use um link do YouTube (youtube.com ou youtu.be).',
    ),
  folderId: z.uuid().nullable().optional(),
});
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>;

export const ExerciseQuerySchema = z.object({
  q: z.string().max(100).optional(),
  scope: z.enum(['all', 'global', 'mine', 'favorites']).default('all'),
  category: z.enum(ExerciseCategory).optional(),
  level: z.enum(ExerciseLevel).optional(),
  muscle: z.string().max(60).optional(),
  equipment: z.string().max(60).optional(),
  folderId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type ExerciseQuery = z.infer<typeof ExerciseQuerySchema>;

export const FolderInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.uuid().nullable().optional(),
});

/** Colunas aceitas no importador CSV do admin (separador ; ou ,). */
export const EXERCISE_CSV_COLUMNS = [
  'codigo',
  'nome',
  'apelidos',
  'tipo',
  'nivel',
  'musculos_primarios',
  'musculos_secundarios',
  'equipamentos',
  'instrucoes',
  'dicas',
  'erros_comuns',
  'video',
  'youtube',
] as const;

/** Id do vídeo a partir dos formatos de link do YouTube (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string): string | null {
  const m =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(
      url.trim(),
    );
  return m ? m[1]! : null;
}

/** Mídia derivada do YouTube: embed sem cookies, link e miniatura. */
export function youtubeMedia(url: string | null | undefined) {
  const id = url ? youtubeId(url) : null;
  if (!id) return null;
  return {
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}
