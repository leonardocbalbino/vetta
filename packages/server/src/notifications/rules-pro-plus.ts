import { deepLinks, type DomainEvent } from '@vetta/contracts';
import type { NotificationRule } from './rules';

const p = (e: DomainEvent, k: string) => String(e.payload[k] ?? '');

/** Regras da Fase 3 (Pro Plus). */
export const PRO_PLUS_RULES: NotificationRule[] = [
  {
    event: 'team.invited',
    category: 'SYSTEM',
    recipients: 'user',
    channels: ['EMAIL'],
    immediate: true,
    deepLink: (e) => deepLinks.teamInvite(p(e, 'token')),
  },
  {
    event: 'team.joined',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'PUSH'],
    deepLink: () => deepLinks.team(),
  },
  {
    event: 'custom_domain.active',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.brand(),
  },
  {
    event: 'custom_domain.failed',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.brand(),
  },
  {
    event: 'support.ticket_created',
    category: 'SYSTEM',
    recipients: 'platform_admins',
    channels: ['EMAIL'],
    immediate: true,
    deepLink: (e) => deepLinks.adminTicket(p(e, 'ticketId')),
  },
  {
    event: 'support.ticket_replied',
    category: 'SYSTEM',
    recipients: 'user',
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    deepLink: (e) => deepLinks.supportTicket(p(e, 'ticketId')),
  },
  {
    // Canais escolhidos pelo admin em payload.channels (subconjunto destes).
    event: 'platform.broadcast',
    category: 'MARKETING',
    recipients: 'user',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    deepLink: (e) => p(e, 'deepLink') || deepLinks.notifications(),
  },
];
