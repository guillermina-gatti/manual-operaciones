import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// En multipart, un área sola llega como texto y varias como arreglo.
const toUniqueArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return value;
  return [...new Set(Array.isArray(value) ? value : [value])];
};

// Datos de la carga (R4). El archivo llega aparte, por el FileInterceptor.
export class CreateDocumentDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Manual de caja' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    description: 'Se repite el campo una vez por área',
  })
  @Transform(toUniqueArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  areaIds: string[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  ownerId: string;

  // Queda como texto: la comparación con "mañana" (R6, D1) la hace el servicio.
  @ApiProperty({ format: 'date', example: '2027-03-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reviewDate tiene que tener el formato YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  reviewDate: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
