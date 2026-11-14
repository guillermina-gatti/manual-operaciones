import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'Recursos Humanos', description: 'Nombre único del área' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del área es obligatorio' })
  @MinLength(2, { message: 'El nombre del área debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre del área no puede superar los 150 caracteres' })
  name!: string;
}
