import { z } from 'zod';
import { EmailSchema } from './common.js';
import { StudentLinkStatus } from './enums.js';

export const StudentLevel = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

export const StudentListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(StudentLinkStatus).optional(),
  groupId: z.uuid().optional(),
  tag: z.string().max(40).optional(),
  /** Sem treinar há pelo menos N dias. */
  inactiveDays: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(['name', 'last_workout', 'joined']).default('name'),
});
export type StudentListQuery = z.infer<typeof StudentListQuerySchema>;

const phone = z
  .string()
  .trim()
  .regex(/^\+?\d{10,15}$/, 'Use DDD e número, ex.: +5511999999999.');

export const UpdateStudentSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  goal: z.string().trim().max(200).nullable().optional(),
  level: z.enum(StudentLevel).nullable().optional(),
  restrictions: z.string().max(2000).nullable().optional(),
  injuries: z.string().max(2000).nullable().optional(),
  whatsapp: phone.nullable().optional(),
  phone: phone.nullable().optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: phone.nullable().optional(),
  birthDate: z.iso.date().nullable().optional(),
  sex: z.enum(['FEMALE', 'MALE', 'OTHER']).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: z.string().max(5000).nullable().optional(),
  assistantMemberId: z.uuid().nullable().optional(),
});
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

export const BulkStudentActionSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  action: z.enum([
    'archive',
    'restore',
    'add_tag',
    'remove_tag',
    'add_to_group',
    'remove_from_group',
    'pause',
    'resume',
  ]),
  tag: z.string().trim().min(1).max(40).optional(),
  groupId: z.uuid().optional(),
});

export const GroupInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

/** Uma linha do CSV de importação de alunos (nome;email;whatsapp;objetivo;tags). */
export const StudentCsvRowSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: EmailSchema.optional(),
  whatsapp: phone.optional(),
  objetivo: z.string().trim().max(200).optional(),
  tags: z.string().optional(),
});

export const TenantSettingsSchema = z.object({
  inactivityAlertDays: z.number().int().min(1).max(60).optional(),
  /** Lembrete de reavaliação física a cada N dias (null desliga). */
  reassessmentDays: z.number().int().min(15).max(365).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
});

export const STUDENT_TABS = [
  { key: 'summary', label: 'Resumo', feature: null },
  { key: 'workouts', label: 'Treinos', feature: 'workouts.routines' },
  { key: 'assessments', label: 'Avaliações', feature: 'assessment.anamnesis' },
  { key: 'anamnesis', label: 'Anamnese', feature: 'assessment.anamnesis' },
  { key: 'progress', label: 'Evolução', feature: 'progress.charts' },
  { key: 'photos', label: 'Fotos', feature: 'progress.photos' },
  { key: 'documents', label: 'Documentos', feature: 'docs.student_folder' },
  { key: 'finance', label: 'Financeiro', feature: 'finance.student_billing' },
  { key: 'chat', label: 'Chat', feature: 'comms.chat' },
  { key: 'timeline', label: 'Linha do tempo', feature: null },
] as const;
