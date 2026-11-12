import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AREA_IDS } from '../documents/adapters/fixtures';
import { PrismaProcedureListRepository } from './prisma-procedure-list.repository';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

const { ventas, operaciones } = AREA_IDS;
const T0 = new Date('2026-11-01T10:00:00.000Z');

const versionRow = (versionNumber: number, status: string, overrides: Record<string, unknown> = {}) => ({
  id: `1b000000-0000-4000-8000-00000000000${versionNumber}`,
  versionNumber,
  status,
  title: `Cierre de caja v${versionNumber}`,
  description: null,
  _count: { steps: 3 },
  ...overrides,
});

const procedureRow = (id: string, versions: unknown[], areas: { areaId: string }[] = [{ areaId: ventas }]) => ({
  id,
  createdAt: T0,
  areas,
  versions,
});

describe('PrismaProcedureListRepository', () => {
  let prisma: { procedure: { findMany: jest.Mock; count: jest.Mock } };
  let repository: PrismaProcedureListRepository;

  beforeEach(() => {
    prisma = { procedure: { findMany: jest.fn(), count: jest.fn() } };
    repository = new PrismaProcedureListRepository(prisma as unknown as PrismaService);
  });

  it('R16: asks for the page newest first, with ties by id, and counts with the same filter', async () => {
    prisma.procedure.findMany.mockResolvedValue([]);
    prisma.procedure.count.mockResolvedValue(0);

    await repository.list({ role: 'EMPLOYEE', areaIds: [ventas] }, 2, 10);

    const where = {
      areas: { some: { areaId: { in: [ventas] } } },
      versions: { some: { status: 'PUBLISHED', steps: { some: {} } } },
    };
    expect(prisma.procedure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.procedure.count).toHaveBeenCalledWith({ where });
  });

  it('R13: an ADMIN is asked for with no filter', async () => {
    prisma.procedure.findMany.mockResolvedValue([]);
    prisma.procedure.count.mockResolvedValue(0);

    await repository.list({ role: 'ADMIN', areaIds: [] }, 1, 20);

    expect(prisma.procedure.count).toHaveBeenCalledWith({ where: {} });
  });

  it('P21: shows the current version and the areas, and says there is no open draft', async () => {
    prisma.procedure.findMany.mockResolvedValue([
      procedureRow('p1', [versionRow(1, 'SUPERSEDED'), versionRow(2, 'PUBLISHED')], [
        { areaId: ventas },
        { areaId: operaciones },
      ]),
    ]);
    prisma.procedure.count.mockResolvedValue(1);

    const page = await repository.list({ role: 'ADMIN', areaIds: [] }, 1, 20);

    expect(page.total).toBe(1);
    expect(page.data[0]).toEqual({
      id: 'p1',
      createdAt: T0,
      areaIds: [ventas, operaciones],
      hasOpenDraft: false,
      shown: {
        id: '1b000000-0000-4000-8000-000000000002',
        versionNumber: 2,
        status: 'PUBLISHED',
        title: 'Cierre de caja v2',
        description: null,
        stepCount: 3,
      },
    });
  });

  it('P21: with a draft next to the current version, it shows the current one and flags the draft', async () => {
    prisma.procedure.findMany.mockResolvedValue([
      procedureRow('p1', [versionRow(2, 'PUBLISHED'), versionRow(3, 'DRAFT')]),
    ]);
    prisma.procedure.count.mockResolvedValue(1);

    const [item] = (await repository.list({ role: 'ADMIN', areaIds: [] }, 1, 20)).data;

    expect(item.shown.versionNumber).toBe(2);
    expect(item.hasOpenDraft).toBe(true);
  });

  it('P24: a procedure that was never published shows its draft', async () => {
    prisma.procedure.findMany.mockResolvedValue([procedureRow('p1', [versionRow(1, 'DRAFT')])]);
    prisma.procedure.count.mockResolvedValue(1);

    const [item] = (await repository.list({ role: 'ADMIN', areaIds: [] }, 1, 20)).data;

    expect(item.shown).toMatchObject({ versionNumber: 1, status: 'DRAFT' });
    expect(item.hasOpenDraft).toBe(true);
  });

  it('only asks for the PUBLISHED and DRAFT versions, with the step count', async () => {
    prisma.procedure.findMany.mockResolvedValue([]);
    prisma.procedure.count.mockResolvedValue(0);

    await repository.list({ role: 'ADMIN', areaIds: [] }, 1, 20);

    const { include } = prisma.procedure.findMany.mock.calls[0][0] as {
      include: { versions: { where: unknown; select: Record<string, unknown> } };
    };
    expect(include.versions.where).toEqual({ status: { in: ['PUBLISHED', 'DRAFT'] } });
    expect(include.versions.select).toHaveProperty('_count');
  });

  it('a database that does not answer is a ProceduresRepositoryUnavailableError', async () => {
    const down = new Prisma.PrismaClientKnownRequestError('down', { code: 'P1001', clientVersion: '7.10.0' });
    prisma.procedure.findMany.mockRejectedValue(down);
    prisma.procedure.count.mockResolvedValue(0);

    await expect(repository.list({ role: 'ADMIN', areaIds: [] }, 1, 20)).rejects.toBeInstanceOf(
      ProceduresRepositoryUnavailableError,
    );
  });
});
