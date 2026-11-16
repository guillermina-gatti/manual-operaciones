import { PrismaService } from '../../prisma/prisma.service';
import { PrismaProcessingRepository } from './prisma-processing.repository';

const VERSION_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('PrismaProcessingRepository (unit)', () => {
  it('claimForProcessing adquiere el claim cuando el UPDATE devuelve la versión', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          id: VERSION_ID,
          documentId: DOC_ID,
          storageKey: 'documents/d/v.pdf',
          mimeType: 'application/pdf',
          processingStatus: 'PROCESSING',
        },
      ]),
    } as unknown as PrismaService;
    const repo = new PrismaProcessingRepository(prisma);

    const res = await repo.claimForProcessing(VERSION_ID, 180);

    expect(res.acquired).toBe(true);
    if (res.acquired) {
      expect(res.claimToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.version.processingStatus).toBe('PROCESSING');
    }
  });

  it('claimForProcessing distingue already_ready, already_claimed, failed y not_found', async () => {
    const mockCase = async (
      status: 'READY' | 'PROCESSING' | 'FAILED' | null,
    ) => {
      const prisma = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(
            status
              ? [
                  {
                    id: VERSION_ID,
                    documentId: DOC_ID,
                    storageKey: 'k',
                    mimeType: 'application/pdf',
                    processingStatus: status,
                  },
                ]
              : [],
          ),
      } as unknown as PrismaService;
      const repo = new PrismaProcessingRepository(prisma);
      return repo.claimForProcessing(VERSION_ID);
    };

    expect(await mockCase('READY')).toEqual({ acquired: false, reason: 'already_ready' });
    expect(await mockCase('PROCESSING')).toEqual({ acquired: false, reason: 'already_claimed' });
    expect(await mockCase('FAILED')).toEqual({ acquired: false, reason: 'failed' });
    expect(await mockCase(null)).toEqual({ acquired: false, reason: 'not_found' });
  });

  it('renewLease, releaseClaim y markFailed con token devuelven boolean según filas afectadas', async () => {
    const prisma = {
      $executeRaw: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    } as unknown as PrismaService;
    const repo = new PrismaProcessingRepository(prisma);

    expect(await repo.renewLease(VERSION_ID, TOKEN_A, 180)).toBe(true);
    expect(await repo.renewLease(VERSION_ID, TOKEN_A, 180)).toBe(false);
    expect(await repo.releaseClaim(VERSION_ID, TOKEN_A)).toBe(true);
    expect(await repo.markFailed(VERSION_ID, 'error', TOKEN_A)).toBe(false);
  });

  it('isClaimValid devuelve true solo cuando PostgreSQL confirma fila vigente', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ valid: 1 }])
        .mockResolvedValueOnce([]),
    } as unknown as PrismaService;
    const repo = new PrismaProcessingRepository(prisma);

    expect(await repo.isClaimValid(VERSION_ID, TOKEN_A)).toBe(true);
    expect(await repo.isClaimValid(VERSION_ID, TOKEN_A)).toBe(false);
  });

  it('commitLocked con claimToken inválido retorna stale sin tocar chunks', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ documentId: DOC_ID }])
        .mockResolvedValueOnce([{ id: DOC_ID }])
        .mockResolvedValueOnce([
          {
            status: 'CURRENT',
            processingStatus: 'PROCESSING',
            claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            leaseValid: true,
          },
        ]),
      $executeRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const repo = new PrismaProcessingRepository(prisma);
    const plan = jest.fn();

    const outcome = await repo.commitLocked(VERSION_ID, plan, TOKEN_A);

    expect(outcome).toBe('stale');
    expect(plan).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('prepareReconciliation devuelve locked_by_other si otro reconciliador tiene el advisory lock', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ acquired: false }]),
      $executeRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const repo = new PrismaProcessingRepository(prisma);

    const res = await repo.prepareReconciliation(VERSION_ID, 120);

    expect(res).toEqual({ action: 'locked_by_other' });
  });

  it('prepareReconciliation transiciona PROCESSING vencido a PENDING y libera el lock sin llamar a Redis', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([
          { processingStatus: 'PROCESSING', pendingExpired: true, leaseExpired: true },
        ]),
      $executeRaw: jest.fn().mockResolvedValueOnce(1),
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const repo = new PrismaProcessingRepository(prisma);

    const res = await repo.prepareReconciliation(VERSION_ID, 120);

    expect(res).toEqual({ action: 'enqueue', previousStatus: 'PROCESSING' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
