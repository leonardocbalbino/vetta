import { describe, expect, it } from 'vitest';
import { FEATURE_CATALOG, PLAN_SEED, UNLIMITED } from './features.js';
import { can } from './permissions.js';

describe('can()', () => {
  it('personal gerencia tudo do tenant, mas nada da plataforma', () => {
    expect(can('PERSONAL', 'delete', 'students')).toBe('all');
    expect(can('PERSONAL', 'manage', 'finance')).toBe('all');
    expect(can('PERSONAL', 'read', 'platform.tenants')).toBe(false);
  });

  it('assistente só vê alunos atribuídos e não acessa financeiro, configurações ou assinatura', () => {
    expect(can('PERSONAL_ASSISTENTE', 'read', 'students')).toBe('assigned');
    expect(can('PERSONAL_ASSISTENTE', 'delete', 'students')).toBe(false);
    expect(can('PERSONAL_ASSISTENTE', 'read', 'finance')).toBe(false);
    expect(can('PERSONAL_ASSISTENTE', 'read', 'settings')).toBe(false);
    expect(can('PERSONAL_ASSISTENTE', 'read', 'subscription')).toBe(false);
  });

  it('aluno acessa só os próprios dados', () => {
    expect(can('ALUNO', 'read', 'workouts')).toBe('own');
    expect(can('ALUNO', 'create', 'workouts')).toBe(false);
    expect(can('ALUNO', 'read', 'students')).toBe(false);
  });

  it('operador não gerencia admins nem financeiro da plataforma', () => {
    expect(can('ADMIN_OPERADOR', 'read', 'platform.admins')).toBe('all');
    expect(can('ADMIN_OPERADOR', 'create', 'platform.admins')).toBe(false);
    expect(can('SUPER_ADMIN', 'create', 'platform.admins')).toBe('all');
    expect(can('SUPER_ADMIN', 'read', 'students')).toBe(false);
  });
});

describe('catálogo e seed de planos', () => {
  it('chaves únicas', () => {
    const keys = FEATURE_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('planos usam tipos coerentes com o catálogo', () => {
    const byKey = new Map(FEATURE_CATALOG.map((f) => [f.key, f]));
    for (const plan of PLAN_SEED) {
      for (const [key, value] of Object.entries(plan.features)) {
        const def = byKey.get(key as never);
        expect(def, key).toBeDefined();
        expect(typeof value).toBe(def!.type === 'BOOLEAN' ? 'boolean' : 'number');
      }
    }
  });

  it('planos superiores nunca têm menos que os inferiores', () => {
    const rank = (v: number | boolean | undefined) =>
      v === undefined || v === false ? 0 : v === true || v === UNLIMITED ? Infinity : v;
    for (let i = 1; i < PLAN_SEED.length; i++) {
      const lower = PLAN_SEED[i - 1]!;
      const upper = PLAN_SEED[i]!;
      for (const [key, value] of Object.entries(lower.features)) {
        if (key === 'finance.split_fee_bps') continue; // taxa menor é melhor
        expect(
          rank(upper.features[key as keyof typeof upper.features]),
          key,
        ).toBeGreaterThanOrEqual(rank(value));
      }
    }
  });
});
