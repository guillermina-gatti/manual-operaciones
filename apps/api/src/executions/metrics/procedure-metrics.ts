/* Metrics of procedures (HU38) built from the aggregates of the database and the
catalog versions. Pure functions: no I/O, every rate and average safe from zero */
import type { CatalogProcedureVersion } from '../ports/procedures-catalog';

// The executions of one version started in the period.
export interface ExecutionAggregate {
  procedureId: string;
  procedureVersionId: string;
  started: number;
  completed: number;
  inProgress: number; // every IN_PROGRESS, abandoned ones included
  completedDurationMs: number; // sum of finishedAt - startedAt of the completed ones
  // The shortest and the longest completed execution; null without completed ones.
  minCompletionMs: number | null;
  maxCompletionMs: number | null;
  lastStartedAt: Date;
}

// The rows of one step of a version, from executions started in the period.
export interface StepAggregate {
  procedureVersionId: string;
  stepId: string;
  reached: number; // rows: executions that started the step
  finished: number;
  finishedDurationMs: number; // sum of finishedAt - startedAt of the finished rows
  abandoned: number; // unfinished rows of executions in progress, started before staleBefore
}

export interface StepMetrics {
  stepId: string;
  order: number;
  title: string;
  reached: number;
  finished: number;
  avgDurationMs: number | null;
  abandoned: number;
  abandonRate: number | null; // abandoned / reached
}

// started = completed + inProgress + abandoned: the three are exclusive.
export interface ExecutionCounts {
  started: number;
  completed: number;
  inProgress: number; // in progress and not abandoned
  abandoned: number;
}

export interface VersionMetrics extends ExecutionCounts {
  procedureVersionId: string;
  // The average of the completed executions of this version; null without any.
  avgCompletionMs: number | null;
  steps: StepMetrics[];
}

export interface ProcedureMetrics extends ExecutionCounts {
  procedureId: string;
  // The title of the latest version with executions, when the catalog gives it
  // (TODO(HU11): not the real catalog yet).
  title: string | null;
  areaIds: string[];
  completionRate: number | null; // completed / started
  avgCompletionMs: number | null;
  // The fastest and the slowest completed execution, of any version; null without any.
  minCompletionMs: number | null;
  maxCompletionMs: number | null;
  versions: VersionMetrics[]; // the one with the latest execution first
}

export interface MetricsTotals extends ExecutionCounts {
  completionRate: number | null;
  // The average of every completed execution in view, from the exact sums: not the
  // average of the procedures' rounded averages. null without completed ones.
  avgCompletionMs: number | null;
}

// How many procedures with executions in the period an area has: the hints of the
// area selector of the panel.
export interface AreaSummary {
  areaId: string;
  procedures: number;
}

// null instead of dividing by zero.
export const ratio = (part: number, whole: number): number | null =>
  whole === 0 ? null : part / whole;

const average = (sumMs: number, count: number): number | null =>
  count === 0 ? null : Math.round(sumMs / count);

// One entry per procedure that has executions of a version found in `versions`.
// Aggregates of other versions are left out: the caller passes only the versions the
// viewer can see. Steps come from the catalog, in order; a step nobody reached gets
// zeros and nulls.
export function buildProcedureMetrics(
  executions: ExecutionAggregate[],
  steps: StepAggregate[],
  versions: ReadonlyMap<string, CatalogProcedureVersion>,
): ProcedureMetrics[] {
  const stepsByVersion = groupBy(steps, (s) => s.procedureVersionId);
  const visible = executions.filter((e) => versions.has(e.procedureVersionId));
  const byProcedure = groupBy(visible, (e) => e.procedureId);

  const procedures = [...byProcedure.entries()].map(
    ([procedureId, aggregates]) => {
      const sorted = [...aggregates].sort(
        (a, b) => b.lastStartedAt.getTime() - a.lastStartedAt.getTime(),
      );
      const versionMetrics = sorted.map((aggregate) =>
        toVersionMetrics(
          aggregate,
          versions.get(aggregate.procedureVersionId)!,
          stepsByVersion.get(aggregate.procedureVersionId) ?? [],
        ),
      );
      const counts = sumCounts(versionMetrics);
      const completedDurationMs = sum(aggregates, (a) => a.completedDurationMs);
      const latest = versions.get(sorted[0].procedureVersionId)!;
      return {
        procedureId,
        title: latest.title?.trim() ? latest.title : null,
        // Every version reports the procedure's current areas.
        areaIds: latest.areaIds,
        ...counts,
        completionRate: ratio(counts.completed, counts.started),
        avgCompletionMs: average(completedDurationMs, counts.completed),
        minCompletionMs: extreme(
          aggregates,
          (a) => a.minCompletionMs,
          Math.min,
        ),
        maxCompletionMs: extreme(
          aggregates,
          (a) => a.maxCompletionMs,
          Math.max,
        ),
        versions: versionMetrics,
      };
    },
  );

  return procedures.sort(
    (a, b) =>
      b.started - a.started || a.procedureId.localeCompare(b.procedureId),
  );
}

