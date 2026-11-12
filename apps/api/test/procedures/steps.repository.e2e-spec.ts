/* The Prisma step operations against real PostgreSQL: locking, unique order and two-pass renumbering */

import { randomUUID } from 'node:crypto';
import { PrismaProceduresRepository } from '../../src/procedures/prisma-procedures.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanProcedures, seedProcedure } from './helpers';

const MAX_STEPS = 50;

describe('Procedures repository: steps (integration)', () => {
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

  // A draft with the given steps; returns the ids to call the repository.
  const draftWith = async (...titles: string[]) => {
    const seeded = await seedProcedure(prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT', stepTitles: titles }],
    });
    return {
      procedureId: seeded.procedureId,
      versionId: seeded.versionIds[0],
      stepIds: seeded.stepIds[0],
    };
  };

  const add = (
    draft: { procedureId: string; versionId: string },
    title: string,
    position?: number,
    maxSteps = MAX_STEPS,
  ) =>
    repository.addStep(
      draft.procedureId,
      draft.versionId,
      { id: randomUUID(), title, description: '', position },
      maxSteps,
    );

  // [order, title] of the steps of a version, as stored.
  const stored = async (versionId: string) => {
    const rows = await prisma.step.findMany({
      where: { procedureVersionId: versionId },
      orderBy: { stepOrder: 'asc' },
    });
    return rows.map((row) => [row.stepOrder, row.title]);
  };

  describe('addStep', () => {
    it('E4: three steps added one after the other get the orders 1, 2 and 3', async () => {
      const draft = await draftWith();

      await add(draft, 'A');
      await add(draft, 'B');
      await add(draft, 'C');

      await expect(stored(draft.versionId)).resolves.toEqual([
        [1, 'A'],
        [2, 'B'],
        [3, 'C'],
      ]);
    });

    it.each([
      [1, ['X', 'A', 'B', 'C']],
      [2, ['A', 'X', 'B', 'C']],
      [4, ['A', 'B', 'C', 'X']],
    ])(
      'E5: a step added at position %i leaves the orders 1 to 4 without gaps',
      async (position, titles) => {
        const draft = await draftWith('A', 'B', 'C');

        const result = await add(draft, 'X', position);

        expect(result).toMatchObject({
          ok: true,
          value: { order: position, title: 'X' },
        });
        await expect(stored(draft.versionId)).resolves.toEqual(
          titles.map((title, index) => [index + 1, title]),
        );
      },
    );

    it('keeps the ids of the steps that were already there', async () => {
      const draft = await draftWith('A', 'B', 'C');

      await add(draft, 'X', 1);

      const rows = await prisma.step.findMany({
        where: { id: { in: draft.stepIds } },
        orderBy: { stepOrder: 'asc' },
      });
      expect(rows.map((row) => row.id)).toEqual(draft.stepIds);
      expect(rows.map((row) => row.stepOrder)).toEqual([2, 3, 4]);
    });

    it.each([0, 5, 1.5])(
      'R7: position %p is INVALID_POSITION and nothing changes',
      async (position) => {
        const draft = await draftWith('A', 'B', 'C');

        await expect(add(draft, 'X', position)).resolves.toEqual({
          ok: false,
          reason: 'INVALID_POSITION',
        });
        await expect(stored(draft.versionId)).resolves.toEqual([
          [1, 'A'],
          [2, 'B'],
          [3, 'C'],
        ]);
      },
    );

    it('R6: the 50th step is accepted and the 51st is STEP_LIMIT_REACHED', async () => {
      const titles = Array.from({ length: 49 }, (_, i) => `Paso ${i + 1}`);
      const draft = await draftWith(...titles);

      await expect(add(draft, 'Paso 50')).resolves.toMatchObject({ ok: true });
      await expect(add(draft, 'Paso 51')).resolves.toEqual({
        ok: false,
        reason: 'STEP_LIMIT_REACHED',
      });
      await expect(prisma.step.count()).resolves.toBe(50);
    });

    it('serializes simultaneous requests: the orders stay 1 to n with no repeats', async () => {
      const draft = await draftWith('A');

      const results = await Promise.all([
        add(draft, 'B'),
        add(draft, 'C', 1),
        add(draft, 'D'),
        add(draft, 'E', 2),
      ]);

      expect(results.every((result) => result.ok)).toBe(true);
      const rows = await stored(draft.versionId);
      expect(rows.map(([order]) => order)).toEqual([1, 2, 3, 4, 5]);
      expect(
        rows
          .map(([, title]) => String(title))
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual([
        'A',
        'B',
        'C',
        'D',
        'E',
      ]);
    });
  });

  describe('updateStep', () => {
    it('changes the title and leaves the order alone', async () => {
      const draft = await draftWith('A', 'B');

      const result = await repository.updateStep(
        draft.procedureId,
        draft.versionId,
        draft.stepIds[1],
        { title: 'B2' },
      );

      expect(result).toMatchObject({
        ok: true,
        value: { id: draft.stepIds[1], order: 2, title: 'B2' },
      });
    });

    it('is STEP_NOT_FOUND for a step that is not in that version', async () => {
      const draft = await draftWith('A');
      const other = await draftWith('Z');

      await expect(
        repository.updateStep(
          draft.procedureId,
          draft.versionId,
          other.stepIds[0],
          { title: 'X' },
        ),
      ).resolves.toEqual({ ok: false, reason: 'STEP_NOT_FOUND' });
      await expect(stored(other.versionId)).resolves.toEqual([[1, 'Z']]);
    });
  });

  describe('deleteStep', () => {
    it.each([
      [
        'the first',
        0,
        [
          [1, 'B'],
          [2, 'C'],
        ],
      ],
      [
        'a middle',
        1,
        [
          [1, 'A'],
          [2, 'C'],
        ],
      ],
      [
        'the last',
        2,
        [
          [1, 'A'],
          [2, 'B'],
        ],
      ],
    ])(
      'E6: deleting %s step moves the following ones up',
      async (_label, index, expected) => {
        const draft = await draftWith('A', 'B', 'C');

        await expect(
          repository.deleteStep(
            draft.procedureId,
            draft.versionId,
            draft.stepIds[index],
          ),
        ).resolves.toEqual({ ok: true, value: undefined });

        await expect(stored(draft.versionId)).resolves.toEqual(expected);
      },
    );

    it('leaves an empty draft when its only step is deleted', async () => {
      const draft = await draftWith('A');

      await repository.deleteStep(
        draft.procedureId,
        draft.versionId,
        draft.stepIds[0],
      );

      await expect(stored(draft.versionId)).resolves.toEqual([]);
    });

    it('is STEP_NOT_FOUND for a step of another version, and nothing is deleted', async () => {
      const draft = await draftWith('A');
      const other = await draftWith('Z');

      await expect(
        repository.deleteStep(
          draft.procedureId,
          draft.versionId,
          other.stepIds[0],
        ),
      ).resolves.toEqual({ ok: false, reason: 'STEP_NOT_FOUND' });
      await expect(prisma.step.count()).resolves.toBe(2);
    });
  });

  describe('reorderSteps', () => {
    it('E7: applies the order, returns the steps in it and keeps their ids', async () => {
      const draft = await draftWith('A', 'B', 'C');
      const [a, b, c] = draft.stepIds;

      const result = await repository.reorderSteps(
        draft.procedureId,
        draft.versionId,
        [c, a, b],
      );

      expect(result.ok && result.value.map((s) => [s.id, s.order])).toEqual([
        [c, 1],
        [a, 2],
        [b, 3],
      ]);
      await expect(stored(draft.versionId)).resolves.toEqual([
        [1, 'C'],
        [2, 'A'],
        [3, 'B'],
      ]);
    });

    it('accepts the order it already has', async () => {
      const draft = await draftWith('A', 'B');

      await expect(
        repository.reorderSteps(
          draft.procedureId,
          draft.versionId,
          draft.stepIds,
        ),
      ).resolves.toMatchObject({ ok: true });
      await expect(stored(draft.versionId)).resolves.toEqual([
        [1, 'A'],
        [2, 'B'],
      ]);
    });

    it('E8: a missing, repeated or foreign step is INVALID_ORDER and the order does not change', async () => {
      const draft = await draftWith('A', 'B', 'C');
      const [a, b] = draft.stepIds;

      for (const requested of [
        [a, b],
        [a, a, b],
        [a, b, randomUUID()],
      ]) {
        await expect(
          repository.reorderSteps(draft.procedureId, draft.versionId, requested),
        ).resolves.toEqual({ ok: false, reason: 'INVALID_ORDER' });
      }
      await expect(stored(draft.versionId)).resolves.toEqual([
        [1, 'A'],
        [2, 'B'],
        [3, 'C'],
      ]);
    });
  });

  describe('R9: a version that is not a draft is never modified', () => {
    it.each(['PUBLISHED', 'SUPERSEDED'] as const)(
      'E12: %s version',
      async (status) => {
        const seeded = await seedProcedure(prisma, {
          versions: [{ versionNumber: 1, status, stepTitles: ['A', 'B'] }],
        });
        const { procedureId } = seeded;
        const [versionId] = seeded.versionIds;
        const [a, b] = seeded.stepIds[0];
        const rejected = { ok: false, reason: 'NOT_A_DRAFT' };

        await expect(
          repository.addStep(
            procedureId,
            versionId,
            { id: randomUUID(), title: 'X', description: '' },
            MAX_STEPS,
          ),
        ).resolves.toEqual(rejected);
        await expect(
          repository.updateStep(procedureId, versionId, a, { title: 'X' }),
        ).resolves.toEqual(rejected);
        await expect(
          repository.deleteStep(procedureId, versionId, a),
        ).resolves.toEqual(rejected);
        await expect(
          repository.reorderSteps(procedureId, versionId, [b, a]),
        ).resolves.toEqual(rejected);

        await expect(stored(versionId)).resolves.toEqual([
          [1, 'A'],
          [2, 'B'],
        ]);
      },
    );
  });

  it('is NOT_FOUND for an unknown version and for a version of another procedure', async () => {
    const draft = await draftWith('A');
    const other = await draftWith('Z');

    await expect(
      add({ procedureId: draft.procedureId, versionId: randomUUID() }, 'X'),
    ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
    await expect(
      add({ procedureId: draft.procedureId, versionId: other.versionId }, 'X'),
    ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
    await expect(prisma.step.count()).resolves.toBe(2);
  });
});
