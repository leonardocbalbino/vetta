import type { TemplateSeedMvp } from './catalog-templates-mvp';

type Channel = TemplateSeedMvp['channel'];

/** Um evento em vários canais com o mesmo título e texto (e assunto/CTA no e-mail). */
function all(
  event: string,
  channels: Channel[],
  t: { title: string; body: string; subject?: string; ctaLabel?: string; push?: string },
): TemplateSeedMvp[] {
  return channels.map((channel) => ({
    event,
    channel,
    title: t.title,
    body: channel === 'PUSH' && t.push ? t.push : t.body,
    ...(channel === 'EMAIL'
      ? { subject: t.subject ?? t.title, ...(t.ctaLabel ? { ctaLabel: t.ctaLabel } : {}) }
      : {}),
  }));
}

/** Templates da Fase 2 (pt-BR, versão 1). Tom direto, tratando por você. */
export const PRO_TEMPLATES: TemplateSeedMvp[] = [
  // Assinatura da plataforma
  ...all('subscription.activated', ['IN_APP', 'EMAIL'], {
    title: 'Seu plano {{planName}} está ativo',
    body: 'Pagamento confirmado. Todos os recursos do {{planName}} já estão liberados para você.',
    ctaLabel: 'Ver minha assinatura',
  }),
  ...all('subscription.plan_changed', ['IN_APP', 'EMAIL'], {
    title: 'Plano alterado para {{planName}}',
    body: 'A troca de plano que você agendou entrou em vigor.',
    ctaLabel: 'Ver minha assinatura',
  }),
  ...all('subscription.payment_reminder', ['IN_APP', 'EMAIL', 'PUSH'], {
    title: 'Sua fatura Vetta {{when}}',
    body: 'A fatura de {{amount}} {{when}} ({{dueDate}}). Pague por Pix, boleto ou cartão para manter seu plano.',
    push: 'Fatura de {{amount}} {{when}}.',
    ctaLabel: 'Pagar fatura',
  }),
  ...all('subscription.payment_failed', ['IN_APP', 'EMAIL', 'PUSH'], {
    title: 'Não conseguimos cobrar seu cartão',
    body: 'A cobrança de {{amount}} foi recusada. Atualize o cartão ou pague por Pix para não perder recursos.',
    push: 'Cartão recusado na fatura de {{amount}}.',
    ctaLabel: 'Atualizar pagamento',
  }),
  ...all('subscription.past_due', ['IN_APP', 'EMAIL', 'PUSH'], {
    title: 'Fatura em atraso',
    body: 'A fatura de {{amount}} venceu. Você tem até {{graceDate}} para pagar antes de o plano voltar ao Free. Nenhum dado será apagado.',
    push: 'Fatura de {{amount}} em atraso. Pague até {{graceDate}}.',
    ctaLabel: 'Pagar agora',
  }),
  ...all('subscription.downgraded', ['IN_APP', 'EMAIL'], {
    title: 'Sua conta voltou ao plano Free',
    body: '{{reason}} Seus dados continuam guardados; o que não cabe no Free fica somente leitura. Assine de novo quando quiser.',
    ctaLabel: 'Ver planos',
  }),
  ...all('platform_invoice.paid', ['IN_APP', 'EMAIL'], {
    title: 'Pagamento recebido',
    body: 'Recebemos {{amount}}. Obrigado por usar a Vetta!',
    ctaLabel: 'Ver faturas',
  }),
  ...all('platform_invoice.refunded', ['IN_APP', 'EMAIL'], {
    title: 'Estorno realizado',
    body: 'Estornamos {{amount}} da sua fatura Vetta.',
  }),
  ...all('fiscal_invoice.issued', ['EMAIL'], {
    title: 'Sua nota fiscal está disponível',
    body: 'A NFS-e nº {{number}} da sua assinatura Vetta foi emitida.',
    ctaLabel: 'Baixar nota fiscal',
  }),
  // Financeiro do personal
  ...all('payment_account.status_changed', ['IN_APP', 'EMAIL', 'PUSH'], {
    title: 'Carteira {{statusLabel}}',
    body: 'O status da sua carteira de recebimentos mudou para {{statusLabel}}.',
    ctaLabel: 'Ver carteira',
  }),
  ...all('invoice.created', ['PUSH', 'EMAIL'], {
    title: 'Nova cobrança de {{tenantName}}',
    body: 'Cobrança de {{amount}} com vencimento em {{dueDate}}. Pague pelo app com Pix, boleto ou cartão.',
    push: '{{amount}} com vencimento em {{dueDate}}.',
    ctaLabel: 'Pagar',
  }),
  ...all('invoice.reminder', ['IN_APP', 'EMAIL', 'PUSH'], {
    title: 'Sua mensalidade {{when}}',
    body: 'A cobrança de {{amount}} de {{tenantName}} {{when}} ({{dueDate}}).',
    push: 'Cobrança de {{amount}} {{when}}.',
    ctaLabel: 'Pagar agora',
  }),
  {
    event: 'invoice.reminder',
    channel: 'WHATSAPP',
    title: 'Lembrete de pagamento',
    body: 'Olá! Sua cobrança de {{amount}} {{when}} ({{dueDate}}): {{link}}',
  },
  ...all('invoice.overdue', ['IN_APP'], {
    title: 'Cobrança vencida',
    body: 'A cobrança de {{amount}} venceu em {{dueDate}}. Regularize para manter seu acesso.',
  }),
  ...all('invoice.payment_failed', ['IN_APP', 'PUSH', 'EMAIL'], {
    title: 'Pagamento não aprovado',
    body: 'O cartão foi recusado na cobrança de {{amount}}. Tente outro cartão ou pague por Pix.',
    ctaLabel: 'Tentar de novo',
  }),
  ...all('invoice.paid', ['IN_APP'], {
    title: 'Pagamento recebido',
    body: '{{studentName}} pagou {{amount}}.',
  }),
  ...all('student.blocked', ['IN_APP', 'PUSH', 'EMAIL'], {
    title: 'Seu acesso está pausado',
    body: 'Há uma cobrança de {{amount}} em aberto com {{tenantName}}. Assim que o pagamento for confirmado, seus treinos voltam na hora.',
    push: 'Acesso pausado: cobrança de {{amount}} em aberto.',
    ctaLabel: 'Regularizar',
  }),
  ...all('student.unblocked', ['IN_APP', 'PUSH'], {
    title: 'Acesso liberado',
    body: 'Pagamento confirmado. Bora treinar!',
  }),
  ...all('student_plan.ending', ['IN_APP', 'EMAIL'], {
    title: 'Plano termina em {{days}} dias',
    body: 'O plano {{planName}} de {{studentName}} termina em {{endDate}}. Renove para não interromper os treinos.',
    ctaLabel: 'Ver plano',
  }),
  ...all('checkout.paid', ['IN_APP', 'PUSH', 'EMAIL'], {
    title: 'Nova venda: {{planName}}',
    body: '{{studentName}} comprou {{planName}} ({{amount}}) pela sua página. O convite já foi enviado.',
    push: '{{studentName}} comprou {{planName}}.',
    ctaLabel: 'Ver aluno',
  }),
  ...all('withdrawal.done', ['IN_APP', 'PUSH'], {
    title: 'Saque concluído',
    body: '{{amount}} já está na sua conta.',
  }),
  ...all('withdrawal.failed', ['IN_APP', 'PUSH', 'EMAIL'], {
    title: 'Saque não concluído',
    body: 'O saque de {{amount}} não foi concluído e o valor voltou para a carteira. {{reason}}',
    ctaLabel: 'Ver carteira',
  }),
  // Agenda
  ...all('appointment.booked', ['IN_APP', 'PUSH'], {
    title: 'Aula agendada',
    body: '{{title}} em {{when}}{{recurring}}.',
  }),
  ...all('appointment.canceled', ['IN_APP', 'PUSH'], {
    title: 'Aula cancelada',
    body: '{{title}} foi cancelada.',
  }),
  ...all('appointment.reminder', ['IN_APP'], {
    title: 'Aula {{when}}',
    body: '{{title}} às {{time}}. {{place}}',
  }),
  // Comunicados, periodização, página de vendas, documentos
  ...all('broadcast.sent', ['IN_APP', 'PUSH', 'EMAIL'], {
    title: '{{title}}',
    body: '{{body}}',
    subject: '{{tenantName}}: {{title}}',
  }),
  ...all('periodization.phase_started', ['IN_APP', 'PUSH'], {
    title: 'Nova fase: {{phaseName}}',
    body: 'Seu treino mudou para {{workoutName}}. Confira antes de treinar.',
  }),
  ...all('testimonial.submitted', ['IN_APP'], {
    title: 'Novo depoimento',
    body: '{{studentName}} enviou um depoimento. Aprove para aparecer na sua página.',
  }),
  ...all('result.consent_requested', ['IN_APP', 'PUSH'], {
    title: 'Pedido de autorização',
    body: '{{tenantName}} quer mostrar sua evolução (antes e depois) na página de vendas. Só aparece se você autorizar.',
  }),
  ...all('document.shared', ['IN_APP', 'PUSH'], {
    title: 'Novo documento',
    body: '{{tenantName}} adicionou "{{title}}" na sua pasta.',
  }),
];
