import base from '@vetta/config/eslint/base';

export default [
  ...base,
  {
    // NestJS lê os tipos dos parâmetros via emitDecoratorMetadata: injetáveis e DTOs
    // precisam ser imports de valor, então `import type` quebraria a injeção.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
