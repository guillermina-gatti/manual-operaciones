/* The Prisma procedures repository against real PostgreSQL: locking, partial index and cascade */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { PrismaProceduresRepository } from '../../src/procedures/prisma-procedures.repository';
import {
  DraftAlreadyExistsError,
  NoPublishedVersionError,
} from '../../src/procedures/procedures.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanProcedures, seedProcedure } from './helpers';

const ADMIN = FIXTURE_USERS.admin.id;

describe('Procedures repository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaProceduresRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaProceduresRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanProcedures(prisma);
  });

  const newDraft = (procedureId: string) => ({
    procedureId,
    versionId: randomUUID(),
    createdById: ADMIN,
  });

  describe('create and findById', () => {
    it('E1: creates the procedure with its version 1 as a DRAFT, without steps or areas', async () => {
      const id = randomUUID();
      const versionId = randomUUID();

      const record = await repository.create({
        id,
        versionId,
        ownerId: ADMIN,
        title: 'Cierre de caja',
        description: 'Al final del turno',
      });

      expect(record).toMatchObject({ id, ownerId: ADMIN, areaIds: [] });
      expect(record.versions).toHaveLength(1);
      expect(record.versions[0]).toMatchObject({
        id: versionId,
        versionNumber: 1,
        status: 'DRAFT',
        title: 'Cierre de caja',
        description: 'Al final del turno',
        stepCount: 0,
      });
    });

    it('finds a procedure with its areas and the step count of each version', async () => {
      const seeded = await seedProcedure(prisma, {
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
        versions: [
          { versionNumber: 1, status: 'SUPERSEDED', stepTitles: ['A'] },
          {
            versionNumber: 2,
            status: 'PUBLISHED',
            stepTitles: ['A', 'B', 'C'],
          },
        ],
      });

      const record = await repository.findById(seeded.procedureId);

      expect([...(record?.areaIds ?? [])].sort()).toEqual(
        [AREA_IDS.ventas, AREA_IDS.operaciones].sort(),
      );
      expect(
        record?.versions.map((v) => [v.versionNumber, v.status, v.stepCount]),
      ).toEqual([
        [1, 'SUPERSEDED', 1],
        [2, 'PUBLISHED', 3],
      ]);
    });

    it('is null for a procedure that does not exist', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });
  });

  describe('createDraft', () => {
    it('E11: copies the current version into the next DRAFT with new step ids, and the published one keeps its steps', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [
          {
            versionNumber: 1,
            status: 'PUBLISHED',
            title: 'Cierre de caja',
            description: 'Al final del turno',
            stepTitles: ['Contar', 'Comparar', 'Guardar'],
          },
        ],
      });

      const draft = await repository.createDraft(newDraft(seeded.procedureId));

      expect(draft).toMatchObject({
        versionNumber: 2,
        status: 'DRAFT',
        title: 'Cierre de caja',
        description: 'Al final del turno',
        stepCount: 3,
      });
      const copied = await prisma.step.findMany({
        where: { procedureVersionId: draft?.id },
        orderBy: { stepOrder: 'asc' },
      });
      expect(copied.map((s) => [s.stepOrder, s.title])).toEqual([
        [1, 'Contar'],
        [2, 'Comparar'],
        [3, 'Guardar'],
      ]);
      expect(copied.map((s) => s.id)).not.toEqual(
        expect.arrayContaining(seeded.stepIds[0]),
      );
      const original = await prisma.step.findMany({
        where: { procedureVersionId: seeded.versionIds[0] },
        orderBy: { stepOrder: 'asc' },
      });
      expect(original.map((s) => s.id)).toEqual(seeded.stepIds[0]);
    });

    it('uses the number after the highest existing one', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [
          { versionNumber: 1, status: 'SUPERSEDED', stepTitles: ['A'] },
          { versionNumber: 2, status: 'PUBLISHED', stepTitles: ['A', 'B'] },
        ],
      });

      const draft = await repository.createDraft(newDraft(seeded.procedureId));

      expect(draft?.versionNumber).toBe(3);
      expect(draft?.stepCount).toBe(2);
    });

    it('E10: rejects a second draft with DraftAlreadyExistsError', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [
          { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A'] },
          { versionNumber: 2, status: 'DRAFT' },
        ],
      });

      await expect(
        repository.createDraft(newDraft(seeded.procedureId)),
      ).rejects.toBeInstanceOf(DraftAlreadyExistsError);
      await expect(prisma.procedureVersion.count()).resolves.toBe(2);
    });

    it('rejects with NoPublishedVersionError when the procedure was never published', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [{ versionNumber: 1, status: 'SUPERSEDED' }],
      });

      await expect(
        repository.createDraft(newDraft(seeded.procedureId)),
      ).rejects.toBeInstanceOf(NoPublishedVersionError);
    });

    it('is null for a procedure that does not exist', async () => {
      await expect(
        repository.createDraft(newDraft(randomUUID())),
      ).resolves.toBeNull();
    });

    it('E16: with two simultaneous requests, one creates the draft and the other fails', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [
          { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A'] },
        ],
      });

      const results = await Promise.allSettled([
        repository.createDraft(newDraft(seeded.procedureId)),
        repository.createDraft(newDraft(seeded.procedureId)),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected');
      expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(
        DraftAlreadyExistsError,
      );
      await expect(
        prisma.procedureVersion.count({
          where: { procedureId: seeded.procedureId, status: 'DRAFT' },
        }),
      ).resolves.toBe(1);
    });
  });

  describe('updateDraft', () => {
    it('E9: changes the title and leaves the description alone', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [
          {
            versionNumber: 1,
            status: 'DRAFT',
            title: 'Cierre',
            description: 'Desc',
          },
        ],
      });

      const result = await repository.updateDraft(
        seeded.procedureId,
        seeded.versionIds[0],
        { title: 'Cierre de caja' },
      );

      expect(result).toMatchObject({
        ok: true,
        value: { title: 'Cierre de caja', description: 'Desc' },
      });
    });

    it('E12: does not touch a PUBLISHED version', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [{ versionNumber: 1, status: 'PUBLISHED', title: 'Cierre' }],
      });

      await expect(
        repository.updateDraft(seeded.procedureId, seeded.versionIds[0], {
          title: 'Otro',
        }),
      ).resolves.toEqual({ ok: false, reason: 'NOT_A_DRAFT' });
      const row = await prisma.procedureVersion.findUnique({
        where: { id: seeded.versionIds[0] },
      });
      expect(row?.title).toBe('Cierre');
    });

    it('is NOT_FOUND for an unknown version and for a version of another procedure', async () => {
      const a = await seedProcedure(prisma, {
        versions: [{ versionNumber: 1, status: 'DRAFT' }],
      });
      const b = await seedProcedure(prisma, {
        versions: [{ versionNumber: 1, status: 'DRAFT' }],
      });

      await expect(
        repository.updateDraft(a.procedureId, randomUUID(), { title: 'X' }),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
      await expect(
        repository.updateDraft(a.procedureId, b.versionIds[0], { title: 'X' }),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
    });
  });

  describe('deleteDraft', () => {
    it('E13: deleting the only draft deletes the procedure, its steps and its areas', async () => {
      const seeded = await seedProcedure(prisma, {
        areaIds: [AREA_IDS.ventas],
        versions: [
          { versionNumber: 1, status: 'DRAFT', stepTitles: ['A', 'B'] },
        ],
      });

      await expect(
        repository.deleteDraft(seeded.procedureId, seeded.versionIds[0]),
      ).resolves.toEqual({ ok: true, value: { procedureDeleted: true } });

      await expect(prisma.procedure.count()).resolves.toBe(0);
      await expect(prisma.procedureVersion.count()).resolves.toBe(0);
      await expect(prisma.step.count()).resolves.toBe(0);
      await expect(prisma.procedureArea.count()).resolves.toBe(0);
    });

    it('E14: deleting a draft of a published procedure keeps the published version and its steps', async () => {
      const seeded = await seedProcedure(prisma, {
        areaIds: [AREA_IDS.ventas],
        versions: [
          {
            versionNumber: 1,
            status: 'PUBLISHED',
            stepTitles: ['A', 'B', 'C'],
          },
          { versionNumber: 2, status: 'DRAFT', stepTitles: ['A', 'B', 'C'] },
        ],
      });

      await expect(
        repository.deleteDraft(seeded.procedureId, seeded.versionIds[1]),
      ).resolves.toEqual({ ok: true, value: { procedureDeleted: false } });

      const record = await repository.findById(seeded.procedureId);
      expect(record?.areaIds).toEqual([AREA_IDS.ventas]);
      expect(record?.versions.map((v) => [v.status, v.stepCount])).toEqual([
        ['PUBLISHED', 3],
      ]);
    });

    it.each(['PUBLISHED', 'SUPERSEDED'] as const)(
      'E15: never deletes a %s version',
      async (status) => {
        const seeded = await seedProcedure(prisma, {
          versions: [{ versionNumber: 1, status, stepTitles: ['A'] }],
        });

        await expect(
          repository.deleteDraft(seeded.procedureId, seeded.versionIds[0]),
        ).resolves.toEqual({ ok: false, reason: 'NOT_A_DRAFT' });
        await expect(prisma.procedureVersion.count()).resolves.toBe(1);
        await expect(prisma.step.count()).resolves.toBe(1);
      },
    );

    it('is NOT_FOUND for an unknown procedure or version', async () => {
      const seeded = await seedProcedure(prisma, {
        versions: [{ versionNumber: 1, status: 'DRAFT' }],
      });

      await expect(
        repository.deleteDraft(randomUUID(), seeded.versionIds[0]),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
      await expect(
        repository.deleteDraft(seeded.procedureId, randomUUID()),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
      await expect(prisma.procedure.count()).resolves.toBe(1);
    });
  });
});
