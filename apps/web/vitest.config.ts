import { configDefaults, defineConfig } from 'vitest/config';

/** Unit tests da web; e2e/ é do Playwright (pnpm test:e2e). */
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
