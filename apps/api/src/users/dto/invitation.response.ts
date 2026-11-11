import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, type Role } from '../../common/auth';

export class InvitationResponse {
  @ApiProperty({
    description: 'Identificador único de la invitación emitida',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id!: string;

  @ApiProperty({
    description: 'Correo electrónico de la persona invitada',
    example: 'nuevo.usuario@empresa.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Rol global asignado a la invitación',
    enum: ROLES,
    example: 'EMPLOYEE',
  })
  role!: Role;

  @ApiProperty({
    description: 'Identificadores de las áreas organizacionales asignadas',
    type: [String],
    example: ['0a000000-0000-4000-8000-000000000001'],
  })
  areaIds!: string[];

  @ApiProperty({
    description: 'Fecha y hora de expiración de la invitación (48 horas tras su emisión)',
    example: '2026-11-07T12:00:00.000Z',
  })
  expiresAt!: Date;

  @ApiProperty({
    description: 'Fecha y hora de creación de la invitación',
    example: '2026-11-05T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiPropertyOptional({
    description:
      'Enlace de registro directo disponible únicamente en entornos de desarrollo y pruebas locales. En producción se omite por seguridad.',
    example: 'http://localhost:3001/registro#token=AbCdEf123456...',
  })
  invitationUrl?: string;
}
