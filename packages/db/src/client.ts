import { PrismaClient, type Prisma } from '../generated/client';

export interface CreateClientOptions {
  url?: string;
  log?: Prisma.LogLevel[];
}

/**
 * Cliente "de sistema": conecta como dono das tabelas e, portanto, não é
 * afetado pelo RLS. Use forTenant()/forPlatform() para acesso de usuários.
 */
export function createPrismaClient(options: CreateClientOptions = {}): PrismaClient {
  return new PrismaClient({
    ...(options.url ? { datasourceUrl: options.url } : {}),
    log: options.log ?? ['warn', 'error'],
  });
}
