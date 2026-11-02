import path from 'node:path';
import { config } from 'dotenv';

// Variáveis do ambiente têm prioridade; o .env da raiz é o fallback local.
config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
