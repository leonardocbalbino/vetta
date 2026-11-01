import { deepLinks, type DomainEvent } from '@vetta/contracts';
import type { NotificationRule } from './rules';

const p = (e: DomainEvent, k: string) => String(e.payload[k] ?? '');

/** Regras de notificação da Fase 1 (CLAUDE.md fase 1, §1.11). */
export const MVP_RULES: NotificationRule[] = [
  {
    event: 'workout.published',
    category: 'TRAINING',
    recipients: 'student',
    channels: ['IN_APP', 'PUSH'],
    deepLink: () => deepLinks.todayWorkout(),
  },
  {
    event: 'workout.updated',
    category: 'TRAINING',
    recipients: 'student',
    channels: ['IN_APP', 'PUSH'],
    group: { key: (e) => `workout.updated:${p(e, 'programId')}`, windowSeconds: 900 },
    deepLink: () => deepLinks.todayWorkout(),
  },
  {
    event: 'training.reminder',
    category: 'TRAINING',
    recipients: 'user',
    channels: ['PUSH'],
    immediate: true,
    deepLink: () => deepLinks.todayWorkout(),
  },
  {
    event: 'feedback.critical',
    category: 'TRAINING',
    recipients: 'tenant_staff',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    immediate: true,
    deepLink: (e) => deepLinks.feedback(p(e, 'sessionId')),
  },
  {
    event: 'record.achieved',
    category: 'TRAINING',
    recipients: 'user',
    channels: ['IN_APP'],
    deepLink: () => deepLinks.records(),
  },
  {
    event: 'student.inactive',
    category: 'TRAINING',
    recipients: 'tenant_staff',
    channels: ['IN_APP', 'PUSH'],
    deepLink: (e) => deepLinks.student(p(e, 'studentLinkId')),
  },
  {
    event: 'assessment.due',
    category: 'TRAINING',
    recipients: 'tenant_staff',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: (e) => deepLinks.studentTab(p(e, 'studentLinkId'), 'avaliacoes'),
  },
  {
    event: 'anamnesis.requested',
    category: 'SYSTEM',
    recipients: 'student',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    deepLink: (e) => deepLinks.anamnesis(p(e, 'responseId')),
  },
  {
    event: 'anamnesis.answered',
    category: 'SYSTEM',
    recipients: 'tenant_staff',
    channels: ['IN_APP'],
    deepLink: (e) => deepLinks.studentTab(p(e, 'studentLinkId'), 'anamnese'),
  },
  {
    event: 'anamnesis.risk',
    category: 'SYSTEM',
    recipients: 'tenant_staff',
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    immediate: true,
    deepLink: (e) => deepLinks.studentTab(p(e, 'studentLinkId'), 'anamnese'),
  },
  {
    event: 'birthday.upcoming',
    category: 'SYSTEM',
    recipients: 'tenant_staff',
    channels: ['IN_APP'],
    deepLink: (e) => deepLinks.student(p(e, 'studentLinkId')),
  },
  {
    event: 'birthday.today',
    category: 'SYSTEM',
    recipients: 'users',
    channels: ['IN_APP', 'PUSH'],
    deepLink: (e) => deepLinks.student(p(e, 'studentLinkId')),
  },
  {
    event: 'plan.limit_warning',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.subscription(),
  },
  {
    event: 'plan.limit_reached',
    category: 'SYSTEM',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL'],
    deepLink: () => deepLinks.subscription(),
  },
  {
    event: 'subscription.trial_ends_today',
    category: 'FINANCE',
    recipients: 'tenant_owner',
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    deepLink: () => deepLinks.subscription(),
  },
  {
    event: 'personal.registered',
    category: 'SYSTEM',
    recipients: 'platform_admins',
    channels: ['EMAIL'],
    deepLink: (e) => deepLinks.adminTenant(String(e.tenantId)),
  },
];
