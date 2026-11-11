/* Read the history and one version of a procedure (spec 015, R8 and R9) */
import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { UsersDirectory } from '../documents/ports/users-directory';
import { procedureNotFound, runAsAdmin } from './version-operation';
import { VersionsRepository } from './versions.repository';
import type {
  VersionDetailRecord,
  VersionHistoryRecord,
  WithPublisherName,
} from './versions.repository';

export interface VersionsPageView {
  data: WithPublisherName<VersionHistoryRecord>[];
  total: number;
}

type Names = Map<string, string | null>;

function withName<T extends VersionHistoryRecord>(version: T, names: Names): WithPublisherName<T> {
  const name = version.publishedById ? names.get(version.publishedById) : null;
  return { ...version, publishedByName: name ?? null };
}

@Injectable()
export class ProcedureHistoryService {
  private readonly logger = new Logger(ProcedureHistoryService.name);

  constructor(
    private readonly versions: VersionsRepository,
    private readonly users: UsersDirectory,
  ) {}

  list(user: AuthUser, procedureId: string, page: number, limit: number): Promise<VersionsPageView> {
    return runAsAdmin('listVersions', user, this.logger, async () => {
      const found = await this.versions.list(procedureId, page, limit);
      if (!found) throw procedureNotFound();
      const names = await this.namesOf(found.data);
      return { data: found.data.map((version) => withName(version, names)), total: found.total };
    });
  }

  getVersion(
    user: AuthUser,
    procedureId: string,
    versionId: string,
  ): Promise<WithPublisherName<VersionDetailRecord>> {
    return runAsAdmin('getVersion', user, this.logger, async () => {
      const found = await this.versions.findVersion(procedureId, versionId);
      if (!found) throw procedureNotFound();
      return withName(found, await this.namesOf([found]));
    });
  }

  // D6: one question to the directory for each different person, not for each version.
  private async namesOf(versions: VersionHistoryRecord[]): Promise<Names> {
    const ids = new Set(versions.flatMap((version) => version.publishedById ?? []));
    const entries = await Promise.all(
      [...ids].map(async (id) => [id, (await this.users.findById(id))?.name ?? null] as const),
    );
    return new Map(entries);
  }
}
