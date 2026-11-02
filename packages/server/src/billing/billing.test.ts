import { describe, expect, it } from 'vitest';
import {
  addCycle,
  addMonths,
  couponAppliesToCycle,
  couponDiscount,
  couponProblem,
  daysBetween,
  graceEndsOn,
  localDate,
  monthlyEquivalent,
  platformFeeCents,
  prorate,
  reminderOffset,
  shouldBlockStudent,
  STUDENT_REMINDER_OFFSETS,
  PLATFORM_REMINDER_OFFSETS,
  type CouponRules,
} from './billing';

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe('ciclos', () => {
  it('soma meses mantendo o dia e limitando ao fim do mês', () => {
    expect(addMonths(d('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(d('2028-01-31'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(addCycle(d('2026-01-15'), 'QUARTERLY').toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(addCycle(d('2026-01-15'), 'ANNUAL', 2).toISOString().slice(0, 10)).toBe('2028-01-15');
    expect(addCycle(d('2026-08-31'), 'SEMIANNUAL').toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('data local no fuso do usuário', () => {
    // 01:30 UTC ainda é o dia anterior em São Paulo (UTC-3)
    expect(localDate(new Date('2026-03-10T01:30:00Z'), 'America/Sao_Paulo')).toBe('2026-03-09');
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
  });

  it('preço mensal equivalente', () => {
    expect(monthlyEquivalent(39900, 'ANNUAL')).toBe(3325);
  });
});

describe('pró-rata', () => {
  const base = {
    paidCents: 3990,
    periodStart: new Date('2026-03-01T00:00:00Z'),
    periodEnd: new Date('2026-03-31T00:00:00Z'),
    currentMonthlyCents: 3990,
  };

  it('upgrade no meio do período: crédito proporcional abate a primeira cobrança', () => {
    const p = prorate({
      ...base,
      now: new Date('2026-03-16T00:00:00Z'),
      newAmountCents: 7990,
      newMonthlyCents: 7990,
    });
    expect(p.kind).toBe('UPGRADE');
    expect(p.creditCents).toBe(1995); // metade de 39,90
    expect(p.chargeNowCents).toBe(5995);
    expect(p.leftoverCreditCents).toBe(0);
  });

  it('arredonda o crédito a favor do cliente', () => {
    const p = prorate({
      ...base,
      now: new Date('2026-03-11T00:00:00Z'),
      newAmountCents: 7990,
      newMonthlyCents: 7990,
    });
    expect(p.creditCents).toBe(2660); // 3990 * 20/30 = 2660
    const odd = prorate({
      ...base,
      paidCents: 1000,
      now: new Date('2026-03-21T00:00:00Z'),
      newAmountCents: 7990,
      newMonthlyCents: 7990,
    });
    expect(odd.creditCents).toBe(334); // 333,33 → 334
  });

  it('crédito maior que a nova cobrança vira saldo', () => {
    const p = prorate({
      ...base,
      paidCents: 39900,
      periodEnd: new Date('2027-03-01T00:00:00Z'),
      currentMonthlyCents: 3325,
      now: new Date('2026-03-02T00:00:00Z'),
      newAmountCents: 7990,
      newMonthlyCents: 7990,
    });
    expect(p.chargeNowCents).toBe(0);
    expect(p.leftoverCreditCents).toBeGreaterThan(30000);
  });

  it('downgrade e mesmo plano valem no fim do período, sem crédito', () => {
    const now = new Date('2026-03-16T00:00:00Z');
    const down = prorate({ ...base, now, newAmountCents: 0, newMonthlyCents: 0 });
    expect(down).toMatchObject({ kind: 'DOWNGRADE', creditCents: 0, effectiveAt: base.periodEnd });
    const same = prorate({
      ...base,
      now: new Date('2026-04-02T00:00:00Z'),
      newAmountCents: 3990,
      newMonthlyCents: 3990,
    });
    expect(same.kind).toBe('SAME');
    expect(same.effectiveAt.toISOString()).toBe('2026-04-02T00:00:00.000Z');
  });

  it('período já vencido ou sem duração: sem crédito', () => {
    const late = prorate({
      ...base,
      now: new Date('2026-04-10T00:00:00Z'),
      newAmountCents: 7990,
      newMonthlyCents: 7990,
    });
    expect(late.creditCents).toBe(0);
    const zero = prorate({
      ...base,
      periodEnd: base.periodStart,
      now: base.periodStart,
      newAmountCents: 7990,
      newMonthlyCents: 7990,
    });
    expect(zero.creditCents).toBe(0);
  });
});

describe('cupons', () => {
  const coupon: CouponRules = {
    discountType: 'PERCENT',
    percentOff: 20,
    amountOffCents: null,
    durationCycles: 3,
    maxRedemptions: 10,
    redemptionsCount: 0,
    planCodes: ['PRO'],
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validUntil: new Date('2026-12-31T00:00:00Z'),
    isActive: true,
  };
  const now = new Date('2026-06-01T00:00:00Z');

  it('valida estado, datas, usos e plano', () => {
    expect(couponProblem(coupon, 'PRO', now)).toBeNull();
    expect(couponProblem({ ...coupon, isActive: false }, 'PRO', now)).toBe('INACTIVE');
    expect(couponProblem(coupon, 'PRO', new Date('2025-12-01T00:00:00Z'))).toBe('NOT_STARTED');
    expect(couponProblem(coupon, 'PRO', new Date('2027-01-01T00:00:00Z'))).toBe('EXPIRED');
    expect(couponProblem({ ...coupon, redemptionsCount: 10 }, 'PRO', now)).toBe('EXHAUSTED');
    expect(couponProblem(coupon, 'PRO_PLUS', now)).toBe('WRONG_PLAN');
    expect(
      couponProblem(
        { ...coupon, planCodes: [], validFrom: null, validUntil: null, maxRedemptions: null },
        'PRO_PLUS',
        now,
      ),
    ).toBeNull();
  });

  it('desconto percentual e fixo, nunca maior que o valor', () => {
    expect(couponDiscount(coupon, 3990)).toBe(798);
    expect(
      couponDiscount({ discountType: 'FIXED', percentOff: null, amountOffCents: 1000 }, 3990),
    ).toBe(1000);
    expect(
      couponDiscount({ discountType: 'FIXED', percentOff: null, amountOffCents: 9000 }, 3990),
    ).toBe(3990);
    expect(
      couponDiscount({ discountType: 'PERCENT', percentOff: null, amountOffCents: null }, 3990),
    ).toBe(0);
    expect(
      couponDiscount({ discountType: 'FIXED', percentOff: null, amountOffCents: null }, 3990),
    ).toBe(0);
  });

  it('duração em ciclos', () => {
    expect(couponAppliesToCycle(coupon, 2)).toBe(true);
    expect(couponAppliesToCycle(coupon, 3)).toBe(false);
    expect(couponAppliesToCycle({ durationCycles: null }, 99)).toBe(true);
  });
});

describe('split e réguas', () => {
  it('taxa da plataforma em pontos-base', () => {
    expect(platformFeeCents(10000, 299)).toBe(299);
    expect(platformFeeCents(15990, 149)).toBe(238);
    expect(platformFeeCents(10000, -5)).toBe(0);
  });

  it('lembretes do aluno: D-3, D0, D+1 e D+5', () => {
    const due = '2026-03-10';
    const hits = [
      '2026-03-06',
      '2026-03-07',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-15',
    ].map((t) => reminderOffset(due, t, STUDENT_REMINDER_OFFSETS));
    expect(hits).toEqual([null, -3, 0, 1, null, 5]);
  });

  it('avisos da plataforma: D-7, D-1 e no dia; carência de 7 dias', () => {
    expect(reminderOffset('2026-03-10', '2026-03-03', PLATFORM_REMINDER_OFFSETS)).toBe(-7);
    expect(reminderOffset('2026-03-10', '2026-03-09', PLATFORM_REMINDER_OFFSETS)).toBe(-1);
    expect(graceEndsOn('2026-03-28')).toBe('2026-04-04');
  });

  it('bloqueio do aluno só depois da tolerância', () => {
    expect(shouldBlockStudent('2026-03-10', '2026-03-15', 5)).toBe(false);
    expect(shouldBlockStudent('2026-03-10', '2026-03-16', 5)).toBe(true);
  });
});
