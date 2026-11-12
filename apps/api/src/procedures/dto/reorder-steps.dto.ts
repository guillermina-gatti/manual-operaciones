/* The new order of the steps of a draft (spec 006, R8). That the list holds exactly the steps of
the draft, once each, is checked by reorderSteps */
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderStepsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Every step of the draft, in the new order',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  stepIds: string[];
}
