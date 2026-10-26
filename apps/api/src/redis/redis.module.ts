import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

const logger = new Logger('RedisClient');

const SAFE_REDIS_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'NR_CLOSED',
  'CONNECTION_BROKEN',
  'UNCERTAIN_STATE',
]);

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const url =
          configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        const client = new Redis(url, {
          lazyConnect: true,
          connectTimeout: 2000,
          commandTimeout: 1500,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });

        // Neutraliza excepciones no controladas de EventEmitter y registra fallos sanitizados
        client.on('error', (err: unknown) => {
          const rawCode = (err as { code?: unknown })?.code;
          const errorCode =
            typeof rawCode === 'string' && SAFE_REDIS_ERROR_CODES.has(rawCode)
              ? rawCode
              : 'REDIS_ERROR';
          const errorType = err instanceof Error ? 'Error' : 'UnknownError';

          logger.error({
            message: 'Evento de error en conexión o comando de Redis',
            errorType,
            errorCode,
          });
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.redis.quit(),
          new Promise<void>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('Redis quit timeout')),
              1000,
            );
            timeoutId.unref?.();
          }),
        ]);
      } catch {
        this.redis.disconnect();
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
  }
}