// `executions` are the aggregates read from the database; only those of the versions in
// `procedures` (the ones the viewer can see) count for the average.
export function totalsOf(
  procedures: ProcedureMetrics[],
  executions: ExecutionAggregate[],
): MetricsTotals {
  const counts = sumCounts(procedures);
  const inView = new Set(
    procedures.flatMap((p) => p.versions.map((v) => v.procedureVersionId)),
  );
  const completedDurationMs = sum(
    executions.filter((e) => inView.has(e.procedureVersionId)),
    (e) => e.completedDurationMs,
  );
  return {
    ...counts,
    completionRate: ratio(counts.completed, counts.started),
    avgCompletionMs: average(completedDurationMs, counts.completed),
  };
}

// One entry per area with procedures, in the order of their ids. A procedure with two
// areas counts in each, as the panel shows it in both. With `filterable` (a supervisor),
// only those areas: the other areas of a shared procedure are not theirs to see.
export function areaSummaryOf(
  procedures: ProcedureMetrics[],
  filterable: string[] | null,
): AreaSummary[] {
  const counts = new Map<string, number>();
  for (const procedure of procedures) {
    for (const areaId of new Set(procedure.areaIds)) {
      if (filterable && !filterable.includes(areaId)) continue;
      counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([areaId, count]) => ({ areaId, procedures: count }));
}

function toVersionMetrics(
  aggregate: ExecutionAggregate,
  version: CatalogProcedureVersion,
  stepAggregates: StepAggregate[],
): VersionMetrics {
  const byStep = new Map(stepAggregates.map((s) => [s.stepId, s]));
  const steps = version.steps.map((step): StepMetrics => {
    const row = byStep.get(step.id);
    const reached = row?.reached ?? 0;
    const finished = row?.finished ?? 0;
    const abandoned = row?.abandoned ?? 0;
    return {
      stepId: step.id,
      order: step.order,
      title: step.title,
      reached,
      finished,
      avgDurationMs: average(row?.finishedDurationMs ?? 0, finished),
      abandoned,
      abandonRate: ratio(abandoned, reached),
    };
  });
  // Each execution in progress has exactly one unfinished step, so the abandoned
  // executions are the abandoned steps.
  const abandoned = sum(steps, (s) => s.abandoned);
  return {
    procedureVersionId: aggregate.procedureVersionId,
    started: aggregate.started,
    completed: aggregate.completed,
    inProgress: aggregate.inProgress - abandoned,
    abandoned,
    avgCompletionMs: average(
      aggregate.completedDurationMs,
      aggregate.completed,
    ),
    steps,
  };
}

function sumCounts(items: ExecutionCounts[]): ExecutionCounts {
  return {
    started: sum(items, (i) => i.started),
    completed: sum(items, (i) => i.completed),
    inProgress: sum(items, (i) => i.inProgress),
    abandoned: sum(items, (i) => i.abandoned),
  };
}

// The smallest or largest of the values that are not null, rounded to the millisecond;
// null when every one is null.
function extreme<T>(
  items: T[],
  value: (item: T) => number | null,
  pick: (...values: number[]) => number,
): number | null {
  const values = items.map(value).filter((v): v is number => v !== null);
  return values.length === 0 ? null : Math.round(pick(...values));
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}
