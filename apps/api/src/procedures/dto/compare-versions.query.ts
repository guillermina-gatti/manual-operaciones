/* The two versions to compare (spec 015, R10): ?from=<versionId>&to=<versionId> */
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CompareVersionsQuery {
  @ApiProperty({ format: 'uuid', description: 'La versión de partida' })
  @IsUUID()
  from: string;

  @ApiProperty({ format: 'uuid', description: 'La versión con la que se compara' })
  @IsUUID()
  to: string;
}
