import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from './base.mjs';

export default tseslint.config(...base, {
  files: ['**/*.{ts,tsx}'],
  plugins: { react, 'react-hooks': reactHooks },
  languageOptions: { globals: { ...globals.browser } },
  settings: { react: { version: 'detect' } },
  rules: {
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
    ...reactHooks.configs.recommended.rules,
    'react/prop-types': 'off',
  },
});
