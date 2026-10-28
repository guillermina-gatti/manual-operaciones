// Response classes for procedures and versions (Swagger) and the field-by-field mapping from the
// repository records. There is no ownerId or createdById: they are internal (D10).
import { ApiProperty } from '@nestjs/swagger';
import { ProcedureVersionStatus } from '../../generated/prisma/enums';
import type { ProcedureRecord, VersionRecord } from '../procedures.repository';

export class VersionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({ example: 1 })
  versionNumber: number;

  @ApiProperty({ enum: ProcedureVersionStatus })
  status: ProcedureVersionStatus;

  @ApiProperty({ example: 'Cierre de caja' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ example: 3 })
  stepCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class ProcedureResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  areaIds: string[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;

  @ApiProperty({
    type: [VersionResponse],
    description: 'By ascending version number',
  })
  versions: VersionResponse[];
}

export const toVersionResponse = (version: VersionRecord): VersionResponse => ({
  id: version.id,
  procedureId: version.procedureId,
  versionNumber: version.versionNumber,
  status: version.status,
  title: version.title,
  description: version.description,
  stepCount: version.stepCount,
  createdAt: version.createdAt.toISOString(),
  updatedAt: version.updatedAt.toISOString(),
});

export const toProcedureResponse = (
  procedure: ProcedureRecord,
): ProcedureResponse => ({
  id: procedure.id,
  areaIds: procedure.areaIds,
  createdAt: procedure.createdAt.toISOString(),
  updatedAt: procedure.updatedAt.toISOString(),
  versions: procedure.versions.map(toVersionResponse),
});
