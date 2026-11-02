import { describe, expect, it } from 'vitest';
import { FEATURES_BY_KEY, PLAN_SEED } from './features.js';
import {
  ASSISTANT_PERMISSION_BY_RESOURCE,
  CustomDomainSchema,
  SUPPORT_SLA_HOURS,
  supportPriorityFor,
  UpdateBrandSchema,
} from './pro-plus.js';

describe('suporte: prioridade e SLA pelo plano', () => {
  it('Pro Plus é sempre alta, urgente para erro e cobrança', () => {
    expect(supportPriorityFor('PRO_PLUS', 'bug')).toBe('URGENT');
    expect(supportPriorityFor('PRO_PLUS', 'billing')).toBe('URGENT');
    expect(supportPriorityFor('PRO_PLUS', 'other')).toBe('HIGH');
    expect(supportPriorityFor('PRO', 'bug')).toBe('HIGH');
    expect(supportPriorityFor('PRO', 'other')).toBe('NORMAL');
    expect(supportPriorityFor('FREE', 'bug')).toBe('LOW');
  });

  it('SLA diminui conforme o plano', () => {
    expect(SUPPORT_SLA_HOURS.PRO_PLUS.firstResponse).toBeLessThan(
      SUPPORT_SLA_HOURS.PRO.firstResponse,
    );
    expect(SUPPORT_SLA_HOURS.PRO.firstResponse).toBeLessThan(SUPPORT_SLA_HOURS.FREE.firstResponse);
  });
});

describe('domínio próprio', () => {
  it('normaliza URL e aceita subdomínio', () => {
    expect(CustomDomainSchema.parse({ domain: 'https://App.Studio.com.br/' }).domain).toBe(
      'app.studio.com.br',
    );
  });

  it.each([
    'localhost',
    'app.vettafit.com.br',
    'vettafit.com.br',
    'sem-ponto',
    '-x.com.br',
    'a..b.com',
  ])('recusa %s', (domain) => {
    expect(CustomDomainSchema.safeParse({ domain }).success).toBe(false);
  });
});

describe('equipe e marca', () => {
  it('chat exige permissão até para ler; treinos só na escrita', () => {
    expect(ASSISTANT_PERMISSION_BY_RESOURCE.chat).toEqual({ permission: 'chat', reads: true });
    expect(ASSISTANT_PERMISSION_BY_RESOURCE.workouts).toEqual({
      permission: 'prescribe',
      reads: false,
    });
    expect(ASSISTANT_PERMISSION_BY_RESOURCE.finance).toBeUndefined();
  });

  it('cores no formato #RRGGBB', () => {
    expect(UpdateBrandSchema.safeParse({ primaryColor: '#2F5BFF' }).success).toBe(true);
    expect(UpdateBrandSchema.safeParse({ primaryColor: 'blue' }).success).toBe(false);
  });

  it('cota de IA e saúde no seed dos planos', () => {
    const plan = (code: string) => PLAN_SEED.find((p) => p.code === code)!.features;
    expect(plan('PRO_PLUS')['workouts.ai_monthly']).toBe(200);
    expect(plan('PRO')['workouts.ai_monthly']).toBe(20);
    expect(plan('FREE')['workouts.ai_monthly']).toBeUndefined();
    expect(FEATURES_BY_KEY['workouts.ai_monthly']!.defaultValue).toBe(0);
    expect(plan('PRO_PLUS')['progress.health_integrations']).toBe(true);
  });
});
