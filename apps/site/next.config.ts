import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

/** Landing SSG com ISR (preços e documentos legais vêm da API) e blog em MDX. */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  pageExtensions: ['ts', 'tsx', 'mdx'],
};

export default createMDX({})(config);
