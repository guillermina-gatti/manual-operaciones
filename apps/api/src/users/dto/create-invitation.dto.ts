import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ROLES, type Role } from '../../common/auth';

export class CreateInvitationDto {
  @ApiProperty({
    description: 'Correo electrónico de la persona invitada',
    example: 'nuevo.usuario@empresa.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
  email!: string;

  @ApiProperty({
    description: 'Rol global que se le asignará al usuario al registrarse',
    enum: ROLES,
    example: 'EMPLOYEE',
  })
  @IsIn(ROLES, { message: 'El rol debe ser ADMIN, SUPERVISOR o EMPLOYEE' })
  role!: Role;

  @ApiPropertyOptional({
    description: 'Identificadores UUID v4 de las áreas organizacionales asignadas',
    type: [String],
    example: ['0a000000-0000-4000-8000-000000000001'],
  })
  @IsOptional()
  @IsArray({ message: 'areaIds debe ser un array de identificadores' })
  @IsUUID('4', {
    each: true,
    message: 'Cada área debe ser un identificador UUID v4 válido',
  })
  areaIds?: string[];
}
