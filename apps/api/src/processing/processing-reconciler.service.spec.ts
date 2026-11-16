import { ProcessingReconcilerService, QueueJobHandle } from './processing-reconciler.service';
import { FakeProcessingRepository } from './testing/fakes';

class FakeQueueInspector {
  jobs = new Map<string, { state: string; removed: boolean }>();
  throwOnGetJob?: Error;

  async getJob(jobId: string): Promise<QueueJobHandle | undefined> {
    if (this.throwOnGetJob) throw this.throwOnGetJob;
    const entry = this.jobs.get(jobId);
    if (!entry) return undefined;
    return {
      getState: async () => entry.state,
      remove: async () => {
        entry.removed = true;
        this.jobs.delete(jobId);
      },
    };
  }
}

function makeReconciler(opts?: {
  repo?: FakeProcessingRepository;
  inspector?: FakeQueueInspector;
  enqueue?: jest.Mock;
  enabled?: boolean;
}) {
  const repo = opts?.repo ?? new FakeProcessingRepository();
  const inspector = opts?.inspector ?? new FakeQueueInspector();
  const enqueue = opts?.enqueue ?? jest.fn().mockResolvedValue(undefined);
  const logger = { log: jest.fn(), warn: jest.fn() };
  const service = new ProcessingReconcilerService(repo, { enqueue }, inspector, {
    enabled: opts?.enabled ?? true,
    pendingMinAgeSeconds: 120,
    intervalMs: 300_000,
    logger,
  });
  return { repo, inspector, enqueue, logger, service };
}

