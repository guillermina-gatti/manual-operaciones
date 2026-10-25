/* Datos del cambio de áreas de un documento (spec 003, R3 y R4) */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { toUniqueArray } from './create-document.dto';

export class ChangeAreasDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    description: 'Las áreas que reemplazan a las actuales',
  })
  @Transform(toUniqueArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  areaIds: string[];

  // Si no viene, el responsable actual tiene que seguir teniendo acceso (R4).
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  ownerId?: string;
}
