// Body of POST /executions: which procedure to run. The user comes from the session.
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartExecutionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The procedure to execute; its currently published version is used',
  })
  @IsUUID('all')
  procedureId: string;
}
