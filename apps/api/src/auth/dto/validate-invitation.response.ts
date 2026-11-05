import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '../../common/auth';

export class ValidateInvitationResponse {
  @ApiProperty({
    description: 'Indica si la invitación es válida y se encuentra disponible para su consumo',
    example: true,
  })
  valid!: boolean;

  @ApiProperty({
    description: 'Correo electrónico de la persona invitada',
    example: 'usuario@empresa.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Rol global que se le asignará al usuario al registrarse',
    enum: ROLES,
    example: 'EMPLOYEE',
  })
  role!: Role;
}
