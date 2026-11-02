import type { FeatureType, PlanCode } from './enums.js';

/** -1 em features LIMIT significa ilimitado. */
export const UNLIMITED = -1;

export interface FeatureDefinition {
  key: string;
  type: FeatureType;
  module: string;
  name: string;
  description: string;
  /** Valor usado quando nem override nem plano definem a feature. */
  defaultValue: number | boolean;
  /** Unidade de exibição para LIMIT (ex.: alunos, MB). */
  unit?: string;
}

const bool = <K extends string>(
  key: K,
  module: string,
  name: string,
  description: string,
  defaultValue = false,
) => ({ key, type: 'BOOLEAN' as const, module, name, description, defaultValue });

const limit = <K extends string>(
  key: K,
  module: string,
  name: string,
  description: string,
  defaultValue: number,
  unit: string,
) => ({ key, type: 'LIMIT' as const, module, name, description, defaultValue, unit });

/**
 * Catálogo de features. Cada módulo registra aqui suas chaves; o seed
 * sincroniza com a tabela features. Valores por plano ficam no banco
 * (configuráveis pelo admin) — PLAN_SEED abaixo é só o ponto de partida.
 */
export const FEATURE_CATALOG = [
  // M1 core
  bool('core.auth', 'M1', 'Acesso', 'Login e contas', true),
  limit(
    'team.assistants',
    'M1',
    'Assistentes',
    'Personais assistentes na equipe',
    0,
    'assistentes',
  ),
  // M2 alunos
  limit('students.max', 'M2', 'Alunos ativos', 'Quantidade de alunos ativos', 2, 'alunos'),
  bool('students.groups', 'M2', 'Grupos de alunos', 'Organizar alunos em grupos'),
  bool('students.import_csv', 'M2', 'Importação CSV', 'Importar alunos por planilha'),
  bool('students.inactivity_alert', 'M2', 'Alerta de aluno sumido', 'Aviso de alunos sem treinar'),
  // M3 anamnese
  bool(
    'assessment.anamnesis',
    'M3',
    'Anamnese pronta',
    'Modelos PAR-Q, saúde geral e lesões',
    true,
  ),
  bool('assessment.anamnesis_custom', 'M3', 'Anamnese personalizada', 'Construtor de formulários'),
  // M4 avaliação
  limit(
    'assessment.physical_per_student',
    'M4',
    'Avaliações físicas',
    'Avaliações físicas por aluno',
    1,
    'avaliações',
  ),
  bool('assessment.posture', 'M4', 'Avaliação postural', 'Fotos com marcações posturais'),
  bool('assessment.pdf_branding', 'M4', 'PDF com sua logo', 'Relatórios em PDF com a sua marca'),
  // M5 biblioteca
  bool('library.global', 'M5', 'Biblioteca global', 'Exercícios da biblioteca Vetta', true),
  bool(
    'library.custom',
    'M5',
    'Biblioteca própria',
    'Seus próprios exercícios, pastas e favoritos',
  ),
  bool('library.custom_videos', 'M5', 'Vídeos próprios', 'Envio de vídeos de exercícios'),
  limit('storage.quota_mb', 'M5', 'Armazenamento', 'Espaço para mídias próprias', 500, 'MB'),
  // M6 treinos
  bool('workouts.routines', 'M6', 'Rotinas de treino', 'Programas e rotinas', true),
  bool('workouts.templates', 'M6', 'Modelos de treino', 'Salvar e reutilizar modelos'),
  bool('workouts.periodization', 'M6', 'Periodização', 'Planejamento por ciclos'),
  bool('workouts.group_apply', 'M6', 'Aplicar a grupo', 'Enviar treino para vários alunos'),
  bool('workouts.public_link', 'M6', 'Link público', 'Compartilhar treino por link e WhatsApp'),
  bool('workouts.ai_assistant', 'M6', 'IA de treino', 'Assistente de prescrição com IA'),
  limit(
    'workouts.ai_monthly',
    'M6',
    'Gerações de IA por mês',
    'Treinos, ajustes de carga e resumos gerados pela IA no mês',
    0,
    'gerações',
  ),
  // M7 player
  bool('training.player', 'M7', 'Player do aluno', 'Execução do treino com cronômetro', true),
  bool('training.feedback', 'M7', 'Feedback do treino', 'Feedback obrigatório ao finalizar', true),
  // M8 progresso
  bool('progress.charts', 'M8', 'Gráficos de evolução', 'Peso, medidas e cargas', true),
  bool('progress.photos', 'M8', 'Fotos de progresso', 'Antes e depois'),
  bool(
    'progress.health_integrations',
    'M8',
    'Apple Health e Health Connect',
    'Importar passos, frequência cardíaca, peso e treinos',
  ),
  // M9 comunicação
  bool('comms.chat', 'M9', 'Chat', 'Chat 1:1 com texto', true),
  bool('comms.chat_media', 'M9', 'Chat com mídia', 'Áudio, imagem e vídeo no chat'),
  bool('comms.broadcast', 'M9', 'Comunicados', 'Mensagens em massa'),
  bool('comms.whatsapp', 'M9', 'WhatsApp', 'Notificações e atalhos via WhatsApp'),
  // M10 agenda
  bool('schedule.calendar', 'M10', 'Agenda', 'Agenda presencial e online'),
  bool('schedule.google_calendar', 'M10', 'Google Calendar', 'Sincronização com Google Calendar'),
  // M11 financeiro
  bool('finance.student_billing', 'M11', 'Cobrança de alunos', 'Pix, boleto e cartão'),
  limit(
    'finance.split_fee_bps',
    'M11',
    'Taxa de split',
    'Taxa da plataforma em pontos-base',
    0,
    'bps',
  ),
  bool('finance.advanced_reports', 'M11', 'Relatórios avançados', 'Relatórios e exportação'),
  // M12 marca
  bool('brand.sales_page', 'M12', 'Página de vendas', 'Página pública com checkout'),
  bool('brand.white_label', 'M12', 'White label', 'Sua logo, cores e e-mails'),
  bool('brand.custom_domain', 'M12', 'Domínio próprio', 'Use seu domínio'),
  // M13 documentos
  bool('docs.student_folder', 'M13', 'Documentos do aluno', 'Exames, planos e contratos'),
  // M14 academy
  bool('academy.access', 'M14', 'Academy', 'Cursos, e-books e posts', true),
  // suporte
  bool('support.priority', 'support', 'Suporte prioritário', 'Atendimento prioritário'),
] as const satisfies readonly FeatureDefinition[];

