import type { NotificationChannel, PrismaClient } from '../generated/client';
import { MVP_TEMPLATES } from './catalog-templates-mvp';

interface TemplateSeed {
  event: string;
  channel: NotificationChannel;
  subject?: string;
  title: string;
  body: string;
  ctaLabel?: string;
}

/**
 * Templates iniciais (pt-BR, versão 1). Variáveis em {{chave}}.
 * O admin cria novas versões; a versão ativa mais alta vence.
 */
const PT_BR: TemplateSeed[] = [
  {
    event: 'auth.email_verification_requested',
    channel: 'EMAIL',
    subject: 'Confirme seu e-mail',
    title: 'Confirme seu e-mail',
    body: 'Olá, {{name}}! Falta pouco: confirme seu e-mail para ativar sua conta. O link vale por 24 horas.',
    ctaLabel: 'Confirmar e-mail',
  },
  {
    event: 'auth.password_reset_requested',
    channel: 'EMAIL',
    subject: 'Redefina sua senha',
    title: 'Redefinir senha',
    body: 'Recebemos um pedido para redefinir sua senha. Se foi você, use o botão abaixo em até 1 hora. Se não foi, ignore este e-mail.',
    ctaLabel: 'Criar nova senha',
  },
  {
    event: 'auth.magic_link_requested',
    channel: 'EMAIL',
    subject: 'Seu link de acesso',
    title: 'Entrar na Vetta',
    body: 'Use o botão abaixo para entrar sem senha. O link vale por 15 minutos e só funciona uma vez.',
    ctaLabel: 'Entrar agora',
  },
  {
    event: 'auth.new_login',
    channel: 'EMAIL',
    subject: 'Novo acesso à sua conta',
    title: 'Novo acesso detectado',
    body: 'Sua conta foi acessada em {{device}} ({{ip}}) em {{when}}. Não foi você? Encerre a sessão e troque sua senha.',
    ctaLabel: 'Ver sessões',
  },
  {
    event: 'auth.new_login',
    channel: 'PUSH',
    title: 'Novo acesso',
    body: 'Sua conta foi acessada em {{device}}.',
  },
  {
    event: 'auth.new_login',
    channel: 'IN_APP',
    title: 'Novo acesso',
    body: 'Acesso em {{device}} ({{ip}}).',
  },
  {
    event: 'auth.refresh_token_reused',
    channel: 'EMAIL',
    subject: 'Encerramos uma sessão por segurança',
    title: 'Sessão encerrada por segurança',
    body: 'Detectamos uma tentativa de reutilizar um acesso antigo em {{device}} e encerramos essa sessão. Se não reconhece, troque sua senha.',
    ctaLabel: 'Revisar segurança',
  },
  {
    event: 'auth.refresh_token_reused',
    channel: 'IN_APP',
    title: 'Sessão encerrada por segurança',
    body: 'Encerramos a sessão em {{device}} após um acesso suspeito.',
  },
  {
    event: 'auth.two_factor_enabled',
    channel: 'EMAIL',
    subject: 'Verificação em duas etapas ativada',
    title: 'Sua conta está mais protegida',
    body: 'A verificação em duas etapas foi ativada. Guarde seus códigos de recuperação em local seguro.',
  },
  {
    event: 'student.invited',
    channel: 'EMAIL',
    subject: '{{tenantName}} convidou você para a Vetta',
    title: 'Você foi convidado!',
    body: '{{tenantName}} quer acompanhar seus treinos pela Vetta. Aceite o convite em até 7 dias e defina sua senha.',
    ctaLabel: 'Aceitar convite',
  },
  {
    event: 'student.joined',
    channel: 'IN_APP',
    title: 'Novo aluno',
    body: '{{studentName}} aceitou seu convite.',
  },
  {
    event: 'student.joined',
    channel: 'PUSH',
    title: 'Novo aluno 🎉',
    body: '{{studentName}} aceitou seu convite.',
  },
  {
    event: 'students.archived',
    channel: 'EMAIL',
    subject: 'Alguns alunos foram arquivados',
    title: 'Alunos arquivados',
    body: 'Seu plano agora permite {{max}} alunos ativos. Arquivamos {{count}} alunos — nenhum dado foi apagado. Faça upgrade para reativá-los.',
    ctaLabel: 'Ver planos',
  },
  {
    event: 'students.archived',
    channel: 'IN_APP',
    title: 'Alunos arquivados',
    body: '{{count}} alunos foram arquivados. Nenhum dado foi apagado.',
  },
  {
    event: 'subscription.trial_ending',
    channel: 'EMAIL',
    subject: 'Seu teste do Pro Plus termina em {{daysLeft}} dias',
    title: 'Seu teste está acabando',
    body: 'Faltam {{daysLeft}} dias para o fim do seu teste. Escolha um plano para continuar com todos os recursos.',
    ctaLabel: 'Escolher plano',
  },
  {
    event: 'subscription.trial_ending',
    channel: 'IN_APP',
    title: 'Teste acabando',
    body: 'Faltam {{daysLeft}} dias do seu teste Pro Plus.',
  },
  {
    event: 'subscription.trial_ending',
    channel: 'PUSH',
    title: 'Teste acabando',
    body: 'Faltam {{daysLeft}} dias do seu teste Pro Plus.',
  },
  {
    event: 'subscription.trial_expired',
    channel: 'EMAIL',
    subject: 'Seu teste terminou',
    title: 'Seu teste terminou',
    body: 'Sua conta voltou para o plano Free. Seus dados continuam salvos; o que não faz parte do Free ficou somente leitura.',
    ctaLabel: 'Fazer upgrade',
  },
  {
    event: 'subscription.trial_expired',
    channel: 'IN_APP',
    title: 'Teste encerrado',
    body: 'Sua conta voltou para o plano Free.',
  },
  {
    event: 'media.ready',
    channel: 'IN_APP',
    title: 'Arquivo pronto',
    body: '{{fileName}} foi processado e já está disponível.',
  },
  {
    event: 'media.failed',
    channel: 'IN_APP',
    title: 'Falha no envio',
    body: 'Não conseguimos processar {{fileName}}: {{reason}}',
  },
  {
    event: 'media.failed',
    channel: 'PUSH',
    title: 'Falha no envio',
    body: 'Não conseguimos processar {{fileName}}.',
  },
  {
    event: 'storage.quota_warning',
    channel: 'EMAIL',
    subject: 'Você já usou {{percent}}% do seu armazenamento',
    title: 'Armazenamento quase cheio',
    body: 'Você usou {{used}} de {{max}}. Libere espaço ou faça upgrade para continuar enviando vídeos e fotos.',
    ctaLabel: 'Ver armazenamento',
  },
  {
    event: 'storage.quota_warning',
    channel: 'IN_APP',
    title: 'Armazenamento quase cheio',
    body: 'Você usou {{percent}}% do seu espaço.',
  },
  {
    event: 'storage.quota_exceeded',
    channel: 'IN_APP',
    title: 'Armazenamento cheio',
    body: 'Seu espaço acabou. Novos envios estão bloqueados.',
  },
  {
    event: 'storage.quota_exceeded',
    channel: 'EMAIL',
    subject: 'Seu armazenamento está cheio',
    title: 'Armazenamento cheio',
    body: 'Novos envios estão bloqueados até você liberar espaço ou fazer upgrade.',
    ctaLabel: 'Resolver agora',
  },
  {
    event: 'workout.completed',
    channel: 'IN_APP',
    title: 'Treino concluído',
    body: '{{studentName}} concluiu {{workoutName}}.',
  },
  {
    event: 'workout.completed',
    channel: 'PUSH',
    title: 'Treino concluído',
    body: '{{studentName}} concluiu {{workoutName}}.',
  },
  { event: 'chat.message_created', channel: 'PUSH', title: '{{senderName}}', body: '{{preview}}' },
  {
    event: 'chat.message_created',
    channel: 'IN_APP',
    title: 'Nova mensagem',
    body: '{{senderName}}: {{preview}}',
  },
  {
    event: 'invoice.created',
    channel: 'EMAIL',
    subject: 'Nova cobrança de {{tenantName}}',
    title: 'Nova cobrança',
    body: 'Você tem uma cobrança de {{amount}} com vencimento em {{dueDate}}.',
    ctaLabel: 'Pagar agora',
  },
  {
    event: 'invoice.created',
    channel: 'IN_APP',
    title: 'Nova cobrança',
    body: '{{amount}} com vencimento em {{dueDate}}.',
  },
  {
    event: 'invoice.created',
    channel: 'WHATSAPP',
    title: 'Nova cobrança',
    body: 'Olá! Sua cobrança de {{amount}} vence em {{dueDate}}: {{link}}',
  },
  {
    event: 'invoice.overdue',
    channel: 'EMAIL',
    subject: 'Sua cobrança venceu',
    title: 'Cobrança vencida',
    body: 'A cobrança de {{amount}} venceu em {{dueDate}}. Regularize para manter seu acesso.',
    ctaLabel: 'Pagar agora',
  },
  {
    event: 'invoice.overdue',
    channel: 'PUSH',
    title: 'Cobrança vencida',
    body: 'Sua cobrança de {{amount}} venceu.',
  },
  {
    event: 'invoice.overdue',
    channel: 'WHATSAPP',
    title: 'Cobrança vencida',
    body: 'Sua cobrança de {{amount}} venceu em {{dueDate}}: {{link}}',
  },
  {
    event: 'appointment.reminder',
    channel: 'PUSH',
    title: 'Lembrete',
    body: '{{title}} começa às {{time}}.',
  },
  {
    event: 'appointment.reminder',
    channel: 'IN_APP',
    title: 'Lembrete',
    body: '{{title}} começa às {{time}}.',
  },
  {
    event: 'appointment.reminder',
    channel: 'WHATSAPP',
    title: 'Lembrete',
    body: 'Lembrete: {{title}} às {{time}}.',
  },
];

/** Cria a versão 1 dos templates que ainda não existem. Seguro em produção. */
export async function syncNotificationTemplates(db: PrismaClient): Promise<number> {
  let created = 0;
  for (const t of [...PT_BR, ...MVP_TEMPLATES]) {
    const exists = await db.notificationTemplate.findFirst({
      where: { event: t.event, channel: t.channel, locale: 'pt-BR', tenantId: null },
    });
    if (exists) continue;
    await db.notificationTemplate.create({
      data: {
        event: t.event,
        channel: t.channel,
        locale: 'pt-BR',
        version: 1,
        subject: t.subject ?? null,
        title: t.title,
        body: t.body,
        ctaLabel: t.ctaLabel ?? null,
      },
    });
    created++;
  }
  return created;
}
