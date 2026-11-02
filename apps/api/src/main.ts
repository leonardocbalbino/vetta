import './instrument';
import { createApp } from './bootstrap';
import { loadApiEnv } from './config/env';

async function main() {
  const env = loadApiEnv();
  const app = await createApp(env);
  await app.listen(env.PORT, '0.0.0.0');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
