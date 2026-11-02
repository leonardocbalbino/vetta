import { z } from 'zod';
import { EmailSchema } from './common.js';
import { PlanCode } from './enums.js';
import { SetType, TrainingMethod } from './workouts.js';

/** DTOs da Fase 3 (Pro Plus): IA, equipe, white label, integrações, relatórios, Academy, suporte. */

// ─── IA de treino ───────────────────────────────────────────────────────────

export const AI_LEVEL = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const AI_LEVEL_LABEL: Record<(typeof AI_LEVEL)[number], string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};

export const AiProgramRequestSchema = z.object({
  /** Aluno (opcional): usa anamnese, lesões e histórico de cargas, minimizados. */
  studentLinkId: z.uuid().nullable().optional(),
  objective: z.string().trim().min(3).max(300),
  level: z.enum(AI_LEVEL),
  daysPerWeek: z.number().int().min(1).max(7),
  minutesPerSession: z.number().int().min(15).max(240),
  equipment: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  injuries: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  useAnamnesis: z.boolean().default(true),
  useLoadHistory: z.boolean().default(true),
});
export type AiProgramRequest = z.infer<typeof AiProgramRequestSchema>;

const rationale = z.string().trim().min(1).max(400);

/** Saída da IA (validada antes de virar rascunho). Só ids da biblioteca do personal. */
export const AiProgramDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(200),
  rationale,
  routines: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(10),
        name: z.string().trim().max(80),
        rationale,
        items: z
          .array(
            z.object({
              exerciseId: z.uuid(),
              method: z.enum(TrainingMethod),
              groupId: z.string().max(40).nullable(),
              restSeconds: z.number().int().min(0).max(600).nullable(),
              rationale,
              sets: z
                .array(
                  z.object({
                    type: z.enum(SetType),
                    reps: z.string().trim().max(30).nullable(),
                    targetLoadKg: z.number().min(0).max(1000).nullable(),
                    durationSeconds: z.number().int().min(0).max(36_000).nullable(),
                    rpe: z.number().min(1).max(10).nullable(),
                    rir: z.number().int().min(0).max(10).nullable(),
                  }),
                )
                .min(1)
                .max(10),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(7),
});
export type AiProgramDraft = z.infer<typeof AiProgramDraftSchema>;

export const AiLoadRequestSchema = z.object({ studentLinkId: z.uuid() });

export const AiLoadSuggestionsSchema = z.object({
  summary: z.string().trim().max(600),
  suggestions: z
    .array(
      z.object({
        exerciseId: z.uuid(),
        currentLoadKg: z.number().min(0).max(1000).nullable(),
        suggestedLoadKg: z.number().min(0).max(1000).nullable(),
        change: z.enum(['INCREASE', 'KEEP', 'DECREASE']),
        rationale,
      }),
    )
    .max(30),
});
export type AiLoadSuggestions = z.infer<typeof AiLoadSuggestionsSchema>;

export const AiWeeklySummaryRequestSchema = z.object({ studentLinkId: z.uuid() });

export const AiWeeklySummarySchema = z.object({
  headline: z.string().trim().max(200),
  adherence: z.string().trim().max(400),
  highlights: z.array(z.string().trim().max(300)).max(6),
  concerns: z.array(z.string().trim().max(300)).max(6),
  suggestedActions: z.array(z.string().trim().max(300)).max(6),
});
export type AiWeeklySummary = z.infer<typeof AiWeeklySummarySchema>;

// ─── Equipe ─────────────────────────────────────────────────────────────────

export const ASSISTANT_PERMISSIONS = ['prescribe', 'assess', 'chat'] as const;
export type AssistantPermission = (typeof ASSISTANT_PERMISSIONS)[number];
export const ASSISTANT_PERMISSION_LABEL: Record<AssistantPermission, string> = {
  prescribe: 'Prescrever treinos',
  assess: 'Avaliar (anamnese, avaliações e progresso)',
  chat: 'Conversar com os alunos',
};

/**
 * Permissão do assistente exigida por recurso (ações de escrita; o chat exige em qualquer ação).
 * O financeiro, as configurações e a assinatura nem chegam aqui: o papel não tem acesso.
 */
export const ASSISTANT_PERMISSION_BY_RESOURCE: Partial<
  Record<string, { permission: AssistantPermission; reads: boolean }>
> = {
  workouts: { permission: 'prescribe', reads: false },
  anamnesis: { permission: 'assess', reads: false },
  assessments: { permission: 'assess', reads: false },
  progress: { permission: 'assess', reads: false },
  documents: { permission: 'assess', reads: false },
  chat: { permission: 'chat', reads: true },
};

export const InviteAssistantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: EmailSchema,
  permissions: z
    .array(z.enum(ASSISTANT_PERMISSIONS))
    .max(3)
    .default([...ASSISTANT_PERMISSIONS]),
});

export const UpdateMemberSchema = z.object({
  permissions: z.array(z.enum(ASSISTANT_PERMISSIONS)).max(3),
});

export const AcceptTeamInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
  acceptTerms: z.literal(true),
});

export const AssignStudentsSchema = z.object({
  studentLinkIds: z.array(z.uuid()).min(1).max(500),
  /** null = devolve ao personal (sem assistente). */
  memberId: z.uuid().nullable(),
});

