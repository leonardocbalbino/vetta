import { Inject, Injectable } from '@nestjs/common';
import { randomToken, sha256 } from '@vetta/server';
import { Redis } from 'ioredis';
import { jwtVerify, SignJWT } from 'jose';
import { type ApiEnv, ENV } from '../config/env';
import { unauthorized } from '../common/errors';
import { REDIS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

export interface AccessClaims {
  sub: string;
  sid: string;
  typ: 'user' | 'admin';
  imp?: string;
}

const AUDIENCE = 'vetta';
const revokedKey = (sid: string) => `revoked:sid:${sid}`;

/**
 * JWT de acesso (HS256, 15 min) + refresh token opaco rotativo com detecção de reuso (ADR-004).
 */
@Injectable()
export class TokensService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async signAccess(
    claims: AccessClaims,
    maxTtlSeconds?: number,
  ): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = Math.max(
      1,
      Math.min(this.env.ACCESS_TOKEN_TTL_SECONDS, maxTtlSeconds ?? Infinity),
    );
    const token = await new SignJWT({
      sid: claims.sid,
      typ: claims.typ,
      ...(claims.imp ? { imp: claims.imp } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.secret);
    return { token, expiresIn };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.env.JWT_ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
        throw new Error('claims');
      if (await this.redis.exists(revokedKey(payload.sid))) throw new Error('revoked');
      return {
        sub: payload.sub,
        sid: payload.sid,
        typ: payload.typ === 'admin' ? 'admin' : 'user',
        ...(typeof payload.imp === 'string' ? { imp: payload.imp } : {}),
      };
    } catch {
      throw unauthorized('Sessão expirada. Entre novamente.', 'TOKEN_INVALID');
    }
  }

  /** Cria um refresh token para a sessão (retorna o valor em claro uma única vez). */
  async issueRefresh(sessionId: string, expiresAt: Date): Promise<string> {
    const token = randomToken(32);
    await this.prisma.system.refreshToken.create({
      data: { sessionId, tokenHash: sha256(token), expiresAt },
    });
    return token;
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  /** Bloqueia imediatamente os access tokens já emitidos para a sessão. */
  async markRevoked(sessionId: string) {
    await this.redis.set(revokedKey(sessionId), '1', 'EX', this.env.ACCESS_TOKEN_TTL_SECONDS + 60);
  }
}
