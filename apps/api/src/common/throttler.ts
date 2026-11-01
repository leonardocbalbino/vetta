import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import type { AppRequest } from './request';

/** Armazena contadores do rate limit no Redis (vale para várias instâncias da API). */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const k = `thr:${throttlerName}:${key}`;
    const blockKey = `${k}:blocked`;
    const blockedTtl = await this.redis.pttl(blockKey);
    if (blockedTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(blockedTtl / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockedTtl / 1000),
      };
    }
    const hits = await this.redis.incr(k);
    if (hits === 1) await this.redis.pexpire(k, ttl);
    const pttl = Math.max(0, await this.redis.pttl(k));
    const isBlocked = hits > limit;
    if (isBlocked && blockDuration > 0) await this.redis.set(blockKey, '1', 'PX', blockDuration);
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(pttl / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil((blockDuration || pttl) / 1000) : 0,
    };
  }
}

/** Rate limit por usuário autenticado; por IP quando anônimo. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as AppRequest;
    const p = r.principal;
    if (p) return p.kind === 'user' ? `u:${p.userId}` : `a:${p.adminId}`;
    return `ip:${r.ip ?? 'unknown'}`;
  }

  protected override async shouldSkip(ctx: ExecutionContext): Promise<boolean> {
    return ctx.getType() !== 'http';
  }
}
