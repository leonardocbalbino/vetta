import { z } from 'zod';
import { EmailSchema } from './common.js';
import { BillingCycle } from './enums.js';

/** DTOs da Fase 2 (Pro): financeiro, vendas, agenda, chat, comunicados, periodização. */

export const PaymentMethod = ['PIX', 'BOLETO', 'CREDIT_CARD'] as const;
export type PaymentMethod = (typeof PaymentMethod)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
};
export const CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

const digits = (min: number, max: number, msg: string) =>
  z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= min && v.length <= max, msg);

/** CPF (11) ou CNPJ (14), só dígitos, com dígitos verificadores. */
export function isValidCpfCnpj(raw: string): boolean {
  const v = raw.replace(/\D/g, '');
  if (v.length === 11) {
    if (/^(\d)\1+$/.test(v)) return false;
    const dv = (len: number) => {
      let s = 0;
      for (let i = 0; i < len; i++) s += Number(v[i]) * (len + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(v[9]) && dv(10) === Number(v[10]);
  }
  if (v.length === 14) {
    if (/^(\d)\1+$/.test(v)) return false;
    const dv = (len: number) => {
      const w =
        len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = w.reduce((a, x, i) => a + x * Number(v[i]), 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(v[12]) && dv(13) === Number(v[13]);
  }
  return false;
}

export const CpfCnpjSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine(isValidCpfCnpj, 'CPF ou CNPJ inválido.');

export const PhoneSchema = digits(10, 13, 'Telefone inválido.');

/** Dados do cartão: só trafegam até o gateway (tokenização) e nunca são gravados. */
export const CreditCardSchema = z.object({
  holderName: z.string().trim().min(3).max(120),
  number: digits(13, 19, 'Número do cartão inválido.'),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês inválido.'),
  expiryYear: z.string().regex(/^\d{4}$/, 'Ano inválido.'),
  ccv: digits(3, 4, 'Código de segurança inválido.'),
});
export type CreditCardInput = z.infer<typeof CreditCardSchema>;

export const CardHolderSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: EmailSchema,
  cpfCnpj: CpfCnpjSchema,
  postalCode: digits(8, 8, 'CEP inválido.'),
  addressNumber: z.string().trim().min(1).max(10),
  phone: PhoneSchema,
});

// ─── 2.1 Assinatura da plataforma ────────────────────────────────────────────

export const PlatformCheckoutSchema = z
  .object({
    planCode: z.enum(['PRO', 'PRO_PLUS']),
    cycle: z.enum(BillingCycle),
    method: z.enum(PaymentMethod),
    couponCode: z.string().trim().toUpperCase().max(40).optional(),
    /** Dados fiscais do personal (nota fiscal e cadastro no gateway). */
    billing: z.object({
      name: z.string().trim().min(3).max(120),
      cpfCnpj: CpfCnpjSchema,
      email: EmailSchema,
      postalCode: digits(8, 8, 'CEP inválido.').optional(),
      addressNumber: z.string().max(10).optional(),
      phone: PhoneSchema.optional(),
    }),
    card: CreditCardSchema.optional(),
    cardHolder: CardHolderSchema.optional(),
  })
  .refine((v) => v.method !== 'CREDIT_CARD' || (v.card && v.cardHolder), {
    message: 'Informe os dados do cartão.',
    path: ['card'],
  });
export type PlatformCheckoutInput = z.infer<typeof PlatformCheckoutSchema>;

export const CouponPreviewSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40),
  planCode: z.enum(['PRO', 'PRO_PLUS']),
  cycle: z.enum(BillingCycle),
});

export const CouponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,40}$/, 'Use letras, números, _ ou -.'),
    description: z.string().max(200).nullable().optional(),
    discountType: z.enum(['PERCENT', 'FIXED']),
    percentOff: z.number().int().min(1).max(100).nullable().optional(),
    amountOffCents: z.number().int().min(1).nullable().optional(),
    durationCycles: z.number().int().min(1).max(36).nullable().optional(),
    maxRedemptions: z.number().int().min(1).nullable().optional(),
    planCodes: z.array(z.enum(['PRO', 'PRO_PLUS'])).default([]),
    validFrom: z.iso.datetime().nullable().optional(),
    validUntil: z.iso.datetime().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => (v.discountType === 'PERCENT' ? !!v.percentOff : !!v.amountOffCents), {
    message: 'Informe o desconto.',
    path: ['percentOff'],
  });