export type FeatureKey = (typeof FEATURE_CATALOG)[number]['key'];
export type LimitFeatureKey = Extract<(typeof FEATURE_CATALOG)[number], { type: 'LIMIT' }>['key'];

export const FEATURES_BY_KEY: Record<string, FeatureDefinition> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f]),
);

export function isFeatureKey(key: string): key is FeatureKey {
  return key in FEATURES_BY_KEY;
}

export interface PlanSeed {
  code: PlanCode;
  name: string;
  description: string;
  sortOrder: number;
  /** Preço mensal em centavos; demais ciclos com desconto. */
  prices: Partial<Record<'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL', number>>;
  features: Partial<Record<FeatureKey, number | boolean>>;
}

const FREE_FEATURES = {
  'core.auth': true,
  'team.assistants': 0,
  'students.max': 2,
  'assessment.anamnesis': true,
  'assessment.physical_per_student': 1,
  'library.global': true,
  'storage.quota_mb': 500,
  'workouts.routines': true,
  'training.player': true,
  'training.feedback': true,
  'progress.charts': true,
  'comms.chat': true,
  'academy.access': true,
} satisfies PlanSeed['features'];

const PRO_FEATURES = {
  ...FREE_FEATURES,
  'students.max': 50,
  'students.groups': true,
  'students.import_csv': true,
  'students.inactivity_alert': true,
  'assessment.anamnesis_custom': true,
  'assessment.physical_per_student': UNLIMITED,
  'assessment.posture': true,
  'assessment.pdf_branding': true,
  'library.custom': true,
  'library.custom_videos': true,
  'storage.quota_mb': 5 * 1024,
  'workouts.templates': true,
  'workouts.periodization': true,
  'workouts.ai_monthly': 20,
  'workouts.group_apply': true,
  'workouts.public_link': true,
  'progress.photos': true,
  'comms.chat_media': true,
  'comms.broadcast': true,
  'schedule.calendar': true,
  'finance.student_billing': true,
  'finance.split_fee_bps': 299,
  'brand.sales_page': true,
  'docs.student_folder': true,
} satisfies PlanSeed['features'];

const PRO_PLUS_FEATURES = {
  ...PRO_FEATURES,
  'students.max': UNLIMITED,
  'team.assistants': 5,
  'storage.quota_mb': 50 * 1024,
  'workouts.ai_assistant': true,
  'workouts.ai_monthly': 200,
  'progress.health_integrations': true,
  'brand.white_label': true,
  'brand.custom_domain': true,
  'comms.whatsapp': true,
  'schedule.google_calendar': true,
  'finance.advanced_reports': true,
  'finance.split_fee_bps': 149,
  'support.priority': true,
} satisfies PlanSeed['features'];

/** Seed inicial dos planos (CLAUDE.md §5). Depois disso, só o admin altera. */
export const PLAN_SEED: PlanSeed[] = [
  {
    code: 'FREE',
    name: 'Free',
    description: 'Para começar com até 2 alunos.',
    sortOrder: 0,
    prices: { MONTHLY: 0 },
    features: FREE_FEATURES,
  },
  {
    code: 'PRO',
    name: 'Pro',
    description: 'Para personais em crescimento.',
    sortOrder: 1,
    prices: { MONTHLY: 3990, QUARTERLY: 11370, SEMIANNUAL: 21540, ANNUAL: 39900 },
    features: PRO_FEATURES,
  },
  {
    code: 'PRO_PLUS',
    name: 'Pro Plus',
    description: 'Para equipes e marcas próprias.',
    sortOrder: 2,
    prices: { MONTHLY: 7990, QUARTERLY: 22770, SEMIANNUAL: 43140, ANNUAL: 79900 },
    features: PRO_PLUS_FEATURES,
  },
];

export const TRIAL_PLAN: PlanCode = 'PRO_PLUS';
export const TRIAL_DAYS = 14;
export const FALLBACK_PLAN: PlanCode = 'FREE';
