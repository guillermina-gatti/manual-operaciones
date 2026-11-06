// Response classes of GET /metrics/me (Swagger) and the field-by-field mapping from the
// service view. Only the viewer's own executions: no user id, no other person's data.
import { ApiProperty } from '@nestjs/swagger';
import type { MyMetricsView } from '../my-metrics.service';
import type {
  MyProcedure,
  MyResumeItem,
  MySlowestStep,
  MyTotals,
} from '../my-metrics';

const DURATION = {
  type: Number,
  nullable: true,
  description: 'Milliseconds; null without completed executions',
} as const;

export class MyMetricsFiltersResponse {
  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  areaId: string | null;

  @ApiProperty({ example: '2026-11-01', type: String, nullable: true })
  from: string | null;

  @ApiProperty({ example: '2026-11-06', type: String, nullable: true })
  to: string | null;
}

export class MyMetricsTotalsResponse {
  @ApiProperty({ description: 'completed + inProgress + abandoned' })
  started: number;

  @ApiProperty()
  completed: number;

  @ApiProperty({
    description: 'In progress, with progress in the last staleAfterHours',
  })
  inProgress: number;

  @ApiProperty({
    description: 'In progress, without progress for more than staleAfterHours',
  })
  abandoned: number;

  @ApiProperty({ ...DURATION, example: 840000 })
  avgCompletionMs: number | null;
}

export class MyCurrentStepResponse {
  @ApiProperty({ format: 'uuid' })
  stepId: string;

  @ApiProperty({ example: 3 })
  order: number;

  @ApiProperty({ example: 'Comparar con el reporte del sistema' })
  title: string;
}

export class MyResumeItemResponse {
  @ApiProperty({ format: 'uuid' })
  executionId: string;

  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({ format: 'uuid' })
  procedureVersionId: string;

  @ApiProperty({ type: MyCurrentStepResponse })
  currentStep: MyCurrentStepResponse;

  @ApiProperty({ example: 4 })
  totalSteps: number;

  @ApiProperty({ format: 'date-time' })
  startedAt: string;

  @ApiProperty({
    format: 'date-time',
    description: 'When the current step started: the last time it moved',
  })
  lastActivityAt: string;

  @ApiProperty({
    description:
      'No progress for more than staleAfterHours (counted as abandoned); it can still be resumed',
  })
  stale: boolean;
}

export class MySlowestStepResponse {
  @ApiProperty({ format: 'uuid' })
  stepId: string;

  @ApiProperty({ example: 3 })
  order: number;

  @ApiProperty({ example: 'Comparar con el reporte del sistema' })
  title: string;

  @ApiProperty({ example: 240000, description: 'Milliseconds' })
  avgDurationMs: number;
}

export class MyProcedureResponse {
  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({
    type: [String],
    description: 'Current areas of the procedure',
  })
  areaIds: string[];

  @ApiProperty()
  started: number;

  @ApiProperty()
  completed: number;

  @ApiProperty()
  inProgress: number;

  @ApiProperty()
  abandoned: number;

  @ApiProperty({ ...DURATION, example: 720000 })
  avgCompletionMs: number | null;

  @ApiProperty({ format: 'date-time' })
  lastStartedAt: string;

  @ApiProperty({
    type: MySlowestStepResponse,
    nullable: true,
    description:
      'In the latest version the viewer ran; null if no step finished',
  })
  slowestStep: MySlowestStepResponse | null;
}

export class MyMetricsResponse {
  @ApiProperty({ type: MyMetricsFiltersResponse })
  filters: MyMetricsFiltersResponse;

  @ApiProperty({ example: 24 })
  staleAfterHours: number;

  @ApiProperty({ type: [String], description: "The viewer's active areas" })
  areaIds: string[];

  @ApiProperty({ type: MyMetricsTotalsResponse })
  totals: MyMetricsTotalsResponse;

  @ApiProperty({
    type: [MyResumeItemResponse],
    description:
      'Every execution in progress the viewer can open, whatever the period',
  })
  resume: MyResumeItemResponse[];

  @ApiProperty({
    type: [MyProcedureResponse],
    description: 'The most recently started first',
  })
  procedures: MyProcedureResponse[];
}

const toTotals = (totals: MyTotals): MyMetricsTotalsResponse => ({
  started: totals.started,
  completed: totals.completed,
  inProgress: totals.inProgress,
  abandoned: totals.abandoned,
  avgCompletionMs: totals.avgCompletionMs,
});

const toResumeItem = (item: MyResumeItem): MyResumeItemResponse => ({
  executionId: item.executionId,
  procedureId: item.procedureId,
  procedureVersionId: item.procedureVersionId,
  currentStep: {
    stepId: item.currentStep.stepId,
    order: item.currentStep.order,
    title: item.currentStep.title,
  },
  totalSteps: item.totalSteps,
  startedAt: item.startedAt.toISOString(),
  lastActivityAt: item.lastActivityAt.toISOString(),
  stale: item.stale,
});

const toSlowestStep = (step: MySlowestStep): MySlowestStepResponse => ({
  stepId: step.stepId,
  order: step.order,
  title: step.title,
  avgDurationMs: step.avgDurationMs,
});

const toProcedure = (procedure: MyProcedure): MyProcedureResponse => ({
  procedureId: procedure.procedureId,
  areaIds: [...procedure.areaIds],
  started: procedure.started,
  completed: procedure.completed,
  inProgress: procedure.inProgress,
  abandoned: procedure.abandoned,
  avgCompletionMs: procedure.avgCompletionMs,
  lastStartedAt: procedure.lastStartedAt.toISOString(),
  slowestStep: procedure.slowestStep && toSlowestStep(procedure.slowestStep),
});

export const toMyMetricsResponse = (
  view: MyMetricsView,
): MyMetricsResponse => ({
  filters: {
    areaId: view.filters.areaId,
    from: view.filters.from,
    to: view.filters.to,
  },
  staleAfterHours: view.staleAfterHours,
  areaIds: [...view.areaIds],
  totals: toTotals(view.totals),
  resume: view.resume.map(toResumeItem),
  procedures: view.procedures.map(toProcedure),
});
