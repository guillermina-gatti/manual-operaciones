// One version with its steps (spec 015, R9): Swagger classes and the mapping from the record.
import { ApiProperty } from '@nestjs/swagger';
import type { VersionDetailRecord, WithPublisherName } from '../versions.repository';
import { VersionHistoryItemResponse, toVersionHistoryItem } from './version-history.response';

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

export const toVersionDetailResponse = (
  version: WithPublisherName<VersionDetailRecord>,
): VersionDetailResponse => {
  // Plain fields, so the spread does not copy a class instance.
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
