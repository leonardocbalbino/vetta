import { z } from 'zod';

/** Série executada pelo aluno no player. */
export const SetLogInputSchema = z.object({
  routineExerciseId: z.uuid().nullable().optional(),
  /** Exercício realmente executado (pode ser um substituto). */
  exerciseId: z.uuid(),
  setOrder: z.number().int().min(0).max(100),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  loadKg: z.number().min(0).max(1000).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(36_000).nullable().optional(),
  distanceMeters: z.number().int().min(0).max(1_000_000).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  completed: z.boolean().default(true),
  skipped: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

export const FeedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  /** Esforço percebido (escala de Borg CR10). */
  perceivedEffort: z.number().int().min(1).max(10),
  hasPain: z.boolean(),
  painLocation: z.string().trim().max(120).nullable().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

/**
 * Sessão sincronizada do dispositivo. `clientSessionId` garante idempotência:
 * reenviar a mesma sessão (offline → online) não duplica nada.
 */
export const SyncSessionSchema = z.object({
  clientSessionId: z.string().min(8).max(64),
  programId: z.uuid().nullable().optional(),
  routineId: z.uuid().nullable().optional(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  sets: z.array(SetLogInputSchema).max(500),
  feedback: FeedbackInputSchema,
});
export type SyncSessionInput = z.infer<typeof SyncSessionSchema>;

export const FeedbackReplySchema = z.object({ message: z.string().trim().min(1).max(2000) });

/** Feedback crítico: dor ou nota ≤ 2 dispara alerta imediato ao personal. */
export const isCriticalFeedback = (f: Pick<FeedbackInput, 'rating' | 'hasPain'>) =>
  f.hasPain || f.rating <= 2;

export const MeasurementInputSchema = z.object({
  measuredAt: z.iso.datetime().optional(),
  weightKg: z.number().min(20).max(400).nullable().optional(),
  bodyFatPct: z.number().min(1).max(70).nullable().optional(),
  measures: z.record(z.string(), z.number().min(0).max(400)).default({}),
});

export const ProgressPhotoInputSchema = z.object({
  mediaId: z.uuid(),
  view: z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT']).nullable().optional(),
  takenAt: z.iso.datetime().optional(),
  notes: z.string().max(500).nullable().optional(),
});
