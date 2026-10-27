import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  ExecutionInProgressError,
  ExecutionsRepositoryUnavailableError,
} from './executions.repository';
import type {
  NewExecution,
  RepositoryTransaction,
} from './executions.repository';
import { PrismaExecutionsRepository } from './prisma-executions.repository';

const EXECUTION_ID = '1d000000-0000-4000-8000-000000000001';
const USER_ID = '0b000000-0000-4000-8000-000000000003';
const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000001';
const STEP_1 = '1c000000-0000-4000-8000-000000000001';
const STEP_2 = '1c000000-0000-4000-8000-000000000002';
const T0 = new Date('2026-10-27T10:00:00.000Z');
const T3 = new Date('2026-10-27T10:03:00.000Z');

const STEPS_INCLUDE = { steps: { orderBy: { stepOrder: 'asc' } } };

// A row as Prisma returns it with STEPS_INCLUDE.
const row = (overrides: Record<string, unknown> = {}) => ({
  id: EXECUTION_ID,
  userId: USER_ID,
  procedureId: PROCEDURE_ID,
  procedureVersionId: VERSION_ID,
  status: 'IN_PROGRESS',
  startedAt: T0,
  finishedAt: null,
  steps: [
    {
      id: 'row-1',
      executionId: EXECUTION_ID,
      stepId: STEP_1,
      stepOrder: 1,
      startedAt: T0,
      finishedAt: null,
    },
  ],
  ...overrides,
});

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
    meta,
  });

// P2002 as the pg adapter reports it: the index name in driverAdapterError.
const uniqueViolation = (index: string) =>
  knownError('P2002', {
    driverAdapterError: { cause: { constraint: { index } } },
  });

const newExecution: NewExecution = {
  id: EXECUTION_ID,
  userId: USER_ID,
  procedureId: PROCEDURE_ID,
  procedureVersionId: VERSION_ID,
  startedAt: T0,
  firstStep: { stepId: STEP_1, stepOrder: 1 },
};

const clientMock = () => ({
  $queryRaw: jest.fn(),
  execution: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  executionStep: {
    update: jest.fn(),
    create: jest.fn(),
  },
});

