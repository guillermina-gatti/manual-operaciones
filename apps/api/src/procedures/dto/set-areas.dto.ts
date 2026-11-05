/* The areas of a procedure (spec 006, R11). They replace the current ones; none is allowed */
import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetAreasDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'The areas that replace the current ones; may be empty, no repeats',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  areaIds: string[];
}
