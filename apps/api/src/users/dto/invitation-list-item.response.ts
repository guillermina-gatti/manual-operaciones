import { ApiProperty } from '@nestjs/swagger';
import type { Role } from '../../common/auth';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export class InvitationListItemResponse {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'nuevo.integrante@empresa.com' })
  email: string;

  @ApiProperty({ enum: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] })
  role: Role;

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] })
  status: InvitationStatus;

  @ApiProperty({ type: [String], example: ['0a000000-0000-4000-8000-000000000001'] })
  areaIds: string[];

  @ApiProperty({ type: [String], example: ['Ventas'] })
  areaNames: string[];

  @ApiProperty({ example: '2026-11-12T15:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-11-14T15:00:00.000Z' })
  expiresAt: Date;

  @ApiProperty({ example: null, nullable: true })
  acceptedAt: Date | null;

  @ApiProperty({ example: null, nullable: true })
  revokedAt: Date | null;

  @ApiProperty({
    type: Object,
    example: { id: '0b000000-0000-4000-8000-000000000001', name: 'Ana Administradora' },
  })
  createdBy: {
    id: string;
    name: string;
  };
}