// ─── 2.2 Financeiro do personal ──────────────────────────────────────────────

export const BankAccountSchema = z.object({
  bankCode: digits(3, 3, 'Código do banco inválido.'),
  agency: digits(1, 5, 'Agência inválida.'),
  account: digits(1, 13, 'Conta inválida.'),
  accountDigit: z.string().trim().min(1).max(2),
  accountType: z.enum(['CONTA_CORRENTE', 'CONTA_POUPANCA']),
  holderName: z.string().trim().min(3).max(120),
  holderDocument: CpfCnpjSchema,
});

export const PixKeyType = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'] as const;

export const PaymentAccountInputSchema = z.object({
  personType: z.enum(['CPF', 'CNPJ']),
  name: z.string().trim().min(3).max(120),
  email: EmailSchema,
  cpfCnpj: CpfCnpjSchema,
  birthDate: z.iso.date().optional(),
  companyType: z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional(),
  incomeValueCents: z.number().int().min(100),
  mobilePhone: PhoneSchema,
  address: z.object({
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(10),
    complement: z.string().max(60).optional(),
    district: z.string().trim().min(2).max(60),
    postalCode: digits(8, 8, 'CEP inválido.'),
  }),
  bankAccount: BankAccountSchema,
  pixKey: z.string().trim().max(140).optional(),
  pixKeyType: z.enum(PixKeyType).optional(),
});
export type PaymentAccountInput = z.infer<typeof PaymentAccountInputSchema>;

export const KycDocumentType = [
  'IDENTIFICATION',
  'IDENTIFICATION_SELFIE',
  'SOCIAL_CONTRACT',
  'ENTREPRENEUR_REQUIREMENT',
  'CUSTOM',
] as const;
export const KYC_DOCUMENT_LABEL: Record<(typeof KycDocumentType)[number], string> = {
  IDENTIFICATION: 'Documento com foto (RG ou CNH)',
  IDENTIFICATION_SELFIE: 'Selfie segurando o documento',
  SOCIAL_CONTRACT: 'Contrato social',
  ENTREPRENEUR_REQUIREMENT: 'Certificado MEI (CCMEI)',
  CUSTOM: 'Outro documento',
};
export const KycDocumentInputSchema = z.object({
  mediaId: z.uuid(),
  type: z.enum(KycDocumentType),
});

export const ConsultingPaymentMode = ['ONE_TIME', 'INSTALLMENTS', 'RECURRING'] as const;
export const PAYMENT_MODE_LABEL: Record<(typeof ConsultingPaymentMode)[number], string> = {
  ONE_TIME: 'À vista',
  INSTALLMENTS: 'Parcelado no cartão',
  RECURRING: 'Recorrente',
};

export const ConsultingPlanInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().max(2000).nullable().optional(),
    priceCents: z.number().int().min(500).max(10_000_000),
    cycle: z.enum(BillingCycle),
    paymentMode: z.enum(ConsultingPaymentMode),
    maxInstallments: z.number().int().min(1).max(12).default(1),
    methods: z.array(z.enum(PaymentMethod)).min(1),
    toleranceDays: z.number().int().min(0).max(60).nullable().optional(),
    isActive: z.boolean().default(true),
    isPublic: z.boolean().default(false),
    benefits: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
    sortOrder: z.number().int().min(0).max(100).default(0),
  })
  .refine((v) => v.paymentMode !== 'INSTALLMENTS' || v.methods.includes('CREDIT_CARD'), {
    message: 'Parcelamento só no cartão.',
    path: ['methods'],
  })
  .refine((v) => v.paymentMode === 'INSTALLMENTS' || v.maxInstallments === 1, {
    message: 'Parcelas só no modo parcelado.',
    path: ['maxInstallments'],
  });
export type ConsultingPlanInput = z.infer<typeof ConsultingPlanInputSchema>;

/** Personal vende um plano a um aluno já cadastrado. */
export const SellPlanSchema = z.object({
  studentLinkId: z.uuid(),
  consultingPlanId: z.uuid(),
  method: z.enum(PaymentMethod),
  installments: z.number().int().min(1).max(12).default(1),
  firstDueDate: z.iso.date().optional(),
  blockOnOverdue: z.boolean().default(true),
  /** CPF do aluno (exigido pelo gateway), se ainda não estiver na ficha. */
  cpfCnpj: CpfCnpjSchema.optional(),
});

