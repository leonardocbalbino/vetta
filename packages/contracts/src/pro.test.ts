import { describe, expect, it } from 'vitest';
import {
  AnamnesisTemplateInputSchema,
  ConsultingPlanInputSchema,
  isValidCpfCnpj,
  PublicCheckoutSchema,
  validateAnswers,
  visibleQuestions,
  type AnamnesisQuestion,
} from './pro.js';

describe('CPF/CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpfCnpj('529.982.247-25')).toBe(true);
    expect(isValidCpfCnpj('529.982.247-24')).toBe(false);
    expect(isValidCpfCnpj('111.111.111-11')).toBe(false);
    expect(isValidCpfCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCpfCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCpfCnpj('00000000000000')).toBe(false);
    expect(isValidCpfCnpj('123')).toBe(false);
  });
});

describe('anamnese com condicionais', () => {
  const qs: AnamnesisQuestion[] = [
    { id: 'lesao', type: 'yes_no', label: 'Tem lesão?', required: true },
    {
      id: 'onde',
      type: 'text',
      label: 'Onde?',
      required: true,
      showIf: { questionId: 'lesao', equals: true },
    },
    {
      id: 'dor',
      type: 'scale',
      label: 'Dor',
      min: 0,
      max: 10,
      showIf: { questionId: 'onde', equals: 'joelho' },
    },
    { id: 'dias', type: 'multi_choice', label: 'Dias', options: ['seg', 'ter'] },
    { id: 'nasc', type: 'date', label: 'Nascimento' },
    { id: 'obj', type: 'single_choice', label: 'Objetivo', options: ['hipertrofia', 'emagrecer'] },
    { id: 'exame', type: 'upload', label: 'Exame' },
    {
      id: 'sexo_fem',
      type: 'multi_choice',
      label: 'x',
      options: ['a'],
      showIf: { questionId: 'dias', equals: 'seg' },
    },
  ];

  it('esconde perguntas cuja condição não bate (em cadeia)', () => {
    expect(visibleQuestions(qs, { lesao: false }).map((q) => q.id)).not.toContain('onde');
    expect(visibleQuestions(qs, { lesao: true, onde: 'ombro' }).map((q) => q.id)).toContain('onde');
    expect(visibleQuestions(qs, { lesao: true, onde: 'joelho' }).map((q) => q.id)).toContain('dor');
    expect(visibleQuestions(qs, { lesao: false, onde: 'joelho' }).map((q) => q.id)).not.toContain(
      'dor',
    );
    expect(visibleQuestions(qs, { dias: ['seg'] }).map((q) => q.id)).toContain('sexo_fem');
  });

  it('obrigatória só quando visível; valida tipos e limites', () => {
    expect(validateAnswers(qs, { lesao: false })).toEqual({});
    expect(validateAnswers(qs, { lesao: true })).toEqual({ onde: 'Resposta obrigatória.' });
    expect(validateAnswers(qs, {})).toEqual({ lesao: 'Resposta obrigatória.' });
    expect(
      validateAnswers(qs, {
        lesao: 'talvez',
        dias: ['dom'],
        nasc: '01/01/1990',
        obj: 'força',
        exame: 'arquivo.pdf',
      }),
    ).toEqual({
      lesao: 'Responda sim ou não.',
      dias: 'Opção inválida.',
      nasc: 'Data inválida.',
      obj: 'Opção inválida.',
      exame: 'Envie o arquivo.',
    });
    expect(validateAnswers(qs, { lesao: true, onde: 'joelho', dor: 11 }).dor).toMatch(
      /entre 0 e 10/,
    );
    expect(validateAnswers(qs, { lesao: true, onde: 'joelho', dor: '5' }).dor).toBe(
      'Informe um número.',
    );
  });

  it('construtor rejeita ids repetidos, condição para frente e escolha sem opções', () => {
    const r = AnamnesisTemplateInputSchema.safeParse({
      name: 'Teste',
      questions: [
        { id: 'a', type: 'text', label: 'Pergunta A', showIf: { questionId: 'b', equals: 'x' } },
        { id: 'a', type: 'single_choice', label: 'Pergunta B' },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual([
      'A condição precisa apontar para uma pergunta anterior.',
      'Pergunta repetida: a',
      'Inclua as opções.',
    ]);
  });
});

describe('planos e checkout', () => {
  const plan = {
    name: 'Consultoria',
    priceCents: 15000,
    cycle: 'QUARTERLY',
    paymentMode: 'INSTALLMENTS',
    maxInstallments: 3,
    methods: ['PIX'],
  };
  it('parcelado exige cartão; parcelas só no parcelado', () => {
    expect(ConsultingPlanInputSchema.safeParse(plan).success).toBe(false);
    expect(ConsultingPlanInputSchema.safeParse({ ...plan, methods: ['CREDIT_CARD'] }).success).toBe(
      true,
    );
    expect(
      ConsultingPlanInputSchema.safeParse({ ...plan, paymentMode: 'RECURRING', methods: ['PIX'] })
        .success,
    ).toBe(false);
  });

  it('checkout com cartão exige os dados do cartão', () => {
    const base = {
      consultingPlanId: '0190f1e2-0000-7000-8000-000000000000',
      name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '11999998888',
      cpfCnpj: '52998224725',
      method: 'CREDIT_CARD',
      acceptTerms: true,
    };
    expect(PublicCheckoutSchema.safeParse(base).success).toBe(false);
    expect(PublicCheckoutSchema.safeParse({ ...base, method: 'PIX' }).success).toBe(true);
  });
});
