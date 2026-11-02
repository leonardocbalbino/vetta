import { writeFileSync } from 'node:fs';
import { buildTailwindCss, buildTokensCss } from '../dist/index.js';

writeFileSync(new URL('../dist/tokens.css', import.meta.url), buildTokensCss());
writeFileSync(new URL('../dist/tailwind.css', import.meta.url), buildTailwindCss());
