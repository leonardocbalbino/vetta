import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  createPrismaClient,
  forPlatform,
  forTenant,
  type PlatformPrismaClient,
  type PrismaClient,
  type TenantPrismaClient,
} from '@vetta/db';
import { type ApiEnv, ENV } from '../config/env';

/**
 * Acesso ao banco:
 * - system: dono das tabelas (sem RLS) — só auth, jobs e checagens internas;
 * - tenant(id): RLS + injeção de tenant_id — todo acesso de usuário a dados de negócio;
 * - platform: papel vetta_platform — rotas do painel admin.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly system: PrismaClient;
  readonly platform: PlatformPrismaClient;
  private readonly tenants = new Map<string, TenantPrismaClient>();

  constructor(@Inject(ENV) env: ApiEnv) {
    this.system = createPrismaClient({ url: env.DATABASE_URL });
    this.platform = forPlatform(this.system);
  }

  tenant(tenantId: string): TenantPrismaClient {
    let c = this.tenants.get(tenantId);
    if (!c) {
      if (this.tenants.size > 1000) this.tenants.clear();
      c = forTenant(this.system, tenantId);
      this.tenants.set(tenantId, c);
    }
    return c;
  }

  async onModuleDestroy() {
    await this.system.$disconnect();
  }
}
