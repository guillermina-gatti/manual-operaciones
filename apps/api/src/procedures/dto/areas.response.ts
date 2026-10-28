// Response class for the areas of a procedure (Swagger).
import { ApiProperty } from '@nestjs/swagger';

export class AreasResponse {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'The areas of the procedure after the change, by id',
  })
  areaIds: string[];
}
