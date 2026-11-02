import { Injectable } from '@nestjs/common';
import type { AuthTokenType, Prisma } from '@vetta/db';
import { randomToken, sha256 } from '@vetta/server';
import { badRequest } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';

/** Tokens de uso único (verificação de e-mail, reset, magic link, convite, desafio 2FA). */
@Injectable()
export class OneTimeTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    type: AuthTokenType,
    ttlMs: number,
    data: {
      userId?: string;
      adminUserId?: string;
      tenantId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.system.authToken.create({
      data: {
        type,
        tokenHash: sha256(token),
        expiresAt,
        userId: data.userId ?? null,
        adminUserId: data.adminUserId ?? null,
        tenantId: data.tenantId ?? null,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return { token, expiresAt };
  }

  /** Lê sem consumir (ex.: prévia do convite). */
  async peek(token: string, type: AuthTokenType) {
    const t = await this.prisma.system.authToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!t || t.type !== type || t.usedAt || t.expiresAt <= new Date()) {
      throw badRequest('Link inválido ou expirado.', 'TOKEN_INVALID');
    }
    return t;
  }

  /** Consome de forma atômica: dois usos simultâneos não passam. */
  async consume(token: string, type: AuthTokenType) {
    const tokenHash = sha256(token);
    const claimed = await this.prisma.system.authToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw badRequest('Link inválido ou expirado.', 'TOKEN_INVALID');
    return this.prisma.system.authToken.findUniqueOrThrow({ where: { tokenHash } });
  }

  /** Invalida tokens pendentes do mesmo tipo (ex.: novo pedido de reset). */
  async invalidatePending(userId: string, type: AuthTokenType) {
    await this.prisma.system.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
