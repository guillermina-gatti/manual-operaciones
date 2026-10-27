/* Use cases of step-by-step execution (spec 005): start, find one and complete a step */
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import type { ExecutionStatus } from '../generated/prisma/client';
import { UsersDirectory } from '../documents/ports/users-directory';
import { canAccessProcedure, isOwner } from './execution-access.policy';
import {
  checkCompletable,
  currentStep,
  nextStep,
  stepDurationMs,
} from './execution-progress';
import {
  ExecutionInProgressError,
  ExecutionRecord,
  ExecutionsRepository,
} from './executions.repository';
import { toHttpException } from './http-errors';
import type { ExecutionOperation } from './http-errors';
import { Clock } from './ports/clock';
import {
  CatalogProcedureVersion,
  ProceduresCatalog,
} from './ports/procedures-catalog';

// One step of the version as the user sees it. Steps not started yet have null dates.
export interface ExecutionStepView {
  stepId: string;
  order: number;
  title: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
}

// What the service returns, built field by field. No userId: it is always the caller.
export interface ExecutionView {
  id: string;
  procedureId: string;
  procedureVersionId: string;
  status: ExecutionStatus;
  startedAt: Date;
  finishedAt: Date | null;
  currentStepId: string | null; // where to resume (CA3); null when completed
  steps: ExecutionStepView[];
}

export interface StartResult {
  execution: ExecutionView;
  created: boolean; // false: the execution in progress was returned (200, not 201)
}

// CA4: the same error and message for a missing execution, someone else's, one whose
// area the user lost, or a step that is not in its version.
const executionNotFound = () =>
  new NotFoundException('No se encontró la ejecución');

// Unknown procedure, no published version (or one without steps), or another area.
const procedureNotFound = () =>
  new NotFoundException('No se encontró el procedimiento');

const conflict = (reason: string, message: string) =>
  new ConflictException({
    statusCode: 409,
    message,
    error: 'Conflict',
    reason,
  });

