import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
import reactConfig from './react.mjs';

export default tseslint.config(...reactConfig, {
  plugins: { '@next/next': next },
  rules: {
    ...next.configs.recommended.rules,
    ...next.configs['core-web-vitals'].rules,
  },
});
