import { z } from 'zod';

export const AssessmentProtocol = [
  'POLLOCK_3',
  'POLLOCK_7',
  'JACKSON_POLLOCK',
  'GUEDES',
  'PETROSKI',
  'FAULKNER',
  'DURNIN_WOMERSLEY',
  'BIOIMPEDANCE',
  'NONE',
] as const;

export const PROTOCOL_LABEL: Record<(typeof AssessmentProtocol)[number], string> = {
  POLLOCK_3: 'Pollock 3 dobras',
  POLLOCK_7: 'Pollock 7 dobras',
  JACKSON_POLLOCK: 'Jackson-Pollock (3 dobras, variante)',
  GUEDES: 'Guedes',
  PETROSKI: 'Petroski',
  FAULKNER: 'Faulkner',
  DURNIN_WOMERSLEY: 'Durnin-Womersley',
  BIOIMPEDANCE: 'Bioimpedância (manual)',
  NONE: 'Só medidas',
};

export const PERIMETERS = [
  'pescoço',
  'ombros',
  'tórax',
  'cintura',
  'abdômen',
  'quadril',
  'braço direito',
  'braço esquerdo',
  'antebraço direito',
  'antebraço esquerdo',
  'coxa direita',
  'coxa esquerda',
  'panturrilha direita',
  'panturrilha esquerda',
] as const;

const pos = (max: number) => z.number().positive().max(max);

export const AssessmentInputSchema = z.object({
  assessedAt: z.iso.datetime().optional(),
  protocol: z.enum(AssessmentProtocol),
  sex: z.enum(['male', 'female']),
  weightKg: pos(400),
  heightCm: pos(260),
  skinfolds: z.record(z.string(), pos(100)).default({}),
  perimeters: z.record(z.string(), pos(300)).default({}),
  bioimpedance: z
    .object({
      bodyFatPct: z.number().min(1).max(70),
      muscleMassKg: pos(200).optional(),
      visceralFat: z.number().min(0).max(60).optional(),
      waterPct: z.number().min(0).max(100).optional(),
      basalMetabolism: pos(10000).optional(),
    })
    .optional(),
  equation: z.enum(['siri', 'brozek']).default('siri'),
  /** Data da próxima avaliação (lembrete 7 dias antes). */
  nextAssessmentOn: z.iso.date().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type AssessmentInput = z.infer<typeof AssessmentInputSchema>;

export const SendAnamnesisSchema = z.object({
  templateId: z.uuid(),
  studentLinkIds: z.array(z.uuid()).min(1).max(500),
  dueAt: z.iso.datetime().nullable().optional(),
});

export const AnswerAnamnesisSchema = z.object({
  answers: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
  ),
  /** Consentimento específico para dados de saúde (LGPD). */
  acceptHealthDataConsent: z.literal(true, {
    error: 'Autorize o uso dos dados de saúde para enviar.',
  }),
});

/** PAR-Q: qualquer "sim" indica risco e alerta o personal. */
export function anamnesisHasRisk(kind: string, answers: Record<string, unknown>): boolean {
  if (kind === 'PARQ')
    return Object.values(answers).some((v) => v === true || v === 'sim' || v === 'yes');
  if (kind === 'INJURIES') return Number(answers.pain_scale ?? 0) >= 7;
  return false;
}
