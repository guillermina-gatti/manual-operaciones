/* Personal metrics of the employee (GET /metrics/me): only their own executions. Pure
functions over the aggregates of the database and the catalog versions; the counts,
averages and abandonment follow the same rules as the procedures metrics (HU38).

Left out for now (decided 2026-11-06), with the rules to follow when they come back:
- Comparing with the others' average time of a procedure. Only the OTHER users'
  completed executions (never the viewer's own, so nobody's time can be worked out
  from one's own), shown only with at least 5 completed executions by at least 3
  different people; otherwise null ("not enough data"). A fixed window of the last 90
  days that ignores from and to, so narrowing or subtracting periods cannot isolate one
  person. Rounded to the minute, without names nor how many people there were.
- Activity per week (Monday to Sunday, company time zone). */
import type { CatalogProcedureVersion } from '../ports/procedures-catalog';
import type { InProgressExecution } from './execution-metrics.repository';
import { buildProcedureMetrics } from './procedure-metrics';
import type {
  ExecutionAggregate,
  ExecutionCounts,
  StepAggregate,
} from './procedure-metrics';

export interface MyTotals extends ExecutionCounts {
  // Average of the completed executions of the period; null without any.
  avgCompletionMs: number | null;
}

export interface MySlowestStep {
  stepId: string;
  order: number;
  title: string;
  avgDurationMs: number;
}

export interface MyProcedure extends ExecutionCounts {
  procedureId: string;
  areaIds: string[];
  avgCompletionMs: number | null;
  lastStartedAt: Date;
  // The step that takes the viewer longest, in the latest version they ran.
  slowestStep: MySlowestStep | null;
}

export interface MyResumeItem {
  executionId: string;
  procedureId: string;
  procedureVersionId: string;
  currentStep: { stepId: string; order: number; title: string };
  totalSteps: number;
  startedAt: Date;
  // When the current step started: the last time the execution moved.
  lastActivityAt: Date;
  // No progress for more than staleAfterHours: counted as abandoned in the metrics,
  // but it can still be resumed.
  stale: boolean;
}

// The areas the personal metrics look at: the viewer's active areas, or the one asked
// for if it is one of them. null when it is not: answered with a 404, like the same
// request of a supervisor for an area that is not theirs.
export function myAreaScope(
  viewerAreaIds: string[],
  areaId?: string,
): string[] | null {
  if (!areaId) return viewerAreaIds;
  return viewerAreaIds.includes(areaId) ? [areaId] : null;
}

// One entry per procedure with executions of a visible version, the most recently
// started first. The counts and steps are those of the procedures metrics, only over the
// viewer's executions.
export function buildMyProcedures(
  executions: ExecutionAggregate[],
  steps: StepAggregate[],
  versions: ReadonlyMap<string, CatalogProcedureVersion>,
): MyProcedure[] {
  const lastStarted = new Map<string, Date>();
  for (const aggregate of executions) {
    if (!versions.has(aggregate.procedureVersionId)) continue;
    const current = lastStarted.get(aggregate.procedureId);
    if (!current || aggregate.lastStartedAt > current) {
      lastStarted.set(aggregate.procedureId, aggregate.lastStartedAt);
    }
  }

  return buildProcedureMetrics(executions, steps, versions)
    .map((procedure): MyProcedure => ({
      procedureId: procedure.procedureId,
      areaIds: procedure.areaIds,
      started: procedure.started,
      completed: procedure.completed,
      inProgress: procedure.inProgress,
      abandoned: procedure.abandoned,
      avgCompletionMs: procedure.avgCompletionMs,
      lastStartedAt: lastStarted.get(procedure.procedureId)!,
      // The versions come with the latest execution first.
      slowestStep: slowestStepOf(procedure.versions[0]?.steps ?? []),
    }))
    .sort(
      (a, b) =>
        b.lastStartedAt.getTime() - a.lastStartedAt.getTime() ||
        a.procedureId.localeCompare(b.procedureId),
    );
}

// The step with the highest average time; on a tie, the first one. null if none has one.
function slowestStepOf(
  steps: {
    stepId: string;
    order: number;
    title: string;
    avgDurationMs: number | null;
  }[],
): MySlowestStep | null {
  let slowest: MySlowestStep | null = null;
  for (const step of steps) {
    if (step.avgDurationMs === null) continue;
    if (!slowest || step.avgDurationMs > slowest.avgDurationMs) {
      slowest = {
        stepId: step.stepId,
        order: step.order,
        title: step.title,
        avgDurationMs: step.avgDurationMs,
      };
    }
  }
  return slowest;
}

// The counts add up the procedures; the average weights each completed execution the
// same, over the visible versions only.
export function myTotals(
  procedures: MyProcedure[],
  executions: ExecutionAggregate[],
  versions: ReadonlyMap<string, CatalogProcedureVersion>,
): MyTotals {
  const count = (value: (p: MyProcedure) => number) =>
    procedures.reduce((sum, p) => sum + value(p), 0);
  const visible = executions.filter((e) => versions.has(e.procedureVersionId));
  const completedCount = visible.reduce((sum, e) => sum + e.completed, 0);
  const durationMs = visible.reduce((sum, e) => sum + e.completedDurationMs, 0);
  return {
    started: count((p) => p.started),
    completed: count((p) => p.completed),
    inProgress: count((p) => p.inProgress),
    abandoned: count((p) => p.abandoned),
    avgCompletionMs:
      completedCount === 0 ? null : Math.round(durationMs / completedCount),
  };
}

// The executions in progress the viewer can open again: only those whose version is
// visible (the procedure still shares an active area with them; otherwise opening it
// answers 404). In the order of the repository, the most recently moved first.
export function buildResume(
  inProgress: InProgressExecution[],
  versions: ReadonlyMap<string, CatalogProcedureVersion>,
  staleBefore: Date,
): MyResumeItem[] {
  return inProgress.flatMap((execution): MyResumeItem[] => {
    const version = versions.get(execution.procedureVersionId);
    if (!version) return [];
    const step = version.steps.find((s) => s.id === execution.currentStepId);
    return [
      {
        executionId: execution.executionId,
        procedureId: execution.procedureId,
        procedureVersionId: execution.procedureVersionId,
        currentStep: {
          stepId: execution.currentStepId,
          order: execution.currentStepOrder,
          title: step?.title ?? '',
        },
        totalSteps: version.steps.length,
        startedAt: execution.startedAt,
        lastActivityAt: execution.currentStepStartedAt,
        stale: execution.currentStepStartedAt < staleBefore,
      },
    ];
  });
}