describe('ProcessingReconcilerService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('1. PENDING antiguo sin job en Redis se recupera', async () => {
    const { repo, enqueue, service } = makeReconciler();
    repo.versions.set('v-old', {
      id: 'v-old',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 180_000),
    });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
    expect(enqueue).toHaveBeenCalledWith('v-old');
  });

  it('2. PENDING reciente no se recupera', async () => {
    const { repo, enqueue, service } = makeReconciler();
    repo.versions.set('v-new', {
      id: 'v-new',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 30_000),
    });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 0, recovered: 0, skipped: 0, failed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each(['waiting', 'active', 'delayed'])(
    '3-5. PENDING con job %s en BullMQ no se duplica',
    async (state) => {
      const { repo, inspector, enqueue, service } = makeReconciler();
      repo.versions.set('v-1', {
        id: 'v-1',
        documentId: 'd1',
        storageKey: 'k',
        mimeType: 'application/pdf',
        processingStatus: 'PENDING',
        status: 'CURRENT',
        createdAt: new Date(Date.now() - 180_000),
      });
      inspector.jobs.set('v-1', { state, removed: false });

      const summary = await service.reconcileOnce();

      expect(summary).toEqual({ candidates: 1, recovered: 0, skipped: 1, failed: 0 });
      expect(enqueue).not.toHaveBeenCalled();
    },
  );

  it('6. PROCESSING con lease vigente y job ausente no se recupera', async () => {
    const { repo, enqueue, service } = makeReconciler();
    repo.versions.set('v-active', {
      id: 'v-active',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PROCESSING',
      status: 'CURRENT',
      claimToken: 'tok-1',
      processingStartedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 0, recovered: 0, skipped: 0, failed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(repo.versions.get('v-active')!.claimToken).toBe('tok-1');
  });

  it('7. PROCESSING con lease vencido transiciona a PENDING, limpia claim y reencola', async () => {
    const { repo, enqueue, service } = makeReconciler();
    repo.versions.set('v-exp', {
      id: 'v-exp',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PROCESSING',
      status: 'CURRENT',
      claimToken: 'tok-old',
      processingStartedAt: new Date(Date.now() - 200_000),
      leaseExpiresAt: new Date(Date.now() - 10_000),
    });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
    expect(enqueue).toHaveBeenCalledWith('v-exp');
    const stored = repo.versions.get('v-exp')!;
    expect(stored.processingStatus).toBe('PENDING');
    expect(stored.claimToken).toBeNull();
    expect(stored.leaseExpiresAt).toBeNull();
    expect(stored.processingStartedAt).toBeNull();
  });

  it('8. Lease renovado durante la inspección (entre listado y lock) no se recupera', async () => {
    const repo = new FakeProcessingRepository();
    repo.versions.set('v-ren', {
      id: 'v-ren',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PROCESSING',
      status: 'CURRENT',
      claimToken: 'tok-1',
      leaseExpiresAt: new Date(Date.now() - 1_000),
    });
    const origFind = repo.findPendingOrExpiredForReconciliation.bind(repo);
    jest
      .spyOn(repo, 'findPendingOrExpiredForReconciliation')
      .mockImplementation(async (minAge, limit) => {
        const res = await origFind(minAge, limit);
        // Worker renueva su lease justo antes de que reconcileVersionWithLock adquiera el lock
        repo.versions.get('v-ren')!.leaseExpiresAt = new Date(Date.now() + 180_000);
        return res;
      });
    const { enqueue, service } = makeReconciler({ repo });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 1, recovered: 0, skipped: 1, failed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('9. Dos reconciliadores concurrentes sobre la misma versión (locked_by_other): no duplican', async () => {
    const repo = new FakeProcessingRepository();
    repo.versions.set('v-conc', {
      id: 'v-conc',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 200_000),
    });

    const origPrepare = repo.prepareReconciliation.bind(repo);
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => {
      releaseFirst = r;
    });
    let firstCall = true;
    jest.spyOn(repo, 'prepareReconciliation').mockImplementation(async (id, minAge) => {
      if (firstCall) {
        firstCall = false;
        repo.activeReconcileLocks.add(id);
        await gate;
        repo.activeReconcileLocks.delete(id);
      }
      return origPrepare(id, minAge);
    });

    const enqueue1 = jest.fn().mockResolvedValue(undefined);
    const enqueue2 = jest.fn().mockResolvedValue(undefined);
    const r1 = makeReconciler({ repo, enqueue: enqueue1 }).service;
    const r2 = makeReconciler({ repo, enqueue: enqueue2 }).service;

    const p1 = r1.reconcileOnce();
    await Promise.resolve();
    const s2 = await r2.reconcileOnce();
    releaseFirst();
    const s1 = await p1;

    expect(s1.recovered).toBe(1);
    expect(s2.skipped).toBe(1);
    expect(s2.recovered).toBe(0);
    expect(enqueue2).not.toHaveBeenCalled();
  });

  it.each(['completed', 'failed'])(
    '15. PENDING con job residual %s: elimina el job anterior y reencola con el mismo ID',
    async (state) => {
      const { repo, inspector, enqueue, service } = makeReconciler();
      repo.versions.set('v-res', {
        id: 'v-res',
        documentId: 'd1',
        storageKey: 'k',
        mimeType: 'application/pdf',
        processingStatus: 'PENDING',
        status: 'CURRENT',
        createdAt: new Date(Date.now() - 180_000),
      });
      inspector.jobs.set('v-res', { state, removed: false });

      const summary = await service.reconcileOnce();

      expect(summary).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
      expect(inspector.jobs.has('v-res')).toBe(false);
      expect(enqueue).toHaveBeenCalledWith('v-res');
    },
  );

  it('16. Error al eliminar job residual: no encola, marca failed y el siguiente ciclo puede reintentar', async () => {
    const repo = new FakeProcessingRepository();
    repo.versions.set('v-rem-err', {
      id: 'v-rem-err',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 180_000),
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    let failRemove = true;
    const inspector = {
      getJob: jest.fn(async () => ({
        getState: async () => 'failed',
        remove: async () => {
          if (failRemove) throw new Error('Redis remove failed');
        },
      })),
    };
    const service = new ProcessingReconcilerService(repo, { enqueue }, inspector, {
      pendingMinAgeSeconds: 120,
    });

    const first = await service.reconcileOnce();
    expect(first).toEqual({ candidates: 1, recovered: 0, skipped: 0, failed: 1 });
    expect(enqueue).not.toHaveBeenCalled();

    failRemove = false;
    const second = await service.reconcileOnce();
    expect(second).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
    expect(enqueue).toHaveBeenCalledWith('v-rem-err');
  });

  it('17. Error al encolar tras eliminar job residual: siguiente ciclo encuentra job ausente y recupera', async () => {
    const enqueue = jest
      .fn()
      .mockRejectedValueOnce(new Error('Enqueue failed'))
      .mockResolvedValueOnce(undefined);
    const { repo, inspector, service } = makeReconciler({ enqueue });
    repo.versions.set('v-enq-err', {
      id: 'v-enq-err',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 180_000),
    });
    inspector.jobs.set('v-enq-err', { state: 'completed', removed: false });

    const first = await service.reconcileOnce();
    expect(first).toEqual({ candidates: 1, recovered: 0, skipped: 0, failed: 1 });
    expect(inspector.jobs.has('v-enq-err')).toBe(false);

    const second = await service.reconcileOnce();
    expect(second).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
  });

  it('18. Worker adquiere claim mientras el reconciliador termina: claim persistente impide duplicación', async () => {
    const repo = new FakeProcessingRepository();
    repo.versions.set('v-race', {
      id: 'v-race',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 180_000),
    });
    const enqueue = jest.fn(async (id: string) => {
      // Un Worker ya tomó el claim mientras el reconciliador encolaba tras liberar el lock
      const c1 = await repo.claimForProcessing(id, 180);
      expect(c1.acquired).toBe(true);
      // Un segundo Worker disparado por un job encolado concurrentemente no puede reclamarlo
      const c2 = await repo.claimForProcessing(id, 180);
      expect(c2).toEqual({ acquired: false, reason: 'already_claimed' });
    });
    const { service } = makeReconciler({ repo, enqueue });

    const summary = await service.reconcileOnce();
    expect(summary).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('10. Error de Redis no corrompe PostgreSQL y registra falla controlada', async () => {
    const { repo, inspector, logger, service } = makeReconciler();
    repo.versions.set('v-err', {
      id: 'v-err',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 180_000),
    });
    inspector.throwOnGetJob = new Error('redis://:secreto@redis:6379 ECONNREFUSED');

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 1, recovered: 0, skipped: 0, failed: 1 });
    expect(repo.versions.get('v-err')!.processingStatus).toBe('PENDING');
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn.mock.calls[0][0]).not.toContain('secreto');
  });

  it('11. Error de PostgreSQL al consultar candidatos no marca recuperaciones', async () => {
    const repo = new FakeProcessingRepository();
    jest
      .spyOn(repo, 'findPendingOrExpiredForReconciliation')
      .mockRejectedValue(new Error('PG timeout'));
    const { enqueue, logger, service } = makeReconciler({ repo });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 0, recovered: 0, skipped: 0, failed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('12. Crash lógico entre transición a PENDING y enqueue: siguiente ciclo recupera', async () => {
    const enqueue = jest
      .fn()
      .mockRejectedValueOnce(new Error('Redis crash'))
      .mockResolvedValueOnce(undefined);
    const { repo, service } = makeReconciler({ enqueue });
    repo.versions.set('v-crash', {
      id: 'v-crash',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PROCESSING',
      status: 'CURRENT',
      claimToken: 'tok-dead',
      createdAt: new Date(Date.now() - 200_000),
      leaseExpiresAt: new Date(Date.now() - 5_000),
    });

    const first = await service.reconcileOnce();
    expect(first).toEqual({ candidates: 1, recovered: 0, skipped: 0, failed: 1 });
    expect(repo.versions.get('v-crash')!.processingStatus).toBe('PENDING');

    const second = await service.reconcileOnce();
    expect(second).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('13. Job active residual con lease vencido en PostgreSQL: limpia claim y pasa a PENDING respetando PostgreSQL', async () => {
    const { repo, inspector, logger, service } = makeReconciler();
    repo.versions.set('v-stale-active', {
      id: 'v-stale-active',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PROCESSING',
      status: 'CURRENT',
      claimToken: 'tok-dead',
      leaseExpiresAt: new Date(Date.now() - 5_000),
    });
    inspector.jobs.set('v-stale-active', { state: 'active', removed: false });

    const summary = await service.reconcileOnce();

    expect(summary).toEqual({ candidates: 1, recovered: 0, skipped: 1, failed: 0 });
    expect(repo.versions.get('v-stale-active')!.processingStatus).toBe('PENDING');
    expect(repo.versions.get('v-stale-active')!.claimToken).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('14. Evita ejecuciones solapadas y onModuleDestroy detiene timers y espera el ciclo en curso', async () => {
    jest.useFakeTimers();
    const repo = new FakeProcessingRepository();
    repo.versions.set('v-slow', {
      id: 'v-slow',
      documentId: 'd1',
      storageKey: 'k',
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
      status: 'CURRENT',
      createdAt: new Date(Date.now() - 200_000),
    });
    let resolveEnqueue!: () => void;
    const enqueue = jest.fn(
      () =>
        new Promise<void>((r) => {
          resolveEnqueue = r;
        }),
    );
    const { service } = makeReconciler({ repo, enqueue });

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(1);
    expect(enqueue).toHaveBeenCalledTimes(1);

    // Segundo disparo solapado no debe iniciar un segundo ciclo
    const overlapped = await service.reconcileOnce();
    expect(overlapped).toEqual({ candidates: 0, recovered: 0, skipped: 0, failed: 0 });

    let destroyed = false;
    const destroyPromise = service.onModuleDestroy().then(() => {
      destroyed = true;
    });
    await Promise.resolve();
    expect(destroyed).toBe(false);

    resolveEnqueue();
    await destroyPromise;
    expect(destroyed).toBe(true);
  });
});