/** Aluno paga uma fatura pelo app/web com cartão (Pix e boleto usam os dados da fatura). */
export const PayInvoiceSchema = z.object({
  card: CreditCardSchema,
  cardHolder: CardHolderSchema,
});

export const WithdrawalInputSchema = z.object({
  amountCents: z.number().int().min(100),
});

export const ManualEntryInputSchema = z.object({
  kind: z.enum(['EXPENSE', 'INCOME']),
  description: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(40),
  amountCents: z.number().int().min(1).max(100_000_000),
  paidOn: z.iso.date(),
  notes: z.string().max(1000).nullable().optional(),
});

export const FinanceSettingsSchema = z.object({
  blockOverdueStudents: z.boolean(),
  blockOverdueAfterDays: z.number().int().min(1).max(90),
});

export const MonthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use AAAA-MM.')
    .optional(),
});

// ─── 2.3 Página de vendas ────────────────────────────────────────────────────

export const SocialLinksSchema = z.object({
  instagram: z.string().max(200).optional(),
  youtube: z.string().max(200).optional(),
  tiktok: z.string().max(200).optional(),
  site: z.url().max(200).optional(),
  whatsapp: z.string().max(20).optional(),
});

export const SalesPageInputSchema = z.object({
  headline: z.string().trim().max(120).nullable().optional(),
  bio: z.string().max(3000).nullable().optional(),
  photoMediaId: z.uuid().nullable().optional(),
  specialties: z.array(z.string().trim().min(2).max(40)).max(12).default([]),
  faq: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(200),
        answer: z.string().trim().min(1).max(1500),
      }),
    )
    .max(20)
    .default([]),
  socialLinks: SocialLinksSchema.default({}),
  seoTitle: z.string().max(70).nullable().optional(),
  seoDescription: z.string().max(160).nullable().optional(),
  isPublished: z.boolean().default(false),
});
export type SalesPageInput = z.infer<typeof SalesPageInputSchema>;

export const TestimonialInputSchema = z.object({
  text: z.string().trim().min(10).max(800),
  rating: z.number().int().min(1).max(5).optional(),
});

export const ResultRequestSchema = z.object({
  studentLinkId: z.uuid(),
  beforePhotoId: z.uuid(),
  afterPhotoId: z.uuid(),
  caption: z.string().max(200).optional(),
});

export const PublicCheckoutSchema = z
  .object({
    consultingPlanId: z.uuid(),
    name: z.string().trim().min(3).max(120),
    email: EmailSchema,
    phone: PhoneSchema,
    cpfCnpj: CpfCnpjSchema,
    method: z.enum(PaymentMethod),
    installments: z.number().int().min(1).max(12).default(1),
    card: CreditCardSchema.optional(),
    cardHolder: CardHolderSchema.optional(),
    acceptTerms: z.literal(true, { error: 'Aceite os termos para continuar.' }),
  })
  .refine((v) => v.method !== 'CREDIT_CARD' || (v.card && v.cardHolder), {
    message: 'Informe os dados do cartão.',
    path: ['card'],
  });
export type PublicCheckoutInput = z.infer<typeof PublicCheckoutSchema>;

// ─── 2.4 Agenda ──────────────────────────────────────────────────────────────

const minuteOfDay = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);

export const AvailabilityInputSchema = z.object({
  rules: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startMinute: minuteOfDay,
          endMinute: minuteOfDay,
          slotMinutes: z.number().int().min(15).max(240).default(60),
          type: z.enum(['IN_PERSON', 'ONLINE']).default('IN_PERSON'),
          location: z.string().max(200).nullable().optional(),
          meetingUrl: z.url().max(500).nullable().optional(),
          capacity: z.number().int().min(1).max(100).default(1),
        })
        .refine((r) => r.endMinute - r.startMinute >= r.slotMinutes, {
          message: 'A janela precisa caber ao menos um horário.',
        }),
    )
    .max(50),
});

export const ScheduleBlockInputSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().max(200).optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'O fim precisa ser depois do início.' });

