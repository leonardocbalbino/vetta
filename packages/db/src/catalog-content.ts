import type { Prisma, PrismaClient } from '../generated/client';

/** Modelos de anamnese prontos da plataforma (tenant_id nulo). */
const ANAMNESIS_TEMPLATES: {
  kind: 'PARQ' | 'GENERAL_HEALTH' | 'INJURIES';
  name: string;
  schema: Prisma.InputJsonValue;
}[] = [
  {
    kind: 'PARQ',
    name: 'PAR-Q (Questionário de Prontidão para Atividade Física)',
    schema: {
      questions: [
        {
          id: 'q1',
          type: 'yes_no',
          label:
            'Algum médico já disse que você possui algum problema de coração e que só deveria realizar atividade física supervisionada?',
        },
        {
          id: 'q2',
          type: 'yes_no',
          label: 'Você sente dores no peito quando pratica atividade física?',
        },
        {
          id: 'q3',
          type: 'yes_no',
          label:
            'No último mês, você sentiu dores no peito quando não estava praticando atividade física?',
        },
        {
          id: 'q4',
          type: 'yes_no',
          label: 'Você perde o equilíbrio por causa de tontura ou já perdeu a consciência?',
        },
        {
          id: 'q5',
          type: 'yes_no',
          label:
            'Você tem algum problema ósseo ou articular que poderia piorar com a atividade física?',
        },
        {
          id: 'q6',
          type: 'yes_no',
          label:
            'Você toma atualmente algum medicamento para pressão arterial ou problema de coração?',
        },
        {
          id: 'q7',
          type: 'yes_no',
          label: 'Existe alguma outra razão pela qual você não deveria praticar atividade física?',
        },
      ],
    },
  },
  {
    kind: 'GENERAL_HEALTH',
    name: 'Saúde geral',
    schema: {
      questions: [
        {
          id: 'conditions',
          type: 'multi_choice',
          label: 'Você tem alguma destas condições?',
          options: ['Hipertensão', 'Diabetes', 'Asma', 'Colesterol alto', 'Nenhuma'],
        },
        { id: 'medications', type: 'text', label: 'Usa algum medicamento? Quais?' },
        { id: 'sleep_hours', type: 'number', label: 'Quantas horas você dorme por noite?' },
        { id: 'smoker', type: 'yes_no', label: 'Você fuma?' },
        {
          id: 'activity_level',
          type: 'single_choice',
          label: 'Nível de atividade atual',
          options: ['Sedentário', 'Leve', 'Moderado', 'Intenso'],
        },
      ],
    },
  },
  {
    kind: 'INJURIES',
    name: 'Lesões e dores',
    schema: {
      questions: [
        { id: 'has_injury', type: 'yes_no', label: 'Você tem ou já teve alguma lesão?' },
        {
          id: 'injury_regions',
          type: 'multi_choice',
          label: 'Regiões afetadas',
          options: ['Ombro', 'Coluna', 'Joelho', 'Quadril', 'Tornozelo', 'Punho', 'Outra'],
        },
        { id: 'surgery', type: 'text', label: 'Já fez alguma cirurgia? Qual e quando?' },
        { id: 'pain_scale', type: 'scale', label: 'Dor atual (0 a 10)', min: 0, max: 10 },
      ],
    },
  },
];

const GLOBAL_EXERCISES: {
  name: string;
  category: 'STRENGTH' | 'CARDIO' | 'MOBILITY';
  primaryMuscles: string[];
  equipment: string[];
}[] = [
  {
    name: 'Agachamento livre',
    category: 'STRENGTH',
    primaryMuscles: ['quadríceps', 'glúteos'],
    equipment: ['barra'],
  },
  {
    name: 'Supino reto',
    category: 'STRENGTH',
    primaryMuscles: ['peitoral'],
    equipment: ['barra', 'banco'],
  },
  {
    name: 'Remada curvada',
    category: 'STRENGTH',
    primaryMuscles: ['dorsais'],
    equipment: ['barra'],
  },
  {
    name: 'Levantamento terra',
    category: 'STRENGTH',
    primaryMuscles: ['posteriores', 'glúteos', 'lombar'],
    equipment: ['barra'],
  },
  {
    name: 'Desenvolvimento com halteres',
    category: 'STRENGTH',
    primaryMuscles: ['ombros'],
    equipment: ['halteres'],
  },
  {
    name: 'Puxada frontal',
    category: 'STRENGTH',
    primaryMuscles: ['dorsais'],
    equipment: ['polia'],
  },
  {
    name: 'Leg press 45°',
    category: 'STRENGTH',
    primaryMuscles: ['quadríceps', 'glúteos'],
    equipment: ['máquina'],
  },
  { name: 'Rosca direta', category: 'STRENGTH', primaryMuscles: ['bíceps'], equipment: ['barra'] },
  {
    name: 'Tríceps na polia',
    category: 'STRENGTH',
    primaryMuscles: ['tríceps'],
    equipment: ['polia'],
  },
  { name: 'Prancha', category: 'STRENGTH', primaryMuscles: ['core'], equipment: [] },
  { name: 'Esteira', category: 'CARDIO', primaryMuscles: [], equipment: ['esteira'] },
  {
    name: 'Mobilidade de quadril 90/90',
    category: 'MOBILITY',
    primaryMuscles: ['quadril'],
    equipment: [],
  },
];

/** Conteúdo global (modelos de anamnese + biblioteca inicial). Seguro em produção. */
export async function syncGlobalContent(db: PrismaClient): Promise<void> {
  for (const t of ANAMNESIS_TEMPLATES) {
    const exists = await db.anamnesisTemplate.findFirst({
      where: { tenantId: null, kind: t.kind },
    });
    if (!exists) await db.anamnesisTemplate.create({ data: { ...t, tenantId: null } });
  }
  for (const e of GLOBAL_EXERCISES) {
    const exists = await db.exercise.findFirst({ where: { tenantId: null, name: e.name } });
    if (!exists) await db.exercise.create({ data: { ...e, tenantId: null } });
  }
}
