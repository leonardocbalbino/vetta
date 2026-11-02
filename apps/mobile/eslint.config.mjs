import react from '@vetta/config/eslint/react';

export default [
  ...react,
  // Scripts de Node (imagens da loja rodam no navegador do Playwright), fora do app.
  { ignores: ['store/**'] },
];