export const AppointmentInputSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    type: z.enum(['IN_PERSON', 'ONLINE']),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().max(200).nullable().optional(),
    meetingUrl: z.url().max(500).nullable().optional(),
    capacity: z.number().int().min(1).max(100).default(1),
    studentLinkIds: z.array(z.uuid()).max(100).default([]),
    /** "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=12" */
    recurrenceRule: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'O fim precisa ser depois do início.' })
  .refine((v) => v.studentLinkIds.length <= v.capacity, {
    message: 'Mais alunos que a capacidade.',
    path: ['studentLinkIds'],
  });
export type AppointmentInput = z.infer<typeof AppointmentInputSchema>;

export const ScheduleSettingsSchema = z.object({
  bookingMinHours: z.number().int().min(0).max(168),
  cancelMinHours: z.number().int().min(0).max(168),
});

export const RangeQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

export const BookSlotSchema = z.object({
  startsAt: z.iso.datetime(),
  /** Reserva numa turma já existente. */
  appointmentId: z.uuid().optional(),
});

export const AttendanceSchema = z.object({
  items: z
    .array(z.object({ studentLinkId: z.uuid(), status: z.enum(['ATTENDED', 'NO_SHOW']) }))
    .min(1),
});

// ─── 2.5 Chat e comunicados ──────────────────────────────────────────────────

export const SendMessageSchema = z
  .object({
    clientId: z.string().min(8).max(64),
    type: z.enum(['TEXT', 'AUDIO', 'IMAGE', 'VIDEO']).default('TEXT'),
    body: z.string().max(4000).optional(),
    mediaId: z.uuid().optional(),
    quote: z.object({ kind: z.literal('workout_session'), sessionId: z.uuid() }).optional(),
  })
  .refine((v) => (v.type === 'TEXT' ? !!v.body?.trim() : !!v.mediaId), {
    message: 'Mensagem vazia.',
  });
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const MessagesQuerySchema = z.object({
  before: z.uuid().optional(),
  q: z.string().trim().min(2).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const BroadcastAudienceSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ groupIds: z.array(z.uuid()).min(1) }),
  z.object({ studentLinkIds: z.array(z.uuid()).min(1) }),
  z.object({
    filter: z.object({
      status: z.array(z.enum(['INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE'])).optional(),
      tags: z.array(z.string()).optional(),
      inactiveDays: z.number().int().min(1).max(365).optional(),
      consultingPlanId: z.uuid().optional(),
    }),
  }),
]);

export const BroadcastInputSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(1000),
  audience: BroadcastAudienceSchema,
  channels: z
    .array(z.enum(['IN_APP', 'PUSH', 'EMAIL']))
    .min(1)
    .default(['IN_APP', 'PUSH']),
  scheduledAt: z.iso.datetime().nullable().optional(),
});
export type BroadcastInput = z.infer<typeof BroadcastInputSchema>;

// ─── 2.6 Periodização ────────────────────────────────────────────────────────

const WeekStepSchema = z.object({
  loadPct: z.number().min(-50).max(50).optional(),
  repsDelta: z.number().int().min(-20).max(20).optional(),
  setsDelta: z.number().int().min(-5).max(5).optional(),
});

export const ProgressionRuleSchema = z.object({
  model: z.enum(['LINEAR', 'UNDULATING', 'BLOCK']),
  base: WeekStepSchema.optional(),
  perWeek: WeekStepSchema.optional(),
  wave: z.array(WeekStepSchema).max(8).optional(),
  deloadEvery: z.number().int().min(2).max(12).optional(),
  deloadWeeks: z.array(z.number().int().min(1).max(52)).max(20).optional(),
  deloadLoadPct: z.number().min(0).max(60).optional(),
  deloadVolumePct: z.number().min(0).max(80).optional(),
  loadIncrementKg: z.number().min(0.25).max(10).optional(),
});

export const PeriodizationInputSchema = z.object({
  studentLinkId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  goal: z.string().max(200).nullable().optional(),
  model: z.enum(['LINEAR', 'UNDULATING', 'BLOCK']),
  startsOn: z.iso.date(),
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        focus: z.string().max(120).nullable().optional(),
        weeks: z.number().int().min(1).max(26),
        /** Programa (rotinas) usado nesta fase. */
        programId: z.uuid().nullable().optional(),
        progression: ProgressionRuleSchema,
      }),
    )
    .min(1)
    .max(12),
});
export type PeriodizationInput = z.infer<typeof PeriodizationInputSchema>;

