import type { NextConfig } from 'next';

/** Landing estática (SSG). Páginas de venda /p/[slug] chegam com o módulo M12. */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
