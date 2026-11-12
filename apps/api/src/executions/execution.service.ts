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
import { AreasDirectory } from '../documents/ports/areas-directory';
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
import { noVersionChange, versionChangeOf } from './version-change';
import type { VersionChange } from './version-change';
import { activeAreaIdsOf } from './viewer-areas';

// One step of the version as the user sees it. Steps not started yet have null dates.
export interface ExecutionStepView {
  stepId: string;
  order: number;
  title: string;
  // The instruction of the step, when the catalog gives it (TODO(HU11): not the real one yet).
  description: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
}

// What the service returns, built field by field. No userId: it is always the caller.
export interface ExecutionView {
  id: string;
  procedureId: string;
  // The title of the version the execution runs, when the catalog gives it.
  procedureTitle: string | null;
  procedureVersionId: string;
  status: ExecutionStatus;
  startedAt: Date;
  finishedAt: Date | null;
  currentStepId: string | null; // where to resume (CA3); null when completed
  steps: ExecutionStepView[];
  // HU33: whether a newer version of the procedure is the current one. Only for an
  // execution in progress; a completed one never shows a change.
  versionChange: VersionChange;
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
  // HU33
  EXECUTION_RESTARTED: 'La ejecución se reinició con la versión nueva',
  PROCEDURE_NOT_CHANGED:
    'El procedimiento no cambió: la ejecución sigue con la versión vigente',
  PROCEDURE_CHANGED_CRITICAL:
    'El procedimiento tuvo un cambio crítico: reiniciá la ejecución con la versión nueva',
} as const;

// An execution that is no longer in progress cannot move: 409 with why.
const notInProgress = (status: ExecutionStatus) =>
  status === 'RESTARTED'
    ? conflict('EXECUTION_RESTARTED', CONFLICT_MESSAGES.EXECUTION_RESTARTED)
    : conflict('EXECUTION_COMPLETED', CONFLICT_MESSAGES.EXECUTION_COMPLETED);

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly users: UsersDirectory,
    private readonly areas: AreasDirectory,
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

  // HU33: closes the execution in progress as RESTARTED and starts a new one, from
  // step 1, on the current version. Only when the procedure changed.
  restart(user: AuthUser, id: string): Promise<ExecutionView> {
    return this.mapErrors(() => this.restartOnCurrent(user, id), 'restart');
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
    return toView(execution, version, await this.versionChangeOf(execution));
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
    const { execution: before, version } = await this.visible(
      user,
      areaIds,
      await this.executions.findById(id),
    );
    const step = version.steps.find((s) => s.id === stepId);
    if (!step) throw executionNotFound();
    const change = await this.versionChangeOf(before);

    return this.executions.runInTransaction(async (tx) => {
      // Owner and version never change; status and steps may have, so re-read them.
      const execution = await this.executions.findById(id, tx);
      if (!execution) throw executionNotFound();

      if (execution.status !== 'IN_PROGRESS') {
        throw notInProgress(execution.status);
      }
      // HU33: after a critical change the only way on is to restart.
      if (change.critical) {
        throw conflict(
          'PROCEDURE_CHANGED_CRITICAL',
          CONFLICT_MESSAGES.PROCEDURE_CHANGED_CRITICAL,
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
      // The change only matters while the execution is still in progress.
      return toView(
        updated,
        version,
        updated.status === 'IN_PROGRESS' ? change : noVersionChange(),
      );
    });
  }

  // Like complete: access and the current version are read first, outside the
  // transaction; the checks and the two writes run on the locked row. Two restarts of
  // the same execution: the second one finds it RESTARTED (409).
  private async restartOnCurrent(
    user: AuthUser,
    id: string,
  ): Promise<ExecutionView> {
    const areaIds = await this.areasOf(user);
    const { execution: before } = await this.visible(
      user,
      areaIds,
      await this.executions.findById(id),
    );
    if (before.status !== 'IN_PROGRESS') throw notInProgress(before.status);

    const current = await this.catalog.findPublished(before.procedureId);
    const first = current && currentStep(current.steps, []);
    if (!current || !first || !canAccessProcedure(areaIds, current.areaIds)) {
      throw procedureNotFound();
    }
    if (current.versionId === before.procedureVersionId) {
      throw conflict(
        'PROCEDURE_NOT_CHANGED',
        CONFLICT_MESSAGES.PROCEDURE_NOT_CHANGED,
      );
    }

    return this.executions.runInTransaction(async (tx) => {
      const execution = await this.executions.findById(id, tx);
      if (!execution) throw executionNotFound();
      if (execution.status !== 'IN_PROGRESS') {
        throw notInProgress(execution.status);
      }

      const now = this.clock.now();
      const created = await this.executions.restart(tx, {
        executionId: execution.id,
        closedAt: now,
        next: {
          id: randomUUID(),
          userId: user.id,
          procedureId: execution.procedureId,
          procedureVersionId: current.versionId,
          startedAt: now,
          firstStep: { stepId: first.id, stepOrder: first.order },
        },
      });
      return toView(created, current);
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

  // Only the active areas of the user, read from the directories on every request
  // (viewer-areas.ts). Without areas every check answers 404.
  private areasOf(user: AuthUser): Promise<string[]> {
    return activeAreaIdsOf(this.users, this.areas, user.id);
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
    return {
      execution: toView(
        execution,
        version,
        await this.versionChangeOf(execution),
      ),
      created: false,
    };
  }

  // HU33: compares the version of an execution in progress with the current one, and
  // tells whether any version published since then was a critical change. Read from the
  // catalog, never inside a transaction.
  private async versionChangeOf(
    execution: Pick<
      ExecutionRecord,
      'status' | 'procedureId' | 'procedureVersionId'
    >,
  ): Promise<VersionChange> {
    if (execution.status !== 'IN_PROGRESS') return noVersionChange();
    const [current, publishedAfter] = await Promise.all([
      this.catalog.findPublished(execution.procedureId),
      this.catalog.findPublishedAfter(execution.procedureVersionId),
    ]);
    return versionChangeOf(
      execution.procedureVersionId,
      current,
      publishedAfter,
    );
  }
}

// Merges the version steps with the recorded ones, field by field.
function toView(
  execution: ExecutionRecord,
  version: CatalogProcedureVersion,
  versionChange: VersionChange = noVersionChange(),
): ExecutionView {
  const recorded = new Map(execution.steps.map((s) => [s.stepId, s]));
  return {
    id: execution.id,
    procedureId: execution.procedureId,
    procedureTitle: textOrNull(version.title),
    procedureVersionId: execution.procedureVersionId,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    // Only an execution in progress has a step to resume from.
    currentStepId:
      execution.status === 'IN_PROGRESS'
        ? (currentStep(version.steps, execution.steps)?.id ?? null)
        : null,
    steps: version.steps.map((step) => {
      const row = recorded.get(step.id);
      return {
        stepId: step.id,
        order: step.order,
        title: step.title,
        description: textOrNull(step.description),
        startedAt: row?.startedAt ?? null,
        finishedAt: row?.finishedAt ?? null,
        durationMs: row ? stepDurationMs(row) : null,
      };
    }),
    versionChange,
  };
}

// A text of the catalog, or null when it does not give one or it is only spaces.
function textOrNull(text: string | undefined): string | null {
  return text && text.trim() ? text : null;
}
