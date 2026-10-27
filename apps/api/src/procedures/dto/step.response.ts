// Response class for a step (Swagger) and the field-by-field mapping from the repository record.
import { ApiProperty } from '@nestjs/swagger';
import type { StepRecord } from '../procedures.repository';

export class StepResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  procedureVersionId: string;

  @ApiProperty({ example: 1, description: 'Place in the version, from 1' })
  order: number;

  @ApiProperty({ example: 'Contar el efectivo' })
  title: string;

  @ApiProperty({ example: 'Billetes y monedas', description: 'Empty if none' })
  description: string;
}

export const toStepResponse = (step: StepRecord): StepResponse => ({
  id: step.id,
  procedureVersionId: step.procedureVersionId,
  order: step.order,
  title: step.title,
  description: step.description,
});
