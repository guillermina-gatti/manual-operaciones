// Spec 010 (R2): la forma del contexto del paso. Lo usan las dos rutas a través de ChatRequestDto.
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ChatContextDto {
    @ApiProperty({ format: 'uuid', description: 'La versión del procedimiento (la de la ejecución)' })
    @IsUUID()
    procedureVersionId!: string;

    @ApiProperty({ format: 'uuid', description: 'El paso de esa versión' })
    @IsUUID()
    stepId!: string;
}