export const ActivityQuerySchema = z.object({
  memberId: z.uuid().optional(),
  studentLinkId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ─── White label e domínio ──────────────────────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use o formato #RRGGBB.');

export const UpdateBrandSchema = z.object({
  displayName: z.string().trim().min(2).max(60).nullable().optional(),
  primaryColor: hex.nullable().optional(),
  accentColor: hex.nullable().optional(),
  emailFromName: z.string().trim().min(2).max(60).nullable().optional(),
  logoMediaId: z.uuid().nullable().optional(),
});

/** Domínio próprio (subdomínio recomendado: app.seudominio.com.br). */
export const DOMAIN_RE = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;
export const RESERVED_DOMAIN_SUFFIXES = ['vettafit.com.br', 'vettafit.dev', 'localhost'];

export const CustomDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .refine((v) => DOMAIN_RE.test(v), 'Domínio inválido.')
    .refine(
      (v) => !RESERVED_DOMAIN_SUFFIXES.some((s) => v === s || v.endsWith(`.${s}`)),
      'Este domínio é reservado.',
    ),
});

export interface PublicBrand {
  tenantId: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  /** CSS pronto (:root e .dark) com as variáveis do tema. */
  css: string;
  whiteLabel: boolean;
}

// ─── WhatsApp, integrações e saúde ──────────────────────────────────────────

export const WhatsAppOptInSchema = z.object({
  granted: z.boolean(),
  /** E.164; obrigatório ao aceitar se o perfil não tiver telefone. */
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Use o formato +5511999999999.')
    .optional(),
});

export const HealthSampleInputSchema = z.object({
  source: z.enum(['HEALTHKIT', 'HEALTH_CONNECT']),
  type: z.enum(['STEPS', 'HEART_RATE', 'WEIGHT', 'WORKOUT']),
  externalId: z.string().trim().min(1).max(200),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  value: z.number().min(0).max(1_000_000),
  unit: z.string().trim().min(1).max(20),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export const HealthImportSchema = z.object({
  samples: z.array(HealthSampleInputSchema).min(1).max(1000),
});

export const HealthQuerySchema = z.object({
  type: z.enum(['STEPS', 'HEART_RATE', 'WEIGHT', 'WORKOUT']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const EXPORT_KINDS = ['students', 'workouts', 'loads', 'finance'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const ExportQuerySchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const ReportsQuerySchema = z.object({
  /** Meses de coorte (padrão 6). */
  months: z.coerce.number().int().min(1).max(24).default(6),
});

// ─── Academy ────────────────────────────────────────────────────────────────

export const AcademyContentInputSchema = z.object({
  type: z.enum(['COURSE', 'EBOOK', 'POST']),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens.')
    .max(120),
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().max(500).nullable().optional(),
  body: z.string().max(100_000).nullable().optional(),
  coverMediaId: z.uuid().nullable().optional(),
  fileMediaId: z.uuid().nullable().optional(),
  requiredPlan: z.enum(PlanCode).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  lessons: z
    .array(
      z.object({
        id: z.uuid().optional(),
        title: z.string().trim().min(2).max(160),
        body: z.string().max(50_000).nullable().optional(),
        videoMediaId: z.uuid().nullable().optional(),
        durationSeconds: z.number().int().min(0).max(36_000).nullable().optional(),
      }),
    )
    .max(200)
    .default([]),
});

export const AcademyProgressSchema = z.object({
  completed: z.boolean().default(true),
  positionSec: z.number().int().min(0).max(36_000).default(0),
});

// ─── Comunicados da plataforma ──────────────────────────────────────────────

export const PlatformBroadcastSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(4000),
  url: z.url().nullable().optional(),
  channels: z
    .array(z.enum(['IN_APP', 'PUSH', 'EMAIL']))
    .min(1)
    .default(['IN_APP']),
  segment: z
    .object({
      plans: z.array(z.enum(PlanCode)).default([]),
      statuses: z.array(z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'])).default([]),
      signupFrom: z.iso.date().nullable().optional(),
      signupTo: z.iso.date().nullable().optional(),
    })
    .default({ plans: [], statuses: [] }),
  scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type PlatformBroadcastInput = z.infer<typeof PlatformBroadcastSchema>;

// ─── Suporte ────────────────────────────────────────────────────────────────

export const SUPPORT_CATEGORIES = [
  'account',
  'billing',
  'students',
  'workouts',
  'app',
  'bug',
  'other',
] as const;
export const SUPPORT_CATEGORY_LABEL: Record<(typeof SUPPORT_CATEGORIES)[number], string> = {
  account: 'Conta e acesso',
  billing: 'Assinatura e cobrança',
  students: 'Alunos',
  workouts: 'Treinos',
  app: 'App do aluno',
  bug: 'Erro no sistema',
  other: 'Outro assunto',
};

export const CreateTicketSchema = z.object({
  subject: z.string().trim().min(4).max(160),
  category: z.enum(SUPPORT_CATEGORIES),
  body: z.string().trim().min(10).max(10_000),
  pageUrl: z.string().trim().max(500).nullable().optional(),
});

export const TicketReplySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  internal: z.boolean().default(false),
});

export const AdminTicketUpdateSchema = z.object({
  status: z.enum(['OPEN', 'WAITING_USER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedAdminId: z.uuid().nullable().optional(),
});

/** SLA por plano, em horas: primeira resposta e resolução. */
export const SUPPORT_SLA_HOURS: Record<PlanCode, { firstResponse: number; resolution: number }> = {
  FREE: { firstResponse: 72, resolution: 240 },
  PRO: { firstResponse: 24, resolution: 120 },
  PRO_PLUS: { firstResponse: 4, resolution: 48 },
};

export function supportPriorityFor(
  plan: PlanCode,
  category: string,
): 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' {
  if (plan === 'PRO_PLUS') return category === 'bug' || category === 'billing' ? 'URGENT' : 'HIGH';
  if (plan === 'PRO') return category === 'bug' ? 'HIGH' : 'NORMAL';
  return 'LOW';
}
