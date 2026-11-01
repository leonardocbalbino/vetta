import type { NotificationChannel } from '../generated/client';

export interface TemplateSeedMvp {
  event: string;
  channel: NotificationChannel;
  subject?: string;
  title: string;
  body: string;
  ctaLabel?: string;
}

/** Templates da Fase 1 (pt-BR, versão 1). */
export const MVP_TEMPLATES: TemplateSeedMvp[] = [
  {
    event: 'workout.published',
    channel: 'IN_APP',
    title: 'Treino novo',
    body: '{{tenantName}} publicou o treino {{workoutName}}.',
  },
  {
    event: 'workout.published',
    channel: 'PUSH',
    title: 'Treino novo 💪',
    body: '{{workoutName}} já está no seu app.',
  },
  {
    event: 'workout.updated',
    channel: 'IN_APP',
    title: 'Treino atualizado',
    body: 'Seu treino {{workoutName}} foi ajustado.',
  },
  {
    event: 'workout.updated',
    channel: 'PUSH',
    title: 'Treino atualizado',
    body: '{{workoutName}} tem mudanças. Confira antes de treinar.',
  },
  {
    event: 'training.reminder',
    channel: 'PUSH',
    title: 'Hora do treino',
    body: 'Seu treino {{routineLabel}} está esperando. Bora?',
  },
  {
    event: 'feedback.critical',
    channel: 'EMAIL',
    subject: 'Atenção: feedback de {{studentName}}',
    title: 'Feedback que pede atenção',
    body: '{{studentName}} terminou {{workoutName}} com nota {{rating}}{{painText}}. Vale falar com o aluno.',
    ctaLabel: 'Ver feedback',
  },
  {
    event: 'feedback.critical',
    channel: 'IN_APP',
    title: 'Feedback crítico',
    body: '{{studentName}}: nota {{rating}}{{painText}}.',
  },
  {
    event: 'feedback.critical',
    channel: 'PUSH',
    title: 'Feedback crítico',
    body: '{{studentName}} avaliou o treino com nota {{rating}}{{painText}}.',
  },
  {
    event: 'record.achieved',
    channel: 'IN_APP',
    title: 'Recorde pessoal! 🏆',
    body: '{{exerciseName}}: {{recordText}}.',
  },
  {
    event: 'student.inactive',
    channel: 'IN_APP',
    title: 'Aluno sem treinar',
    body: '{{studentName}} está há {{days}} dias sem treinar.',
  },
  {
    event: 'student.inactive',
    channel: 'PUSH',
    title: 'Aluno sumido',
    body: '{{studentName}} não treina há {{days}} dias.',
  },
  {
    event: 'assessment.due',
    channel: 'EMAIL',
    subject: 'Reavaliação de {{studentName}} em 7 dias',
    title: 'Reavaliação chegando',
    body: 'A próxima avaliação de {{studentName}} está marcada para {{date}}.',
    ctaLabel: 'Ver avaliações',
  },
  {
    event: 'assessment.due',
    channel: 'IN_APP',
    title: 'Reavaliação em 7 dias',
    body: '{{studentName}}: avaliação em {{date}}.',
  },
  {
    event: 'anamnesis.requested',
    channel: 'EMAIL',
    subject: '{{tenantName}} pediu sua anamnese',
    title: 'Responda sua anamnese',
    body: 'Para montar seu treino com segurança, responda o questionário "{{templateName}}"{{dueText}}.',
    ctaLabel: 'Responder agora',
  },
  {
    event: 'anamnesis.requested',
    channel: 'IN_APP',
    title: 'Anamnese pendente',
    body: 'Responda "{{templateName}}"{{dueText}}.',
  },
  {
    event: 'anamnesis.requested',
    channel: 'PUSH',
    title: 'Anamnese pendente',
    body: '{{tenantName}} pediu que você responda "{{templateName}}".',
  },
  {
    event: 'anamnesis.answered',
    channel: 'IN_APP',
    title: 'Anamnese respondida',
    body: '{{studentName}} respondeu "{{templateName}}".',
  },
  {
    event: 'anamnesis.risk',
    channel: 'EMAIL',
    subject: 'PAR-Q com risco: {{studentName}}',
    title: 'Resposta de risco no PAR-Q',
    body: '{{studentName}} marcou "sim" em pelo menos uma pergunta do PAR-Q. Peça liberação médica antes de intensificar o treino.',
    ctaLabel: 'Ver respostas',
  },
  {
    event: 'anamnesis.risk',
    channel: 'IN_APP',
    title: 'PAR-Q com risco',
    body: '{{studentName}} marcou risco no PAR-Q.',
  },
  {
    event: 'anamnesis.risk',
    channel: 'PUSH',
    title: 'PAR-Q com risco',
    body: 'Confira as respostas de {{studentName}}.',
  },
  {
    event: 'birthday.upcoming',
    channel: 'IN_APP',
    title: 'Aniversário chegando 🎂',
    body: '{{studentName}} faz aniversário em {{date}}.',
  },
  {
    event: 'birthday.today',
    channel: 'IN_APP',
    title: 'Feliz aniversário! 🎉',
    body: '{{message}}',
  },
  { event: 'birthday.today', channel: 'PUSH', title: 'Feliz aniversário! 🎉', body: '{{message}}' },
  {
    event: 'plan.limit_warning',
    channel: 'EMAIL',
    subject: 'Você já usa {{percent}}% do limite de alunos',
    title: 'Limite de alunos quase cheio',
    body: 'Você tem {{used}} de {{max}} alunos no plano {{plan}}. Faça upgrade para continuar crescendo.',
    ctaLabel: 'Ver planos',
  },
  {
    event: 'plan.limit_warning',
    channel: 'IN_APP',
    title: 'Limite quase cheio',
    body: '{{used}} de {{max}} alunos usados.',
  },
  {
    event: 'plan.limit_reached',
    channel: 'EMAIL',
    subject: 'Você atingiu o limite de alunos',
    title: 'Limite de alunos atingido',
    body: 'Seu plano {{plan}} permite {{max}} alunos. Faça upgrade para convidar mais.',
    ctaLabel: 'Fazer upgrade',
  },
  {
    event: 'plan.limit_reached',
    channel: 'IN_APP',
    title: 'Limite atingido',
    body: 'Você usou todos os {{max}} alunos do plano.',
  },
  {
    event: 'subscription.trial_ends_today',
    channel: 'EMAIL',
    subject: 'Seu teste do Pro Plus termina hoje',
    title: 'Último dia de teste',
    body: 'Hoje é o último dia do seu teste. Escolha um plano para não perder os recursos do Pro Plus.',
    ctaLabel: 'Escolher plano',
  },
  {
    event: 'subscription.trial_ends_today',
    channel: 'IN_APP',
    title: 'Último dia de teste',
    body: 'Seu teste Pro Plus termina hoje.',
  },
  {
    event: 'subscription.trial_ends_today',
    channel: 'PUSH',
    title: 'Último dia de teste',
    body: 'Escolha um plano para continuar.',
  },
  {
    event: 'personal.registered',
    channel: 'EMAIL',
    subject: 'Novo personal: {{tenantName}}',
    title: 'Novo cadastro',
    body: '{{ownerName}} ({{ownerEmail}}) criou a conta {{tenantName}} e começou o teste.',
    ctaLabel: 'Ver no painel',
  },
];
