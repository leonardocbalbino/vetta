/** Seed seguro para produção: catálogo de features, planos iniciais, templates e conteúdo global. */
import './env';
import { createPrismaClient } from '../client';
import { syncCatalog } from '../catalog';
import { syncGlobalContent } from '../catalog-content';
import { syncNotificationTemplates } from '../catalog-templates';

async function main() {
  const db = createPrismaClient();
  try {
    const c = await syncCatalog(db);
    const t = await syncNotificationTemplates(db);
    await syncGlobalContent(db);
    console.warn(
      `Catálogo sincronizado: ${c.features} features, ${c.plans} planos novos, ${t} templates novos.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
