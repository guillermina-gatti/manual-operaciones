/* Port to publish a draft (spec 015, R2 to R4), without depending on Prisma */
import type { VersionHistoryRecord } from './versions.repository';

export interface PublishData {
  procedureId: string;
  versionId: string;
  publishedById: string;
  publishedAt: Date;
  isCritical: boolean;
  changeSummary: string | null;
}

// Why a version was not published (R3).
export type PublishRejection = 'NOT_FOUND' | 'NOT_A_DRAFT' | 'NO_STEPS' | 'NO_AREAS';

export type PublishResult =
  | { ok: true; value: VersionHistoryRecord }
  | { ok: false; reason: PublishRejection };

export abstract class PublishRepository {
  // One transaction with the procedure locked (R4): the PUBLISHED one becomes SUPERSEDED.
  // NOT_A_DRAFT also when another request published the version first.
  abstract publish(data: PublishData): Promise<PublishResult>;
}
