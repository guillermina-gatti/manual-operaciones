/* Use cases of versions (spec 015): publish a draft, read the history and read one version. Every
error leaves as HTTP, like procedure-draft.service.ts */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { UsersDirectory } from '../documents/ports/users-directory';
import type { PublishVersionDto } from './dto/publish-version.dto';
import { toHttpException } from './http-errors';
import type { ProcedureOperation } from './http-errors';
import { canManage } from './procedure-access.policy';
import { VersionsRepository } from './versions.repository';
import type {
  PublishRejection,
  VersionDetailRecord,
  VersionHistoryRecord,
  WithPublisherName,
} from './versions.repository';

// The same error and message for a procedure that does not exist and for a version that is not in it.
const procedureNotFound = () => new NotFoundException('No se encontró el procedimiento');

const conflict = (reason: string, message: string) =>
  new ConflictException({ statusCode: 409, message, error: 'Conflict', reason });

const CONFLICT_MESSAGES = {
  VERSION_NOT_DRAFT: 'Solo se puede publicar una versión en borrador',
  NO_STEPS: 'No se puede publicar una versión sin pasos',
  NO_AREAS: 'No se puede publicar un procedimiento sin áreas',
} as const;

export interface VersionsPageView {
  data: WithPublisherName<VersionHistoryRecord>[];
  total: number;
}

@Injectable()
export class ProcedureVersionsService {
  private readonly logger = new Logger(ProcedureVersionsService.name);

  constructor(
    private readonly versions: VersionsRepository,
    private readonly users: UsersDirectory,
  ) {}

  // R2 to R5: publishes the draft; whoever publishes is the caller, at the time of the request.
  publish(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    dto: PublishVersionDto,
  ): Promise<WithPublisherName<VersionHistoryRecord>> {
    return this.run('publish', user, async () => {
      const result = await this.versions.publish({
        procedureId,
        versionId,
        publishedById: user.id,
        publishedAt: new Date(),
        isCritical: dto.isCritical ?? false,
        changeSummary: dto.changeSummary ?? null,
      });
      if (!result.ok) throw this.rejection(result.reason);
      return { ...result.value, publishedByName: user.name };
    });
  }

  // R8: one page of the history, with the name of who published each version.
  list(
    user: AuthUser,
    procedureId: string,
    page: number,
    limit: number,
  ): Promise<VersionsPageView> {
    return this.run('listVersions', user, async () => {
      const found = await this.versions.list(procedureId, page, limit);
      if (!found) throw procedureNotFound();
      const names = await this.namesOf(found.data);
      return {
        data: found.data.map((version) => withName(version, names)),
        total: found.total,
      };
    });
  }

  // R9: one version with its steps.
  getVersion(
    user: AuthUser,
    procedureId: string,
    versionId: string,
  ): Promise<WithPublisherName<VersionDetailRecord>> {
    return this.run('getVersion', user, async () => {
      const found = await this.versions.findVersion(procedureId, versionId);
      if (!found) throw procedureNotFound();
      return withName(found, await this.namesOf([found]));
    });
  }

  // D6: one question to the directory for each different person, not for each version.
  private async namesOf(
    versions: VersionHistoryRecord[],
  ): Promise<Map<string, string | null>> {
    const ids = new Set<string>();
    for (const version of versions) {
      if (version.publishedById) ids.add(version.publishedById);
    }
    const entries = await Promise.all(
      [...ids].map(
        async (id) => [id, (await this.users.findById(id))?.name ?? null] as const,
      ),
    );
    return new Map(entries);
  }

  private rejection(reason: PublishRejection) {
    switch (reason) {
      case 'NOT_FOUND':
        return procedureNotFound();
      case 'NOT_A_DRAFT':
        return conflict('VERSION_NOT_DRAFT', CONFLICT_MESSAGES.VERSION_NOT_DRAFT);
      case 'NO_STEPS':
        return conflict('NO_STEPS', CONFLICT_MESSAGES.NO_STEPS);
      case 'NO_AREAS':
        return conflict('NO_AREAS', CONFLICT_MESSAGES.NO_AREAS);
    }
  }

  // R1: only an ADMIN gets here (the controller's guard says it too). Every error leaves as HTTP.
  private async run<T>(
    operation: ProcedureOperation,
    user: AuthUser,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      if (!canManage(user.role)) {
        throw new ForbiddenException('No tenés permiso para ver ni publicar versiones');
      }
      return await work();
    } catch (error) {
      throw toHttpException(error, this.logger, operation);
    }
  }
}

function withName<T extends VersionHistoryRecord>(
  version: T,
  names: Map<string, string | null>,
): WithPublisherName<T> {
  return {
    ...version,
    publishedByName: version.publishedById ? (names.get(version.publishedById) ?? null) : null,
  };
}
