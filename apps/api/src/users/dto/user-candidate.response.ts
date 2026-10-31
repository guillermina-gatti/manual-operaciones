import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '../../common/auth';

// A-06.3: solo estos campos son públicos. isActive se utiliza para filtrar, NO se expone.
export class UserCandidateResponse {
  @ApiProperty({ format: 'uuid', example: '0b000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({ example: 'Ana Administradora' })
  name!: string;

  @ApiProperty({ enum: ROLES, example: 'ADMIN' })
  role!: Role;
}
