// Response classes for executions (Swagger) and the field-by-field mapping from the
// service view. There is no userId: an execution is only ever shown to its owner.
import { ApiProperty } from '@nestjs/swagger';
import { ExecutionStatus } from '../../generated/prisma/enums';
import type { ExecutionStepView, ExecutionView } from '../execution.service';

export class ExecutionStepResponse {
  @ApiProperty({ format: 'uuid' })
  stepId: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ example: 'Contar el efectivo' })
  title: string;

  @ApiProperty({
    format: 'date-time',
    type: String,
    nullable: true,
    description: 'null while the step has not started',
  })
  startedAt: string | null;

  @ApiProperty({ format: 'date-time', type: String, nullable: true })
  finishedAt: string | null;

  @ApiProperty({
    example: 180000,
    type: Number,
    nullable: true,
    description: 'finishedAt - startedAt in milliseconds; null until finished',
  })
  durationMs: number | null;
}

export class ExecutionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The version the execution was started with',
  })
  procedureVersionId: string;

  @ApiProperty({ enum: ExecutionStatus })
  status: ExecutionStatus;

  @ApiProperty({ format: 'date-time' })
  startedAt: string;

  @ApiProperty({ format: 'date-time', type: String, nullable: true })
  finishedAt: string | null;

  @ApiProperty({
    format: 'uuid',
    type: String,
    nullable: true,
    description:
      'The step to resume from; null when the execution is completed',
  })
  currentStepId: string | null;

  @ApiProperty({ type: [ExecutionStepResponse] })
  steps: ExecutionStepResponse[];
}

const toIso = (date: Date | null) => (date ? date.toISOString() : null);

const toStepResponse = (step: ExecutionStepView): ExecutionStepResponse => ({
  stepId: step.stepId,
  order: step.order,
  title: step.title,
  startedAt: toIso(step.startedAt),
  finishedAt: toIso(step.finishedAt),
  durationMs: step.durationMs,
});

export const toExecutionResponse = (
  execution: ExecutionView,
): ExecutionResponse => ({
  id: execution.id,
  procedureId: execution.procedureId,
  procedureVersionId: execution.procedureVersionId,
  status: execution.status,
  startedAt: execution.startedAt.toISOString(),
  finishedAt: toIso(execution.finishedAt),
  currentStepId: execution.currentStepId,
  steps: execution.steps.map(toStepResponse),
});
