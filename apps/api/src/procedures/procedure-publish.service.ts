/* Publish a draft (spec 015, R2 to R5) */
import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import type { PublishVersionDto } from './dto/publish-version.dto';
import { PublishRepository } from './publish.repository';
import type { PublishRejection } from './publish.repository';
import { conflict, procedureNotFound, runAsAdmin } from './version-operation';
import type { VersionHistoryRecord, WithPublisherName } from './versions.repository';

const CONFLICTS = {
  NOT_A_DRAFT: ['VERSION_NOT_DRAFT', 'Solo se puede publicar una versión en borrador'],
  NO_STEPS: ['NO_STEPS', 'No se puede publicar una versión sin pasos'],
  NO_AREAS: ['NO_AREAS', 'No se puede publicar un procedimiento sin áreas'],
} as const;

// R3: 404 if it is not there; 409 with its reason otherwise.
function rejection(reason: PublishRejection) {
  if (reason === 'NOT_FOUND') return procedureNotFound();
  const [code, message] = CONFLICTS[reason];
  return conflict(code, message);
}

@Injectable()
export class ProcedurePublishService {
  private readonly logger = new Logger(ProcedurePublishService.name);

  constructor(private readonly publisher: PublishRepository) {}

  // The caller publishes, at the time of the request (R2).
  publish(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    dto: PublishVersionDto,
  ): Promise<WithPublisherName<VersionHistoryRecord>> {
    return runAsAdmin('publish', user, this.logger, async () => {
      const result = await this.publisher.publish({
        procedureId,
        versionId,
        publishedById: user.id,
        publishedAt: new Date(),
        isCritical: dto.isCritical ?? false,
        changeSummary: dto.changeSummary ?? null,
      });
      if (!result.ok) throw rejection(result.reason);
      return { ...result.value, publishedByName: user.name };
    });
  }
}
