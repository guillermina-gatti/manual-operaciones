/* The Prisma executions repository against real PostgreSQL: partial index, P2002 and locking */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from '../../src/executions/adapters/procedure-fixtures';
import { ExecutionInProgressError } from '../../src/executions/executions.repository';
import type { NewExecution } from '../../src/executions/executions.repository';
import { PrismaExecutionsRepository } from '../../src/executions/prisma-executions.repository';
import { Prisma } from '../../src/generated/prisma/client';
import {
  ExecutionsTestApp,
  authHeaders,
  cleanExecutions,
  createExecutionsTestApp,
} from './helpers';

const STEP_1 = '1c000000-0000-4000-8000-000000000011'; // v2 of Cierre de caja

const newExecution = (overrides: Partial<NewExecution> = {}): NewExecution => ({
  id: randomUUID(),
  userId: FIXTURE_USERS.empleadoVentas.id,
  procedureId: PROCEDURE_IDS.cierreDeCaja,
  procedureVersionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
  startedAt: new Date(),
  firstStep: { stepId: STEP_1, stepOrder: 1 },
  ...overrides,
});

describe('Executions repository (integration)', () => {
  let t: ExecutionsTestApp;
  let repository: PrismaExecutionsRepository;

  beforeAll(async () => {
    t = await createExecutionsTestApp();
    repository = new PrismaExecutionsRepository(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanExecutions(t.prisma);
  });

  describe('executions_one_in_progress_idx', () => {
    it('exists as a partial unique index on IN_PROGRESS', async () => {
      const [index] = await t.prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'executions' AND indexname = 'executions_one_in_progress_idx'
      `;

      expect(index.indexdef).toContain('CREATE UNIQUE INDEX');
      expect(index.indexdef).toContain('(user_id, procedure_id)');
      expect(index.indexdef).toContain(`WHERE (status = 'IN_PROGRESS'`);
    });

    it('rejects a second execution in progress with ExecutionInProgressError', async () => {
      await repository.create(newExecution());

      await expect(repository.create(newExecution())).rejects.toBeInstanceOf(
        ExecutionInProgressError,
      );
      await expect(t.prisma.execution.count()).resolves.toBe(1);
    });

    it('allows a new one once the previous is COMPLETED, and other users or procedures', async () => {
      const first = await repository.create(newExecution());
      await t.prisma.execution.update({
        where: { id: first.id },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });

      await repository.create(newExecution());
      await repository.create(
        newExecution({ userId: FIXTURE_USERS.empleadoOperaciones.id }),
      );
      await repository.create(
        newExecution({ procedureId: PROCEDURE_IDS.recepcionMercaderia }),
      );

      await expect(t.prisma.execution.count()).resolves.toBe(4);
    });

    // Confirms the shape the translator relies on (meta.driverAdapterError…index).
    it('PostgreSQL reports the P2002 with the index name', async () => {
      await repository.create(newExecution());

      const error: unknown = await t.prisma.execution
        .create({
          data: {
            userId: FIXTURE_USERS.empleadoVentas.id,
            procedureId: PROCEDURE_IDS.cierreDeCaja,
            procedureVersionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
            startedAt: new Date(),
          },
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe(
        'P2002',
      );
      expect(
        (error as Prisma.PrismaClientKnownRequestError).meta,
      ).toMatchObject({
        driverAdapterError: {
          cause: { constraint: { index: 'executions_one_in_progress_idx' } },
        },
      });
    });

    it('a clash on a unique key of execution_steps is not ExecutionInProgressError', async () => {
      const execution = await repository.create(newExecution());

      const error: unknown = await t.prisma.executionStep
        .create({
          data: {
            executionId: execution.id,
            stepId: STEP_1,
            stepOrder: 9,
            startedAt: new Date(),
          },
        })
        .catch((e: unknown) => e);

      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe(
        'P2002',
      );
      expect(
        (error as Prisma.PrismaClientKnownRequestError).meta,
      ).toMatchObject({
        driverAdapterError: {
          cause: {
            constraint: { index: 'execution_steps_execution_id_step_id_key' },
          },
        },
      });
      expect(error).not.toBeInstanceOf(ExecutionInProgressError);
    });
  });

  describe('two simultaneous completes of the same step', () => {
    it('one gets 200 and the other 409, without duplicated rows', async () => {
      const http = () => request(t.app.getHttpServer());
      const headers = authHeaders(FIXTURE_USERS.empleadoVentas);
      const { body } = await http()
        .post('/api/executions')
        .set(headers)
        .send({ procedureId: PROCEDURE_IDS.cierreDeCaja })
        .expect(201);
      const url = `/api/executions/${body.id}/steps/${STEP_1}/complete`;

      const responses = await Promise.all([
        http().post(url).set(headers),
        http().post(url).set(headers),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const conflict = responses.find((r) => r.status === 409);
      expect(conflict?.body.reason).toBe('STEP_ALREADY_FINISHED');

      const rows = await t.prisma.executionStep.findMany({
        where: { executionId: body.id },
        orderBy: { stepOrder: 'asc' },
      });
      expect(rows.map((r) => r.stepOrder)).toEqual([1, 2]);
      expect(rows[0].finishedAt).not.toBeNull();
      expect(rows[1].finishedAt).toBeNull();
    });
  });
});
