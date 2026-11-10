// Response classes for the history and the detail of a version (Swagger) and the field-by-field
// mapping from the repository records (spec 015, R8 and R9). There is no createdById: it is internal.
import { ApiProperty } from '@nestjs/swagger';
import { ProcedureVersionStatus } from '../../generated/prisma/enums';
import type {
  VersionDetailRecord,
  VersionHistoryRecord,
  VersionsPage,
  WithPublisherName,
} from '../versions.repository';

export class VersionPublisherResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true, description: 'null if the directory does not know them' })
  name: string | null;
}

export class VersionHistoryItemResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({ example: 2 })
  versionNumber: number;

  @ApiProperty({ enum: ProcedureVersionStatus })
  status: ProcedureVersionStatus;

  @ApiProperty({ example: 'Cierre de caja' })
  title: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({ type: VersionPublisherResponse, nullable: true })
  publishedBy: VersionPublisherResponse | null;

  @ApiProperty()
  isCritical: boolean;

  @ApiProperty({ type: String, nullable: true })
  changeSummary: string | null;

  @ApiProperty({ example: 3 })
  stepCount: number;
}

export class VersionStepResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 1, description: 'Place in the version, from 1' })
  order: number;

  @ApiProperty({ example: 'Contar el efectivo' })
  title: string;

  @ApiProperty({ example: 'Billetes y monedas', description: 'Empty if none' })
  description: string;
}

export class VersionDetailResponse extends VersionHistoryItemResponse {
  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: [VersionStepResponse], description: 'In order' })
  steps: VersionStepResponse[];
}

export class VersionHistoryPageResponse {
  @ApiProperty({ type: [VersionHistoryItemResponse], description: 'Newest first' })
  data: VersionHistoryItemResponse[];

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

export const toVersionHistoryItem = (
  version: WithPublisherName<VersionHistoryRecord>,
): VersionHistoryItemResponse => ({
  id: version.id,
  procedureId: version.procedureId,
  versionNumber: version.versionNumber,
  status: version.status,
  title: version.title,
  createdAt: version.createdAt.toISOString(),
  publishedAt: version.publishedAt?.toISOString() ?? null,
  publishedBy: version.publishedById
    ? { id: version.publishedById, name: version.publishedByName }
    : null,
  isCritical: version.isCritical,
  changeSummary: version.changeSummary,
  stepCount: version.stepCount,
});

export const toVersionDetailResponse = (
  version: WithPublisherName<VersionDetailRecord>,
): VersionDetailResponse => {
  // As plain fields, so the spread does not copy a class instance.
  const item: Pick<VersionHistoryItemResponse, keyof VersionHistoryItemResponse> =
    toVersionHistoryItem(version);
  return {
    ...item,
    description: version.description,
    steps: version.steps.map((step) => ({
      id: step.id,
      order: step.order,
      title: step.title,
      description: step.description,
    })),
  };
};

export const toVersionHistoryPage = (
  page: { data: WithPublisherName<VersionHistoryRecord>[]; total: VersionsPage['total'] },
  pageNumber: number,
  limit: number,
): VersionHistoryPageResponse => ({
  data: page.data.map(toVersionHistoryItem),
  total: page.total,
  page: pageNumber,
  limit,
});
