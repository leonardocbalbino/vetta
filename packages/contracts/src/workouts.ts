import { z } from 'zod';

export const TrainingMethod = [
  'STANDARD',
  'BI_SET',
  'TRI_SET',
  'CIRCUIT',
  'DROP_SET',
  'REST_PAUSE',
  'PYRAMID',
  'AMRAP',
  'EMOM',
  'CARDIO',
] as const;
export type TrainingMethod = (typeof TrainingMethod)[number];

export const METHOD_LABEL: Record<TrainingMethod, string> = {
  STANDARD: 'Convencional',
  BI_SET: 'Bi-set',
  TRI_SET: 'Tri-set',
  CIRCUIT: 'Circuito',
  DROP_SET: 'Drop-set',
  REST_PAUSE: 'Rest-pause',
  PYRAMID: 'Pirâmide',
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  CARDIO: 'Cardio',
};

export const SetType = ['WARMUP', 'WORK', 'DROP', 'FAILURE', 'CARDIO'] as const;
export const SET_TYPE_LABEL: Record<(typeof SetType)[number], string> = {
  WARMUP: 'Aquecimento',
  WORK: 'Válida',
  DROP: 'Drop',
  FAILURE: 'Falha',
  CARDIO: 'Cardio',
};

const optNum = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();

export const SetInputSchema = z.object({
  id: z.uuid().optional(),
  type: z.enum(SetType).default('WORK'),
  /** Número ("10"), faixa ("8-12") ou texto livre ("até a falha"). */
  reps: z.string().trim().max(30).nullable().optional(),
  targetLoadKg: optNum(0, 1000),
  durationSeconds: optNum(0, 36_000),
  distanceMeters: optNum(0, 1_000_000),
  restSeconds: optNum(0, 3600),
  rpe: optNum(1, 10),
  rir: optNum(0, 10),
  cadence: z.string().trim().max(20).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const ItemInputSchema = z.object({
  id: z.uuid().optional(),
  exerciseId: z.uuid(),
  method: z.enum(TrainingMethod).default('STANDARD'),
  /** Itens com o mesmo groupId formam bi-set, tri-set ou circuito. */
  groupId: z.string().max(40).nullable().optional(),
  restSeconds: optNum(0, 3600),
  notes: z.string().max(1000).nullable().optional(),
  sets: z.array(SetInputSchema).min(1).max(30),
});

export const RoutineInputSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(10),
  name: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(ItemInputSchema).max(60),
});

/** O construtor envia o programa inteiro; a API reconcilia numa transação. */
export const ProgramInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  startsOn: z.iso.date().nullable().optional(),
  /** Data prevista de troca do treino. */
  endsOn: z.iso.date().nullable().optional(),
  routines: z.array(RoutineInputSchema).max(14),
});
export type ProgramInput = z.infer<typeof ProgramInputSchema>;

export const CreateProgramSchema = ProgramInputSchema.extend({
  studentLinkId: z.uuid().nullable().optional(),
  isTemplate: z.boolean().default(false),
  /** Treino extra temporário (expira em endsOn). */
  isExtra: z.boolean().default(false),
  publish: z.boolean().default(false),
});

export const ApplyProgramSchema = z
  .object({
    studentLinkIds: z.array(z.uuid()).max(500).default([]),
    groupId: z.uuid().optional(),
    startsOn: z.iso.date().nullable().optional(),
    endsOn: z.iso.date().nullable().optional(),
    publish: z.boolean().default(true),
  })
  .refine((v) => v.studentLinkIds.length > 0 || v.groupId, {
    message: 'Escolha alunos ou um grupo.',
  });

export const ProgramListQuerySchema = z.object({
  studentLinkId: z.uuid().optional(),
  templates: z.coerce.boolean().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  q: z.string().max(100).optional(),
});