const CONFLICT_MESSAGES = {
  EXECUTION_COMPLETED: 'La ejecución ya está completa',
  STEP_OUT_OF_ORDER: 'Ese paso no es el paso actual de la ejecución',
  STEP_ALREADY_FINISHED: 'Ese paso ya está terminado',
} as const;

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly users: UsersDirectory,
    private readonly catalog: ProceduresCatalog,
    private readonly executions: ExecutionsRepository,
    private readonly clock: Clock,
  ) {}

  // Returns the execution in progress if there is one (CA3); otherwise starts one on
  // the published version with step 1 started now.
  start(user: AuthUser, procedureId: string): Promise<StartResult> {
    return this.mapErrors(() => this.startOrResume(user, procedureId), 'start');
  }

  findOne(user: AuthUser, id: string): Promise<ExecutionView> {
    return this.mapErrors(() => this.find(user, id), 'find');
  }

  // Finishes the current step and starts the next one, or completes the execution.
  completeStep(
    user: AuthUser,
    id: string,
    stepId: string,
  ): Promise<ExecutionView> {
    return this.mapErrors(() => this.complete(user, id, stepId), 'complete');
  }

  private async startOrResume(
    user: AuthUser,
    procedureId: string,
  ): Promise<StartResult> {
    const areaIds = await this.areasOf(user);

    const existing = await this.executions.findInProgress(user.id, procedureId);
    if (existing) return this.resumed(existing, areaIds);

    const published = await this.catalog.findPublished(procedureId);
    const first = published && currentStep(published.steps, []);
    if (
      !published ||
      !first ||
      !canAccessProcedure(areaIds, published.areaIds)
    ) {
      throw procedureNotFound();
    }

    const startedAt = this.clock.now();
    try {
      const created = await this.executions.create({
        id: randomUUID(),
        userId: user.id,
        procedureId,
        procedureVersionId: published.versionId,
        startedAt,
        firstStep: { stepId: first.id, stepOrder: first.order },
      });
      return { execution: toView(created, published), created: true };
    } catch (error) {
      // Another request started it between the lookup and the insert.
      if (!(error instanceof ExecutionInProgressError)) throw error;
      const winner = await this.executions.findInProgress(user.id, procedureId);
      if (!winner) throw error;
      return this.resumed(winner, areaIds);
    }
  }

  private async find(user: AuthUser, id: string): Promise<ExecutionView> {
    const areaIds = await this.areasOf(user);
    const { execution, version } = await this.visible(
      user,
      areaIds,
      await this.executions.findById(id),
    );
    return toView(execution, version);
  }

  // Access and the version are resolved first, outside the transaction: versions are
  // immutable, so the catalog is never called while the row is locked. The progress
  // checks and the write run in one transaction, on the locked execution row.
  private async complete(
    user: AuthUser,
    id: string,
    stepId: string,
  ): Promise<ExecutionView> {
    const areaIds = await this.areasOf(user);
    const { version } = await this.visible(
      user,
      areaIds,
      await this.executions.findById(id),
    );
    const step = version.steps.find((s) => s.id === stepId);
    if (!step) throw executionNotFound();

    return this.executions.runInTransaction(async (tx) => {
      // Owner and version never change; status and steps may have, so re-read them.
      const execution = await this.executions.findById(id, tx);
      if (!execution) throw executionNotFound();

      if (execution.status === 'COMPLETED') {
        throw conflict(
          'EXECUTION_COMPLETED',
          CONFLICT_MESSAGES.EXECUTION_COMPLETED,
        );
      }
      const rejection = checkCompletable(version.steps, execution.steps, step);
      if (rejection) throw conflict(rejection, CONFLICT_MESSAGES[rejection]);

      const next = nextStep(version.steps, step);
      const updated = await this.executions.completeStep(tx, {
        executionId: execution.id,
        stepId: step.id,
        finishedAt: this.clock.now(),
        next: next && { stepId: next.id, stepOrder: next.order },
      });
      return toView(updated, version);
    });
  }

  // 404 and 409 pass as they are; a dependency that is down is a 503; anything else
  // is a 500 (http-errors.ts).
  private async mapErrors<T>(
    run: () => Promise<T>,
    operation: ExecutionOperation,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toHttpException(error, this.logger, operation);
    }
  }

  // Areas come from the directory on every request, never from the session. A user
  // the directory does not know has no areas, so every check answers 404.
  private async areasOf(user: AuthUser): Promise<string[]> {
    const found = await this.users.findById(user.id);
    return found?.areaIds ?? [];
  }

  // The version the execution was started with (CA1), if the user can still see it:
  // it must be theirs and they must share an area with the procedure's current areas
  // (the catalog reports those for every version). Otherwise 404.
  private async visible(
    user: AuthUser,
    areaIds: string[],
    execution: ExecutionRecord | null,
  ): Promise<{
    execution: ExecutionRecord;
    version: CatalogProcedureVersion;
  }> {
    if (!execution || !isOwner(user.id, execution)) throw executionNotFound();
    const version = await this.catalog.findVersion(
      execution.procedureVersionId,
    );
    if (!version || !canAccessProcedure(areaIds, version.areaIds)) {
      throw executionNotFound();
    }
    return { execution, version };
  }

  // An execution already in progress, returned by start with created: false. If the
  // user lost the area, it is hidden like any other procedure they cannot see.
  private async resumed(
    execution: ExecutionRecord,
    areaIds: string[],
  ): Promise<StartResult> {
    const version = await this.catalog.findVersion(
      execution.procedureVersionId,
    );
    if (!version || !canAccessProcedure(areaIds, version.areaIds)) {
      throw procedureNotFound();
    }
    return { execution: toView(execution, version), created: false };
  }
}

// Merges the version steps with the recorded ones, field by field.
function toView(
  execution: ExecutionRecord,
  version: CatalogProcedureVersion,
): ExecutionView {
  const recorded = new Map(execution.steps.map((s) => [s.stepId, s]));
  return {
    id: execution.id,
    procedureId: execution.procedureId,
    procedureVersionId: execution.procedureVersionId,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    currentStepId: currentStep(version.steps, execution.steps)?.id ?? null,
    steps: version.steps.map((step) => {
      const row = recorded.get(step.id);
      return {
        stepId: step.id,
        order: step.order,
        title: step.title,
        startedAt: row?.startedAt ?? null,
        finishedAt: row?.finishedAt ?? null,
        durationMs: row ? stepDurationMs(row) : null,
      };
    }),
  };
}
