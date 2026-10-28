// Response classes of GET /metrics/procedures (Swagger) and the field-by-field mapping
// from the service view. Only counts and times: no user of any execution.
import { ApiProperty } from '@nestjs/swagger';
import type { ProcedureMetricsView } from '../procedure-metrics.service';
import type {
  MetricsTotals,
  ProcedureMetrics,
  StepMetrics,
  VersionMetrics,
} from '../procedure-metrics';

const RATE = {
  type: Number,
  nullable: true,
  minimum: 0,
  maximum: 1,
} as const;

export class StepMetricsResponse {
  @ApiProperty({ format: 'uuid' })
  stepId: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ example: 'Contar el efectivo' })
  title: string;

  @ApiProperty({ description: 'Executions that started this step' })
  reached: number;

  @ApiProperty({ description: 'Executions that finished this step' })
  finished: number;

  @ApiProperty({
    example: 180000,
    type: Number,
    nullable: true,
    description:
      'Average of finishedAt - startedAt in milliseconds; null if nobody finished it',
  })
  avgDurationMs: number | null;

  @ApiProperty({
    description:
      'Executions still in progress whose current step is this one and started more than staleAfterHours ago',
  })
  abandoned: number;

  @ApiProperty({
    ...RATE,
    example: 0.1,
    description: 'abandoned / reached; null if nobody reached it',
  })
  abandonRate: number | null;
}

class ExecutionCountsResponse {
  @ApiProperty({ description: 'completed + inProgress + abandoned' })
  started: number;

  @ApiProperty()
  completed: number;

  @ApiProperty({ description: 'In progress and not abandoned' })
  inProgress: number;

  @ApiProperty()
  abandoned: number;
}

export class VersionMetricsResponse extends ExecutionCountsResponse {
  @ApiProperty({ format: 'uuid' })
  procedureVersionId: string;

  @ApiProperty({
    type: [StepMetricsResponse],
    description: 'Every step of the version, in order',
  })
  steps: StepMetricsResponse[];
}

export class ProcedureMetricsResponse extends ExecutionCountsResponse {
  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'The areas currently assigned to the procedure',
  })
  areaIds: string[];

  @ApiProperty({
    ...RATE,
    example: 0.67,
    description: 'completed / started',
  })
  completionRate: number | null;

  @ApiProperty({
    example: 540000,
    type: Number,
    nullable: true,
    description: 'Average duration of the completed executions in milliseconds',
  })
  avgCompletionMs: number | null;

  @ApiProperty({
    type: [VersionMetricsResponse],
    description: 'The version with the latest execution first',
  })
  versions: VersionMetricsResponse[];
}

export class MetricsTotalsResponse extends ExecutionCountsResponse {
  @ApiProperty({ ...RATE, description: 'completed / started' })
  completionRate: number | null;
}

export class MetricsFiltersResponse {
  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  areaId: string | null;

  @ApiProperty({ example: '2026-10-01', type: String, nullable: true })
  from: string | null;

  @ApiProperty({ example: '2026-10-27', type: String, nullable: true })
  to: string | null;
}

export class ProceduresMetricsResponse {
  @ApiProperty({ type: MetricsFiltersResponse })
  filters: MetricsFiltersResponse;

  @ApiProperty({
    example: 24,
    description: 'Hours after which a step still running counts as abandoned',
  })
  staleAfterHours: number;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    nullable: true,
    description: 'The areas the viewer may filter by; null means any (ADMIN)',
  })
  areaIds: string[] | null;

  @ApiProperty({ type: MetricsTotalsResponse })
  totals: MetricsTotalsResponse;

  @ApiProperty({
    type: [ProcedureMetricsResponse],
    description:
      'Procedures with executions in the period, the most started first',
  })
  procedures: ProcedureMetricsResponse[];
}

const toStep = (step: StepMetrics): StepMetricsResponse => ({
  stepId: step.stepId,
  order: step.order,
  title: step.title,
  reached: step.reached,
  finished: step.finished,
  avgDurationMs: step.avgDurationMs,
  abandoned: step.abandoned,
  abandonRate: step.abandonRate,
});

const toVersion = (version: VersionMetrics): VersionMetricsResponse => ({
  procedureVersionId: version.procedureVersionId,
  started: version.started,
  completed: version.completed,
  inProgress: version.inProgress,
  abandoned: version.abandoned,
  steps: version.steps.map(toStep),
});

const toProcedure = (
  procedure: ProcedureMetrics,
): ProcedureMetricsResponse => ({
  procedureId: procedure.procedureId,
  areaIds: [...procedure.areaIds],
  started: procedure.started,
  completed: procedure.completed,
  inProgress: procedure.inProgress,
  abandoned: procedure.abandoned,
  completionRate: procedure.completionRate,
  avgCompletionMs: procedure.avgCompletionMs,
  versions: procedure.versions.map(toVersion),
});

const toTotals = (totals: MetricsTotals): MetricsTotalsResponse => ({
  started: totals.started,
  completed: totals.completed,
  inProgress: totals.inProgress,
  abandoned: totals.abandoned,
  completionRate: totals.completionRate,
});

export const toProceduresMetricsResponse = (
  view: ProcedureMetricsView,
): ProceduresMetricsResponse => ({
  filters: {
    areaId: view.filters.areaId,
    from: view.filters.from,
    to: view.filters.to,
  },
  staleAfterHours: view.staleAfterHours,
  areaIds: view.areaIds && [...view.areaIds],
  totals: toTotals(view.totals),
  procedures: view.procedures.map(toProcedure),
});