describe('PrismaExecutionsRepository', () => {
  let prisma: ReturnType<typeof clientMock> & { $transaction: jest.Mock };
  let txClient: ReturnType<typeof clientMock>;
  let tx: RepositoryTransaction;
  let repository: PrismaExecutionsRepository;

  beforeEach(() => {
    txClient = clientMock();
    tx = txClient as unknown as RepositoryTransaction;
    prisma = {
      ...clientMock(),
      $transaction: jest.fn((fn: (client: unknown) => unknown) =>
        Promise.resolve(fn(txClient)),
      ),
    };
    repository = new PrismaExecutionsRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('runInTransaction', () => {
    it('runs the callback with the Prisma transaction client and a timeout', async () => {
      const seen: unknown[] = [];

      const result = await repository.runInTransaction((client) => {
        seen.push(client);
        return Promise.resolve('done');
      });

      expect(result).toBe('done');
      expect(seen).toEqual([txClient]);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        maxWait: 2000,
      });
    });

    it('translates a database that is down', async () => {
      prisma.$transaction.mockRejectedValue(knownError('P2028'));

      await expect(
        repository.runInTransaction(() => Promise.resolve()),
      ).rejects.toBeInstanceOf(ExecutionsRepositoryUnavailableError);
    });
  });

  describe('create', () => {
    it('inserts the execution IN_PROGRESS with its first step started', async () => {
      prisma.execution.create.mockResolvedValue(row());

      const record = await repository.create(newExecution);

      expect(prisma.execution.create).toHaveBeenCalledWith({
        data: {
          id: EXECUTION_ID,
          userId: USER_ID,
          procedureId: PROCEDURE_ID,
          procedureVersionId: VERSION_ID,
          status: 'IN_PROGRESS',
          startedAt: T0,
          steps: {
            create: { stepId: STEP_1, stepOrder: 1, startedAt: T0 },
          },
        },
        include: STEPS_INCLUDE,
      });
      expect(record).toEqual({
        id: EXECUTION_ID,
        userId: USER_ID,
        procedureId: PROCEDURE_ID,
        procedureVersionId: VERSION_ID,
        status: 'IN_PROGRESS',
        startedAt: T0,
        finishedAt: null,
        steps: [
          { stepId: STEP_1, stepOrder: 1, startedAt: T0, finishedAt: null },
        ],
      });
    });

    it('translates P2002 on executions_one_in_progress_idx to ExecutionInProgressError', async () => {
      const clash = uniqueViolation('executions_one_in_progress_idx');
      prisma.execution.create.mockRejectedValue(clash);

      const error: unknown = await repository
        .create(newExecution)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ExecutionInProgressError);
      expect((error as Error).cause).toBe(clash);
    });

    it.each([
      'execution_steps_execution_id_step_id_key',
      'execution_steps_execution_id_step_order_key',
      'executions_pkey',
    ])('lets a P2002 on %s through unchanged', async (index) => {
      const clash = uniqueViolation(index);
      prisma.execution.create.mockRejectedValue(clash);

      await expect(repository.create(newExecution)).rejects.toBe(clash);
    });

    it('lets a P2002 without index information through unchanged', async () => {
      const clash = knownError('P2002');
      prisma.execution.create.mockRejectedValue(clash);

      await expect(repository.create(newExecution)).rejects.toBe(clash);
    });

    it('translates a database that is down', async () => {
      prisma.execution.create.mockRejectedValue(knownError('P1001'));

      await expect(repository.create(newExecution)).rejects.toBeInstanceOf(
        ExecutionsRepositoryUnavailableError,
      );
    });
  });

  describe('findById', () => {
    it('without a transaction reads the execution and its steps, without locking', async () => {
      prisma.execution.findUnique.mockResolvedValue(row());

      const record = await repository.findById(EXECUTION_ID);

      expect(prisma.execution.findUnique).toHaveBeenCalledWith({
        where: { id: EXECUTION_ID },
        include: STEPS_INCLUDE,
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(record?.steps).toEqual([
        { stepId: STEP_1, stepOrder: 1, startedAt: T0, finishedAt: null },
      ]);
    });

    it('returns null when the execution does not exist', async () => {
      prisma.execution.findUnique.mockResolvedValue(null);

      await expect(repository.findById(EXECUTION_ID)).resolves.toBeNull();
    });

    it('inside a transaction locks the row with SELECT … FOR UPDATE, then reads it', async () => {
      const calls: string[] = [];
      txClient.$queryRaw.mockImplementation(() => {
        calls.push('lock');
        return Promise.resolve([{ id: EXECUTION_ID }]);
      });
      txClient.execution.findUnique.mockImplementation(() => {
        calls.push('read');
        return Promise.resolve(row());
      });

      const record = await repository.findById(EXECUTION_ID, tx);

      const [strings, ...values] = txClient.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      const sql = strings.join('?').replace(/\s+/g, ' ').trim();
      expect(sql).toBe(
        'SELECT id FROM executions WHERE id = ?::uuid FOR UPDATE',
      );
      expect(values).toEqual([EXECUTION_ID]);
      expect(calls).toEqual(['lock', 'read']);
      expect(txClient.execution.findUnique).toHaveBeenCalledWith({
        where: { id: EXECUTION_ID },
        include: STEPS_INCLUDE,
      });
      expect(prisma.execution.findUnique).not.toHaveBeenCalled();
      expect(record?.id).toBe(EXECUTION_ID);
    });

    it('inside a transaction returns null when there is no row to lock', async () => {
      txClient.$queryRaw.mockResolvedValue([]);

      await expect(repository.findById(EXECUTION_ID, tx)).resolves.toBeNull();
      expect(txClient.execution.findUnique).not.toHaveBeenCalled();
    });

    it('translates a connection lost in the middle of a transaction', async () => {
      txClient.$queryRaw.mockRejectedValue(
        new Error('Connection terminated unexpectedly'),
      );

      await expect(
        repository.findById(EXECUTION_ID, tx),
      ).rejects.toBeInstanceOf(ExecutionsRepositoryUnavailableError);
    });

    it('lets any other error through unchanged', async () => {
      const bug = new TypeError('x is undefined');
      prisma.execution.findUnique.mockRejectedValue(bug);

      await expect(repository.findById(EXECUTION_ID)).rejects.toBe(bug);
    });
  });

  describe('findInProgress', () => {
    it('looks for the IN_PROGRESS execution of the user for the procedure', async () => {
      prisma.execution.findFirst.mockResolvedValue(row());

      const record = await repository.findInProgress(USER_ID, PROCEDURE_ID);

      expect(prisma.execution.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          procedureId: PROCEDURE_ID,
          status: 'IN_PROGRESS',
        },
        include: STEPS_INCLUDE,
      });
      expect(record?.id).toBe(EXECUTION_ID);
    });

    it('returns null when there is none', async () => {
      prisma.execution.findFirst.mockResolvedValue(null);

      await expect(
        repository.findInProgress(USER_ID, PROCEDURE_ID),
      ).resolves.toBeNull();
    });

    it('translates a database that is down', async () => {
      prisma.execution.findFirst.mockRejectedValue(
        new Prisma.PrismaClientInitializationError('cannot connect', '7.10.0'),
      );

      await expect(
        repository.findInProgress(USER_ID, PROCEDURE_ID),
      ).rejects.toBeInstanceOf(ExecutionsRepositoryUnavailableError);
    });
  });

  describe('completeStep', () => {
    it('finishes the step and starts the next one at the same instant', async () => {
      const after = row({
        steps: [
          { ...row().steps[0], finishedAt: T3 },
          {
            id: 'row-2',
            executionId: EXECUTION_ID,
            stepId: STEP_2,
            stepOrder: 2,
            startedAt: T3,
            finishedAt: null,
          },
        ],
      });
      txClient.execution.findUnique.mockResolvedValue(after);

      const record = await repository.completeStep(tx, {
        executionId: EXECUTION_ID,
        stepId: STEP_1,
        finishedAt: T3,
        next: { stepId: STEP_2, stepOrder: 2 },
      });

      expect(txClient.executionStep.update).toHaveBeenCalledWith({
        where: {
          executionId_stepId: { executionId: EXECUTION_ID, stepId: STEP_1 },
        },
        data: { finishedAt: T3 },
      });
      expect(txClient.executionStep.create).toHaveBeenCalledWith({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_2,
          stepOrder: 2,
          startedAt: T3,
        },
      });
      expect(txClient.execution.update).not.toHaveBeenCalled();
      expect(record.steps).toEqual([
        { stepId: STEP_1, stepOrder: 1, startedAt: T0, finishedAt: T3 },
        { stepId: STEP_2, stepOrder: 2, startedAt: T3, finishedAt: null },
      ]);
    });

    it('after the last step closes the execution as COMPLETED', async () => {
      txClient.execution.findUnique.mockResolvedValue(
        row({ status: 'COMPLETED', finishedAt: T3 }),
      );

      const record = await repository.completeStep(tx, {
        executionId: EXECUTION_ID,
        stepId: STEP_1,
        finishedAt: T3,
        next: null,
      });

      expect(txClient.executionStep.update).toHaveBeenCalled();
      expect(txClient.executionStep.create).not.toHaveBeenCalled();
      expect(txClient.execution.update).toHaveBeenCalledWith({
        where: { id: EXECUTION_ID },
        data: { status: 'COMPLETED', finishedAt: T3 },
      });
      expect(record).toMatchObject({ status: 'COMPLETED', finishedAt: T3 });
    });

    it('writes only through the transaction client', async () => {
      txClient.execution.findUnique.mockResolvedValue(row());

      await repository.completeStep(tx, {
        executionId: EXECUTION_ID,
        stepId: STEP_1,
        finishedAt: T3,
        next: { stepId: STEP_2, stepOrder: 2 },
      });

      expect(prisma.executionStep.update).not.toHaveBeenCalled();
      expect(prisma.executionStep.create).not.toHaveBeenCalled();
      expect(prisma.execution.findUnique).not.toHaveBeenCalled();
    });

    it('translates a transaction that timed out', async () => {
      txClient.executionStep.update.mockRejectedValue(knownError('P2028'));

      await expect(
        repository.completeStep(tx, {
          executionId: EXECUTION_ID,
          stepId: STEP_1,
          finishedAt: T3,
          next: null,
        }),
      ).rejects.toBeInstanceOf(ExecutionsRepositoryUnavailableError);
    });
  });
});
