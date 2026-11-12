import { ApiProperty } from '@nestjs/swagger';
import type { Role } from '../../common/auth';

export class AdminUserAreaResponse {
  @ApiProperty({ example: '0a000000-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'Ventas' })
  name: string;
}

export class AdminUserResponse {
  @ApiProperty({ example: '0b000000-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'Sergio Supervisor de Ventas' })
  name: string;

  @ApiProperty({ example: 'sergio@empresa.com' })
  email: string;

  @ApiProperty({ enum: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] })
  role: Role;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: [AdminUserAreaResponse] })
  areas: AdminUserAreaResponse[];

  @ApiProperty({ example: '2026-11-12T15:00:00.000Z' })
  createdAt: Date;
}