// ─── 2.7 Anamnese e postural ─────────────────────────────────────────────────

export const AnamnesisQuestionType = [
  'yes_no',
  'text',
  'long_text',
  'number',
  'single_choice',
  'multi_choice',
  'scale',
  'date',
  'upload',
  'signature',
] as const;
export type AnamnesisQuestionType = (typeof AnamnesisQuestionType)[number];

export const ANAMNESIS_QUESTION_LABEL: Record<AnamnesisQuestionType, string> = {
  yes_no: 'Sim ou não',
  text: 'Texto curto',
  long_text: 'Texto longo',
  number: 'Número',
  single_choice: 'Múltipla escolha',
  multi_choice: 'Caixas de seleção',
  scale: 'Escala',
  date: 'Data',
  upload: 'Arquivo',
  signature: 'Assinatura',
};

export const AnamnesisQuestionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/i),
  type: z.enum(AnamnesisQuestionType),
  label: z.string().min(2).max(300),
  help: z.string().max(300).optional(),
  options: z.array(z.string().max(120)).max(30).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
  /** Condicional simples: só aparece se a pergunta `questionId` tiver o valor `equals`. */
  showIf: z
    .object({
      questionId: z.string().min(1).max(60),
      equals: z.union([z.string(), z.number(), z.boolean()]),
    })
    .optional(),
});
export type AnamnesisQuestion = z.infer<typeof AnamnesisQuestionSchema>;

export const AnamnesisTemplateInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().max(1000).nullable().optional(),
    questions: z.array(AnamnesisQuestionSchema).min(1).max(100),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.questions.forEach((q, i) => {
      if (ids.has(q.id))
        ctx.addIssue({
          code: 'custom',
          message: `Pergunta repetida: ${q.id}`,
          path: ['questions', i, 'id'],
        });
      if (q.showIf && !ids.has(q.showIf.questionId))
        ctx.addIssue({
          code: 'custom',
          message: 'A condição precisa apontar para uma pergunta anterior.',
          path: ['questions', i, 'showIf'],
        });
      if (['single_choice', 'multi_choice'].includes(q.type) && !(q.options?.length ?? 0))
        ctx.addIssue({
          code: 'custom',
          message: 'Inclua as opções.',
          path: ['questions', i, 'options'],
        });
      ids.add(q.id);
    });
  });

type Answer = string | number | boolean | string[] | null | undefined;

/** Perguntas visíveis dadas as respostas (condicionais encadeadas). */
export function visibleQuestions(
  questions: readonly AnamnesisQuestion[],
  answers: Record<string, Answer>,
): AnamnesisQuestion[] {
  const visible = new Set<string>();
  const out: AnamnesisQuestion[] = [];
  for (const q of questions) {
    if (q.showIf) {
      if (!visible.has(q.showIf.questionId)) continue;
      const a = answers[q.showIf.questionId];
      const match = Array.isArray(a) ? a.includes(String(q.showIf.equals)) : a === q.showIf.equals;
      if (!match) continue;
    }
    visible.add(q.id);
    out.push(q);
  }
  return out;
}

/** Valida respostas: obrigatórias visíveis, tipos e limites. Retorna { id: mensagem }. */
export function validateAnswers(
  questions: readonly AnamnesisQuestion[],
  answers: Record<string, Answer>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of visibleQuestions(questions, answers)) {
    const a = answers[q.id];
    const empty = a === undefined || a === null || a === '' || (Array.isArray(a) && !a.length);
    if (empty) {
      if (q.required) errors[q.id] = 'Resposta obrigatória.';
      continue;
    }
    if ((q.type === 'number' || q.type === 'scale') && typeof a !== 'number')
      errors[q.id] = 'Informe um número.';
    else if (
      typeof a === 'number' &&
      ((q.min !== undefined && a < q.min) || (q.max !== undefined && a > q.max))
    )
      errors[q.id] = `Use um valor entre ${q.min ?? '–'} e ${q.max ?? '–'}.`;
    else if (q.type === 'yes_no' && typeof a !== 'boolean') errors[q.id] = 'Responda sim ou não.';
    else if (q.type === 'date' && (typeof a !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a)))
      errors[q.id] = 'Data inválida.';
    else if (q.type === 'single_choice' && !q.options?.includes(String(a)))
      errors[q.id] = 'Opção inválida.';
    else if (
      q.type === 'multi_choice' &&
      (!Array.isArray(a) || a.some((x) => !q.options?.includes(x)))
    )
      errors[q.id] = 'Opção inválida.';
    else if (
      (q.type === 'upload' || q.type === 'signature') &&
      (typeof a !== 'string' || !/^[0-9a-f-]{36}$/i.test(a))
    )
      errors[q.id] = 'Envie o arquivo.';
  }
  return errors;
}

