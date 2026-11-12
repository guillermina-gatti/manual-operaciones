import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { READINESS_TIMEOUT_MS, ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  const query = jest.fn();
  const ping = jest.fn();
  const service = new ReadinessService(
    { $queryRaw: query } as unknown as PrismaService,
    { ping } as unknown as Redis,
  );

  beforeEach(() => {
    query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    ping.mockReset().mockResolvedValue('PONG');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('informa ok cuando PostgreSQL y Redis responden', async () => {
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { postgresql: 'up', redis: 'up' },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('informa unavailable sin filtrar errores internos', async () => {
    query.mockRejectedValue(
      new Error('postgresql://usuario:secreto@db.interna/base'),
    );
    ping.mockRejectedValue(new Error('redis AUTH secreto-no-real'));

    const result = await service.check();

    expect(result).toEqual({
      status: 'unavailable',
      checks: { postgresql: 'down', redis: 'down' },
    });
    expect(JSON.stringify(result)).not.toContain('secreto');
    expect(JSON.stringify(result)).not.toContain('db.interna');
  });

  it('limita el tiempo de cada dependencia y distingue timeout', async () => {
    jest.useFakeTimers();
    query.mockReturnValue(new Promise(() => undefined));

    const resultPromise = service.check();
    await jest.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({
      status: 'unavailable',
      checks: { postgresql: 'timeout', redis: 'up' },
    });
  });
});
