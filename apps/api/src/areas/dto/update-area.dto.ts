import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAreaDto {
  @ApiPropertyOptional({ example: 'Recursos Humanos y Talento', description: 'Nuevo nombre del área' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre del área debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre del área no puede superar los 150 caracteres' })
  name?: string;

  @ApiPropertyOptional({ example: false, description: 'Estado activo o inactivo del área' })
  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser un booleano' })
  isActive?: boolean;
}
