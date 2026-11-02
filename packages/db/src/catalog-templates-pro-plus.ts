import type { TemplateSeedMvp } from './catalog-templates-mvp';

type Channel = TemplateSeedMvp['channel'];

function all(
  event: string,
  channels: Channel[],
  t: { title: string; body: string; subject?: string; ctaLabel?: string },
): TemplateSeedMvp[] {
  return channels.map((channel) => ({
    event,
    channel,
    title: t.title,
    body: t.body,
    ...(channel === 'EMAIL'
      ? { subject: t.subject ?? t.title, ...(t.ctaLabel ? { ctaLabel: t.ctaLabel } : {}) }
      : {}),
  }));
}

/** Templates da Fase 3 (pt-BR, versão 1). */
export const PRO_PLUS_TEMPLATES: TemplateSeedMvp[] = [
  ...all('team.invited', ['EMAIL'], {
    subject: '{{tenantName}} convidou você para a equipe',
    title: 'Você entrou para uma equipe',
    body: '{{tenantName}} convidou você para acompanhar alunos como assistente na Vetta. Aceite em até 7 dias.',
    ctaLabel: 'Aceitar convite',
  }),
  ...all('team.joined', ['IN_APP', 'PUSH'], {
    title: 'Assistente na equipe',
    body: '{{memberName}} aceitou o convite e já pode acompanhar os alunos atribuídos.',
  }),
  ...all('custom_domain.active', ['IN_APP', 'EMAIL'], {
    title: 'Seu domínio está no ar',
    body: '{{domain}} já abre o app com a sua marca, com certificado de segurança ativo.',
    ctaLabel: 'Ver minha marca',
  }),
  ...all('custom_domain.failed', ['IN_APP', 'EMAIL'], {
    title: 'Não conseguimos ativar seu domínio',
    body: 'Confira o registro CNAME de {{domain}} e tente verificar de novo. {{error}}',
    ctaLabel: 'Revisar domínio',
  }),
  ...all('support.ticket_created', ['EMAIL'], {
    subject: '[Suporte #{{number}}] {{subject}} ({{priority}})',
    title: 'Novo chamado #{{number}}',
    body: '{{tenantName}} ({{plan}}) abriu um chamado: {{subject}}. Primeira resposta até {{dueAt}}.',
    ctaLabel: 'Abrir chamado',
  }),
  ...all('support.ticket_replied', ['IN_APP', 'EMAIL', 'PUSH'], {
    subject: 'Resposta no chamado #{{number}}',
    title: 'Respondemos seu chamado',
    body: 'Chamado #{{number}} ({{subject}}) tem uma nova resposta da equipe Vetta.',
    ctaLabel: 'Ver resposta',
  }),
  ...all('platform.broadcast', ['IN_APP', 'PUSH', 'EMAIL'], {
    subject: '{{title}}',
    title: '{{title}}',
    body: '{{body}}',
    ctaLabel: 'Saiba mais',
  }),
];
