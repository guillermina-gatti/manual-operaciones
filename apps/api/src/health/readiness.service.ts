import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export const READINESS_TIMEOUT_MS = 1_000;

export type DependencyStatus = 'up' | 'down' | 'timeout';

export interface ReadinessResult {
  status: 'ok' | 'unavailable';
  checks: {
    postgresql: DependencyStatus;
    redis: DependencyStatus;
  };
}

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<ReadinessResult> {
    const [postgresql, redis] = await Promise.all([
      this.withTimeout(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.withTimeout(async () => {
        await this.redis.ping();
      }),
    ]);

    return {
      status: postgresql === 'up' && redis === 'up' ? 'ok' : 'unavailable',
      checks: { postgresql, redis },
    };
  }

  private async withTimeout(
    operation: () => Promise<void>,
  ): Promise<DependencyStatus> {
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        Promise.resolve()
          .then(operation)
          .then(
            (): DependencyStatus => 'up',
            (): DependencyStatus => 'down',
          ),
        new Promise<DependencyStatus>((resolve) => {
          timeoutId = setTimeout(
            () => resolve('timeout'),
            READINESS_TIMEOUT_MS,
          );
          timeoutId.unref?.();
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
