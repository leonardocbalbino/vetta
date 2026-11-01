/**
 * Seed de DESENVOLVIMENTO: 1 super admin, 3 personais (um por plano) e 10 alunos,
 * com treinos, avaliações e pagamentos de exemplo. Nunca rode em produção.
 * Em produção use `pnpm --filter @vetta/db seed:catalog` (só catálogo e conteúdo global).
 */
import './env';
import { hash } from 'argon2';
import { createPrismaClient } from '../client';
import { syncCatalog } from '../catalog';
import { syncGlobalContent } from '../catalog-content';
import { syncNotificationTemplates } from '../catalog-templates';
import { createTenantWorld } from '../fixtures';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Vetta@2026dev';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SEED !== 'true') {
    throw new Error('Seed de desenvolvimento bloqueado em produção.');
  }
  const db = createPrismaClient();
  try {
    const already = await db.adminUser.findUnique({ where: { email: 'admin@vettafit.dev' } });
    const catalog = await syncCatalog(db);
    const templates = await syncNotificationTemplates(db);
    await syncGlobalContent(db);
    console.warn(
      `Catálogo: ${catalog.features} features, ${catalog.plans} planos novos, ${templates} templates novos.`,
    );

    if (already) {
      console.warn('Dados de desenvolvimento já existem. Use `pnpm db:reset` para recriar.');
      return;
    }

    const passwordHash = await hash(PASSWORD);
    await db.adminUser.create({
      data: { email: 'admin@vettafit.dev', name: 'Admin Vetta', passwordHash, role: 'SUPER_ADMIN' },
    });

    const student = (n: number) => ({
      name: `Aluno ${String(n).padStart(2, '0')}`,
      email: `aluno${String(n).padStart(2, '0')}@vettafit.dev`,
    });

    await createTenantWorld(db, {
      slug: 'ana-free',
      ownerName: 'Ana Souza',
      ownerEmail: 'free@vettafit.dev',
      businessName: 'Ana Souza Personal',
      plan: 'FREE',
      passwordHash,
      students: [student(1), student(2)],
    });
    await createTenantWorld(db, {
      slug: 'bruno-pro',
      ownerName: 'Bruno Lima',
      ownerEmail: 'pro@vettafit.dev',
      businessName: 'Bruno Lima Treinamento',
      plan: 'PRO',
      passwordHash,
      students: [student(3), student(4), student(5), student(6)],
    });
    const plus = await createTenantWorld(db, {
      slug: 'carla-proplus',
      ownerName: 'Carla Mendes',
      ownerEmail: 'proplus@vettafit.dev',
      businessName: 'Studio Carla Mendes',
      plan: 'PRO_PLUS',
      passwordHash,
      // aluno01 também é aluno da Carla: demonstra o seletor de vínculo
      students: [student(7), student(8), student(9), student(10), student(1)],
    });

    // Assistente da Carla (Pro Plus), responsável por 2 alunos
    const assistant = await db.user.create({
      data: {
        email: 'assistente@vettafit.dev',
        name: 'Diego Assistente',
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const member = await db.tenantMember.create({
      data: { tenantId: plus.tenantId, userId: assistant.id, role: 'ASSISTANT' },
    });
    await db.studentLink.updateMany({
      where: { id: { in: plus.studentLinkIds.slice(0, 2) } },
      data: { assistantMemberId: member.id },
    });

    console.warn(`Seed concluído. Senha de todos os usuários: ${PASSWORD}`);
    console.warn(
      'Admin: admin@vettafit.dev | Personais: free@, pro@, proplus@vettafit.dev | Alunos: aluno01..10@vettafit.dev',
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
