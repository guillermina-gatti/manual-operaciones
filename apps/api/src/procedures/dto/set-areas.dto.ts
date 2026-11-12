/* The areas of a procedure (spec 006, R11). They replace the current ones; none is allowed */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { lowerCaseIds } from './transforms';

export class SetAreasDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: 100,
    description:
      'The areas that replace the current ones; may be empty, no repeats, up to 100',
  })
  @Transform(lowerCaseIds)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  areaIds: string[];
}
