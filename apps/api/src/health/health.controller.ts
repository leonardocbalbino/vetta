import { Controller, Get, HttpStatus, Inject, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { StorageProvider } from '@vetta/server';
import type { Response } from 'express';
import { Redis } from 'ioredis';
import { Public } from '../access/decorators';
import { REDIS, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

async function check(
  fn: () => Promise<unknown>,
  timeoutMs = 3000,
): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: (err as Error).message };
  }
}

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  /** Checagem de banco, Redis e storage. 503 se algum falhar. */
  @Public()
  @Get()
  async health(@Res() res: Response) {
    const [database, redis, storage] = await Promise.all([
      check(() => this.prisma.system.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
      check(() => this.storage.head('__healthcheck__')),
    ]);
    const ok = database.ok && redis.ok && storage.ok;
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: ok ? 'ok' : 'degraded',
      checks: { database, redis, storage },
      uptime: Math.round(process.uptime()),
    });
  }
}
