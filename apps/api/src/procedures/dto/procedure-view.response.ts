// The reads of procedures (spec 006, HU11, P21 to P23): Swagger classes and the mapping from the
// views. There is no ownerId or createdById: they are internal (D10).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProcedureVersionStatus } from '../../generated/prisma/enums';
import type { ProcedureDetailView, ProcedureListItemView } from '../procedure-view';
import type { ProcedureListView } from '../procedure-view.service';
import { VersionStepResponse } from './version-detail.response';

export class ProcedureAreaResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ventas' })
  name: string;

  @ApiProperty({ description: 'false: the area was deactivated (only an ADMIN sees these)' })
  isActive: boolean;
}

// The version a list item or a detail shows.
export class ShownVersionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 2 })
  versionNumber: number;

  @ApiProperty({ enum: ProcedureVersionStatus })
  status: ProcedureVersionStatus;

  @ApiProperty({ example: 'Cierre de caja' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ example: 3 })
  stepCount: number;
}

export class ProcedureDetailVersionResponse extends ShownVersionResponse {
  @ApiProperty({ type: [VersionStepResponse], description: 'In order' })
  steps: VersionStepResponse[];
}

export class ProcedureListItemResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: ShownVersionResponse, description: 'The current version (an ADMIN also sees a draft that was never published)' })
  version: ShownVersionResponse;

  @ApiProperty({ type: [ProcedureAreaResponse] })
  areas: ProcedureAreaResponse[];

  @ApiPropertyOptional({ description: 'Only for an ADMIN' })
  hasOpenDraft?: boolean;
}

export class ProcedureListPageResponse {
  @ApiProperty({ type: [ProcedureListItemResponse], description: 'Newest first' })
  data: ProcedureListItemResponse[];

  @ApiProperty({ example: 41 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

export class ProcedureDetailResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: [ProcedureAreaResponse] })
  areas: ProcedureAreaResponse[];

  @ApiPropertyOptional({ description: 'Only for an ADMIN' })
  hasOpenDraft?: boolean;

  @ApiProperty({
    type: ProcedureDetailVersionResponse,
    description: 'An ADMIN: the open draft or, if none, the current one. The others: the current one',
  })
  version: ProcedureDetailVersionResponse;
}

const toListItem = ({ shown, createdAt, ...item }: ProcedureListItemView): ProcedureListItemResponse => ({
  ...item,
  createdAt: createdAt.toISOString(),
  version: shown,
});

export const toProcedureListPage = (
  list: ProcedureListView,
  page: number,
  limit: number,
): ProcedureListPageResponse => ({
  data: list.data.map(toListItem),
  total: list.total,
  page,
  limit,
});

export const toProcedureDetailResponse = ({
  createdAt,
  ...detail
}: ProcedureDetailView): ProcedureDetailResponse => ({
  ...detail,
  createdAt: createdAt.toISOString(),
});