export const AnamnesisAssignmentInputSchema = z.object({
  templateId: z.uuid(),
  studentLinkIds: z.array(z.uuid()).min(1).max(500),
  repeatEveryDays: z.number().int().min(7).max(730),
  firstDueOn: z.iso.date().optional(),
});

export const PostureDeviation = [
  'cabeca_anteriorizada',
  'ombros_protusos',
  'ombro_elevado_direito',
  'ombro_elevado_esquerdo',
  'hipercifose_toracica',
  'hiperlordose_lombar',
  'retificacao_lombar',
  'escoliose',
  'pelve_anteversao',
  'pelve_retroversao',
  'joelho_valgo',
  'joelho_varo',
  'joelho_hiperextendido',
  'pe_plano',
  'pe_cavo',
  'escapula_alada',
] as const;
export const POSTURE_DEVIATION_LABEL: Record<(typeof PostureDeviation)[number], string> = {
  cabeca_anteriorizada: 'Cabeça anteriorizada',
  ombros_protusos: 'Ombros protusos',
  ombro_elevado_direito: 'Ombro direito elevado',
  ombro_elevado_esquerdo: 'Ombro esquerdo elevado',
  hipercifose_toracica: 'Hipercifose torácica',
  hiperlordose_lombar: 'Hiperlordose lombar',
  retificacao_lombar: 'Retificação lombar',
  escoliose: 'Escoliose',
  pelve_anteversao: 'Anteversão pélvica',
  pelve_retroversao: 'Retroversão pélvica',
  joelho_valgo: 'Joelho valgo',
  joelho_varo: 'Joelho varo',
  joelho_hiperextendido: 'Joelho hiperestendido',
  pe_plano: 'Pé plano',
  pe_cavo: 'Pé cavo',
  escapula_alada: 'Escápula alada',
};

export const PostureMarkerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('point'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    label: z.string().max(40).optional(),
  }),
  z.object({
    kind: z.literal('line'),
    x1: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
    x2: z.number().min(0).max(1),
    y2: z.number().min(0).max(1),
    label: z.string().max(40).optional(),
  }),
]);

export const PostureInputSchema = z.object({
  assessedAt: z.iso.datetime().optional(),
  findings: z
    .record(z.string(), z.enum(['leve', 'moderado', 'acentuado']))
    .refine(
      (f) => Object.keys(f).every((k) => (PostureDeviation as readonly string[]).includes(k)),
      'Desvio desconhecido.',
    )
    .default({}),
  notes: z.string().max(4000).nullable().optional(),
  photos: z
    .array(
      z.object({
        view: z.enum(['FRONT', 'BACK', 'LEFT', 'RIGHT']),
        mediaId: z.uuid(),
        markers: z.array(PostureMarkerSchema).max(60).default([]),
      }),
    )
    .max(4)
    .default([]),
});
export type PostureInput = z.infer<typeof PostureInputSchema>;

// ─── 2.8 Documentos ──────────────────────────────────────────────────────────

export const StudentDocumentCategory = [
  'EXAM',
  'MEAL_PLAN',
  'CONTRACT',
  'PRESCRIPTION',
  'OTHER',
] as const;
export const DOCUMENT_CATEGORY_LABEL: Record<(typeof StudentDocumentCategory)[number], string> = {
  EXAM: 'Exame',
  MEAL_PLAN: 'Plano alimentar',
  CONTRACT: 'Contrato',
  PRESCRIPTION: 'Prescrição',
  OTHER: 'Outro',
};
export const StudentDocumentInputSchema = z.object({
  mediaId: z.uuid(),
  title: z.string().trim().min(2).max(120),
  category: z.enum(StudentDocumentCategory).default('OTHER'),
  visibleToStudent: z.boolean().default(true),
});
