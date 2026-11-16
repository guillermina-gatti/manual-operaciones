import { LeaseHeartbeat } from './processing-heartbeat';

describe('LeaseHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renueva el lease periódicamente mientras el claim sigue vigente', async () => {
    const renewLease = jest.fn().mockResolvedValue(true);
    const heartbeat = new LeaseHeartbeat(
      { renewLease },
      'ver-1',
      'token-1',
      { intervalMs: 50, leaseTtlSeconds: 180 },
    );

    heartbeat.start();
    await jest.advanceTimersByTimeAsync(110);

    expect(renewLease).toHaveBeenCalledTimes(2);
    expect(renewLease).toHaveBeenCalledWith('ver-1', 'token-1', 180);
    expect(heartbeat.signal.aborted).toBe(false);

    await heartbeat.stop();
  });

  it('aborta la señal si renewLease devuelve false (claim perdido)', async () => {
    const renewLease = jest.fn().mockResolvedValue(false);
    const heartbeat = new LeaseHeartbeat(
      { renewLease },
      'ver-1',
      'token-1',
      { intervalMs: 50 },
    );

    heartbeat.start();
    await jest.advanceTimersByTimeAsync(60);

    expect(heartbeat.signal.aborted).toBe(true);
    await heartbeat.stop();
  });

  it('aborta la señal si PostgreSQL falla al renovar el lease', async () => {
    const renewLease = jest.fn().mockRejectedValue(new Error('DB connection lost'));
    const heartbeat = new LeaseHeartbeat(
      { renewLease },
      'ver-1',
      'token-1',
      { intervalMs: 50 },
    );

    heartbeat.start();
    await jest.advanceTimersByTimeAsync(60);

    expect(heartbeat.signal.aborted).toBe(true);
    await heartbeat.stop();
  });

  it('evita solapamientos si una renovación tarda más que el intervalo', async () => {
    let resolvePending!: (value: boolean) => void;
    const renewLease = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePending = resolve;
        }),
    );
    const heartbeat = new LeaseHeartbeat(
      { renewLease },
      'ver-1',
      'token-1',
      { intervalMs: 50 },
    );

    heartbeat.start();
    await jest.advanceTimersByTimeAsync(160);

    expect(renewLease).toHaveBeenCalledTimes(1);

    resolvePending(true);
    await heartbeat.stop();
  });

  it('stop cancela el timer y no vuelve a invocar renewLease', async () => {
    const renewLease = jest.fn().mockResolvedValue(true);
    const heartbeat = new LeaseHeartbeat(
      { renewLease },
      'ver-1',
      'token-1',
      { intervalMs: 50 },
    );

    heartbeat.start();
    await heartbeat.stop();
    await jest.advanceTimersByTimeAsync(200);

    expect(renewLease).not.toHaveBeenCalled();
  });
});
