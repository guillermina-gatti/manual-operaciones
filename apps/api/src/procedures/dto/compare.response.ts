// The result of comparing two versions (spec 015, R10): Swagger classes and the mapping field by
// field, so the step key (internal) never leaves.
import { ApiProperty } from '@nestjs/swagger';
import { ProcedureVersionStatus } from '../../generated/prisma/enums';
import type { ChangedField, ComparedStep, Comparison, ModifiedStep } from '../version-compare';

export class ComparedVersionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 2 })
  versionNumber: number;

  @ApiProperty({ enum: ProcedureVersionStatus })
  status: ProcedureVersionStatus;
}

export class ComparedStepResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ example: 'Contar el efectivo' })
  title: string;

  @ApiProperty({ example: 'Billetes y monedas', description: 'Empty if none' })
  description: string;
}

export class ModifiedStepResponse {
  @ApiProperty({ type: ComparedStepResponse })
  before: ComparedStepResponse;

  @ApiProperty({ type: ComparedStepResponse })
  after: ComparedStepResponse;

  @ApiProperty({ enum: ['title', 'description', 'order'], isArray: true })
  changedFields: ChangedField[];
}

export class CompareResponse {
  @ApiProperty({ type: ComparedVersionResponse })
  from: ComparedVersionResponse;

  @ApiProperty({ type: ComparedVersionResponse })
  to: ComparedVersionResponse;

  @ApiProperty({ type: [ComparedStepResponse], description: 'In `to` and not in `from`' })
  added: ComparedStepResponse[];

  @ApiProperty({ type: [ComparedStepResponse], description: 'In `from` and not in `to`' })
  removed: ComparedStepResponse[];

  @ApiProperty({ type: [ModifiedStepResponse] })
  modified: ModifiedStepResponse[];

  @ApiProperty({ example: 3, description: 'How many steps are the same in both' })
  unchanged: number;
}

const step = ({ id, order, title, description }: ComparedStep): ComparedStepResponse => ({
  id,
  order,
  title,
  description,
});

const modified = ({ before, after, changedFields }: ModifiedStep): ModifiedStepResponse => ({
  before: step(before),
  after: step(after),
  changedFields: [...changedFields],
});

const version = ({ id, versionNumber, status }: Comparison['from']): ComparedVersionResponse => ({
  id,
  versionNumber,
  status,
});

export const toCompareResponse = (comparison: Comparison): CompareResponse => ({
  from: version(comparison.from),
  to: version(comparison.to),
  added: comparison.added.map(step),
  removed: comparison.removed.map(step),
  modified: comparison.modified.map(modified),
  unchanged: comparison.unchanged,
});
