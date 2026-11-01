/* Reads and writes procedures in PostgreSQL with Prisma. A database that does not answer becomes
ProceduresRepositoryUnavailableError, which the API turns into a 503 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type {
  ProcedureVersionStatus,
  Step as StepRow,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DraftAlreadyExistsError,
  DraftChanges,
  DraftResult,
  NewDraft,
  NewProcedure,
  NewStep,
  NoPublishedVersionError,
  ProcedureRecord,
  ProceduresRepository,
  ProceduresRepositoryUnavailableError,
  StepChanges,
  StepRecord,
  StepResult,
  VersionRecord,
} from './procedures.repository';
import {
  insertStep,
  numberSteps,
  removeStep,
  reorderSteps as reorder,
} from './step-order';

// Same limits as the documents and executions repositories, so a frozen database never hangs a request.
const TRANSACTION_TIMEOUT_MS = 5000;
const TRANSACTION_MAX_WAIT_MS = 2000;
const TRANSACTION_OPTIONS = {
  timeout: TRANSACTION_TIMEOUT_MS,
  maxWait: TRANSACTION_MAX_WAIT_MS,
};

// Prisma codes that mean the database is not answering (same list as documents and executions).
const UNAVAILABLE_CODES = new Set([
  'P1000', // the server rejected the credentials
  'P1001', // server unreachable
  'P1002', // connection timeout
  'P1008', // operation timeout
  'P1017', // the server closed the connection
  'P2024', // timeout waiting for a free connection in the pool
  'P2028', // transaction error (its timeout expired)
]);

// Error of the pg driver when the server drops the connection; it has no code.
const PG_CONNECTION_LOST = 'Connection terminated unexpectedly';

// The partial unique index of the migration add_procedures (R3).
const ONE_DRAFT_INDEX = 'procedure_versions_one_draft_idx';

const versionCount = {
  _count: { select: { steps: true } },
} satisfies Prisma.ProcedureVersionInclude;

const procedureInclude = {
  areas: { select: { areaId: true }, orderBy: { areaId: 'asc' } },
  versions: { orderBy: { versionNumber: 'asc' }, include: versionCount },
} satisfies Prisma.ProcedureInclude;

type VersionRow = Prisma.ProcedureVersionGetPayload<{
  include: typeof versionCount;
}>;
type ProcedureRow = Prisma.ProcedureGetPayload<{
  include: typeof procedureInclude;
}>;

@Injectable()
export class PrismaProceduresRepository extends ProceduresRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // One statement: Prisma inserts the procedure and its version 1 atomically.
  async create(data: NewProcedure): Promise<ProcedureRecord> {
    const row = await this.translate(() =>
      this.prisma.procedure.create({
        data: {
          id: data.id,
          ownerId: data.ownerId,
          versions: {
            create: {
              id: data.versionId,
              versionNumber: 1,
              status: 'DRAFT',
              title: data.title,
              description: data.description,
              createdById: data.ownerId,
            },
          },
        },
        include: procedureInclude,
      }),
    );
    return toProcedureRecord(row);
  }

  findById(id: string): Promise<ProcedureRecord | null> {
    return this.translate(async () => {
      const row = await this.prisma.procedure.findUnique({
        where: { id },
        include: procedureInclude,
      });
      return row ? toProcedureRecord(row) : null;
    });
  }

  setAreas(procedureId: string, areaIds: string[]): Promise<string[] | null> {
    return this.translate(() =>
      this.prisma.$transaction(async (tx) => {
        if (!(await lockProcedure(tx, procedureId))) return null;

        await tx.procedureArea.deleteMany({ where: { procedureId } });
        if (areaIds.length > 0) {
          await tx.procedureArea.createMany({
            data: areaIds.map((areaId) => ({ procedureId, areaId })),
          });
        }
        const saved = await tx.procedureArea.findMany({
          where: { procedureId },
          select: { areaId: true },
          orderBy: { areaId: 'asc' },
        });
        return saved.map((row) => row.areaId);
      }, TRANSACTION_OPTIONS),
    );
  }

  async createDraft(data: NewDraft): Promise<VersionRecord | null> {
    try {
      return await this.translate(() =>
        this.prisma.$transaction(async (tx) => {
          if (!(await lockProcedure(tx, data.procedureId))) return null;

          const draft = await tx.procedureVersion.findFirst({
            where: { procedureId: data.procedureId, status: 'DRAFT' },
            select: { id: true },
          });
          if (draft) {
            throw new DraftAlreadyExistsError(
              'The procedure already has a draft',
            );
          }

          const current = await tx.procedureVersion.findFirst({
            where: { procedureId: data.procedureId, status: 'PUBLISHED' },
            orderBy: { versionNumber: 'desc' },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
          });
          if (!current) {
            throw new NoPublishedVersionError(
              'The procedure has no published version to copy',
            );
          }

          const { _max } = await tx.procedureVersion.aggregate({
            where: { procedureId: data.procedureId },
            _max: { versionNumber: true },
          });
          const created = await tx.procedureVersion.create({
            data: {
              id: data.versionId,
              procedureId: data.procedureId,
              versionNumber: (_max.versionNumber ?? 0) + 1,
              status: 'DRAFT',
              title: current.title,
              description: current.description,
              createdById: data.createdById,
              // The steps get new ids: Prisma generates them (@default(uuid())).
              steps: {
                create: current.steps.map((step) => ({
                  stepOrder: step.stepOrder,
                  title: step.title,
                  description: step.description,
                })),
              },
            },
            include: versionCount,
          });
          return toVersionRecord(created);
        }, TRANSACTION_OPTIONS),
      );
    } catch (error) {
      // The lock makes this rare; the index is the safety net if something else wrote a draft.
      if (isUniqueViolationOn(error, ONE_DRAFT_INDEX)) {
        throw new DraftAlreadyExistsError('The procedure already has a draft', {
          cause: error,
        });
      }
      throw error;
    }
  }

  updateDraft(
    procedureId: string,
    versionId: string,
    changes: DraftChanges,
  ): Promise<DraftResult<VersionRecord>> {
    return this.translate(() =>
      this.prisma.$transaction(async (tx) => {
        const status = await lockVersion(tx, procedureId, versionId);
        if (status === null) return { ok: false, reason: 'NOT_FOUND' } as const;
        if (status !== 'DRAFT') {
          return { ok: false, reason: 'NOT_A_DRAFT' } as const;
        }
        const updated = await tx.procedureVersion.update({
          where: { id: versionId },
          data: {
            ...(changes.title !== undefined && { title: changes.title }),
            ...(changes.description !== undefined && {
              description: changes.description,
            }),
          },
          include: versionCount,
        });
        return { ok: true, value: toVersionRecord(updated) } as const;
      }, TRANSACTION_OPTIONS),
    );
  }

  // Lock order is always the procedure first and then the version, so two requests cannot deadlock.
  deleteDraft(
    procedureId: string,
    versionId: string,
  ): Promise<DraftResult<{ procedureDeleted: boolean }>> {
    return this.translate(() =>
      this.prisma.$transaction(async (tx) => {
        if (!(await lockProcedure(tx, procedureId))) {
          return { ok: false, reason: 'NOT_FOUND' } as const;
        }
        const status = await lockVersion(tx, procedureId, versionId);
        if (status === null) return { ok: false, reason: 'NOT_FOUND' } as const;
        if (status !== 'DRAFT') {
          return { ok: false, reason: 'NOT_A_DRAFT' } as const;
        }

        await tx.procedureVersion.delete({ where: { id: versionId } }); // its steps cascade
        const remaining = await tx.procedureVersion.count({
          where: { procedureId },
        });
        if (remaining > 0) {
          return { ok: true, value: { procedureDeleted: false } } as const;
        }
        await tx.procedure.delete({ where: { id: procedureId } }); // its areas cascade
        return { ok: true, value: { procedureDeleted: true } } as const;
      }, TRANSACTION_OPTIONS),
    );
  }

  addStep(
    procedureId: string,
    versionId: string,
    step: NewStep,
    maxSteps: number,
  ): Promise<StepResult<StepRecord>> {
    return this.inDraft(procedureId, versionId, async (tx) => {
      const ids = await stepIds(tx, versionId);
      if (ids.length >= maxSteps) {
        return { ok: false, reason: 'STEP_LIMIT_REACHED' } as const;
      }
      const placed = insertStep(ids, step.id, step.position);
      if (!placed) return { ok: false, reason: 'INVALID_POSITION' } as const;

      const order = placed.indexOf(step.id) + 1;
      const atTheEnd = order === placed.length;
      // The following steps move one place down: free their orders first (see negateOrders).
      if (!atTheEnd) await negateOrders(tx, versionId);
      const created = await tx.step.create({
        data: {
          id: step.id,
          procedureVersionId: versionId,
          stepOrder: order,
          title: step.title,
          description: step.description,
        },
      });
      if (!atTheEnd) await setOrders(tx, numberSteps(placed), step.id);
      return { ok: true, value: toStepRecord(created) } as const;
    });
  }

  updateStep(
    procedureId: string,
    versionId: string,
    stepId: string,
    changes: StepChanges,
  ): Promise<StepResult<StepRecord>> {
    return this.inDraft(procedureId, versionId, async (tx) => {
      const found = await tx.step.findFirst({
        where: { id: stepId, procedureVersionId: versionId },
        select: { id: true },
      });
      if (!found) return { ok: false, reason: 'STEP_NOT_FOUND' } as const;
      const updated = await tx.step.update({
        where: { id: stepId },
        data: {
          ...(changes.title !== undefined && { title: changes.title }),
          ...(changes.description !== undefined && {
            description: changes.description,
          }),
        },
      });
      return { ok: true, value: toStepRecord(updated) } as const;
    });
  }

  deleteStep(
    procedureId: string,
    versionId: string,
    stepId: string,
  ): Promise<StepResult<void>> {
    return this.inDraft(procedureId, versionId, async (tx) => {
      const remaining = removeStep(await stepIds(tx, versionId), stepId);
      if (!remaining) return { ok: false, reason: 'STEP_NOT_FOUND' } as const;

      await tx.step.delete({ where: { id: stepId } });
      if (remaining.length > 0) {
        await negateOrders(tx, versionId);
        await setOrders(tx, numberSteps(remaining));
      }
      return { ok: true, value: undefined } as const;
    });
  }

  reorderSteps(
    procedureId: string,
    versionId: string,
    requested: string[],
  ): Promise<StepResult<StepRecord[]>> {
    return this.inDraft(procedureId, versionId, async (tx) => {
      const ordered = reorder(await stepIds(tx, versionId), requested);
      if (!ordered) return { ok: false, reason: 'INVALID_ORDER' } as const;

      if (ordered.length > 0) {
        await negateOrders(tx, versionId);
        await setOrders(tx, numberSteps(ordered));
      }
      const rows = await tx.step.findMany({
        where: { procedureVersionId: versionId },
        orderBy: { stepOrder: 'asc' },
      });
      return { ok: true, value: rows.map(toStepRecord) } as const;
    });
  }

  // Runs the work in a transaction with the version row locked, and only if it is a draft of that
  // procedure (R9). Nothing is written when it is not.
  private inDraft<T>(
    procedureId: string,
    versionId: string,
    work: (tx: Prisma.TransactionClient) => Promise<StepResult<T>>,
  ): Promise<StepResult<T>> {
    return this.translate(() =>
      this.prisma.$transaction(async (tx) => {
        const status = await lockVersion(tx, procedureId, versionId);
        if (status === null) return { ok: false, reason: 'NOT_FOUND' } as const;
        if (status !== 'DRAFT') {
          return { ok: false, reason: 'NOT_A_DRAFT' } as const;
        }
        return work(tx);
      }, TRANSACTION_OPTIONS),
    );
  }

  private async translate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUnavailable(error)) {
        throw new ProceduresRepositoryUnavailableError(
          'La base de datos no responde',
          { cause: error },
        );
      }
      throw error;
    }
  }
}

// SELECT … FOR UPDATE: the row stays locked until the transaction ends. true if it exists.
async function lockProcedure(
  tx: Prisma.TransactionClient,
  procedureId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM procedures WHERE id = ${procedureId}::uuid FOR UPDATE
  `;
  return rows.length > 0;
}

// Locks the version only if it belongs to that procedure; returns its status, or null.
async function lockVersion(
  tx: Prisma.TransactionClient,
  procedureId: string,
  versionId: string,
): Promise<ProcedureVersionStatus | null> {
  const rows = await tx.$queryRaw<{ status: ProcedureVersionStatus }[]>`
    SELECT status FROM procedure_versions
    WHERE id = ${versionId}::uuid AND procedure_id = ${procedureId}::uuid
    FOR UPDATE
  `;
  return rows.length > 0 ? rows[0].status : null;
}

// The ids of the steps of the version, from first to last.
async function stepIds(
  tx: Prisma.TransactionClient,
  versionId: string,
): Promise<string[]> {
  const rows = await tx.step.findMany({
    where: { procedureVersionId: versionId },
    orderBy: { stepOrder: 'asc' },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

// Pass 1 of a renumbering. The order is unique per version and PostgreSQL checks it row by row, so
// moving a step one place would clash with a neighbour that has not moved yet. Negative orders
// cannot clash with the final ones (all positive); the table has no CHECK against them.
async function negateOrders(
  tx: Prisma.TransactionClient,
  versionId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE steps SET step_order = -step_order
    WHERE procedure_version_id = ${versionId}::uuid
  `;
}

// Pass 2: writes the final orders in one statement. `skip` is a step that was just created with its
// final order and was not negated.
async function setOrders(
  tx: Prisma.TransactionClient,
  numbered: { id: string; order: number }[],
  skip?: string,
): Promise<void> {
  const rows = numbered.filter((step) => step.id !== skip);
  await tx.$executeRaw`
    UPDATE steps SET step_order = numbers.step_order
    FROM unnest(${rows.map((step) => step.id)}::uuid[], ${rows.map((step) => step.order)}::int[])
      AS numbers(id, step_order)
    WHERE steps.id = numbers.id
  `;
}

function toStepRecord(row: StepRow): StepRecord {
  return {
    id: row.id,
    procedureVersionId: row.procedureVersionId,
    order: row.stepOrder,
    title: row.title,
    description: row.description,
  };
}

export function isUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_CODES.has(error.code)
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    !('code' in error) &&
    error.message === PG_CONNECTION_LOST
  );
}

// With the pg adapter, a P2002 carries the name of the index that clashed in
// meta.driverAdapterError.cause.constraint.index (reported by PostgreSQL).
function isUniqueViolationOn(error: unknown, index: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === index;
}

// Field by field, so nothing internal leaves the repository.
function toVersionRecord(row: VersionRow): VersionRecord {
  return {
    id: row.id,
    procedureId: row.procedureId,
    versionNumber: row.versionNumber,
    status: row.status,
    title: row.title,
    description: row.description,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stepCount: row._count.steps,
  };
}

function toProcedureRecord(row: ProcedureRow): ProcedureRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    areaIds: row.areas.map((area) => area.areaId),
    versions: row.versions.map(toVersionRecord),
  };
}
