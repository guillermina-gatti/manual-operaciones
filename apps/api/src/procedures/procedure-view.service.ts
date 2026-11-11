/* List and read the procedures that the user can see (spec 006, HU11: R13 to R16 and P20 to P24) */
import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { UsersDirectory } from '../documents/ports/users-directory';
import { toHttpException } from './http-errors';
import { canViewProcedure, currentVersion } from './procedure-access.policy';
import { ProcedureListRepository } from './procedure-list.repository';
import { areaViews } from './procedure-view';
import type { ProcedureDetailView, ProcedureListItemView } from './procedure-view';
import { procedureViewerFor } from './procedure-viewer';
import { ProceduresRepository } from './procedures.repository';
import type { ProcedureRecord } from './procedures.repository';
import { procedureNotFound } from './version-operation';
import { VersionsRepository } from './versions.repository';

export interface ProcedureListView {
  data: ProcedureListItemView[];
  total: number;
}

// P22: an ADMIN sees the open draft, or the current version if there is none; the others, the
// current one.
function versionToShow(user: AuthUser, procedure: ProcedureRecord) {
  const draft = procedure.versions.find((version) => version.status === 'DRAFT');
  return user.role === 'ADMIN' && draft ? draft : currentVersion(procedure.versions);
}

@Injectable()
export class ProcedureViewService {
  private readonly logger = new Logger(ProcedureViewService.name);

  constructor(
    private readonly listing: ProcedureListRepository,
    private readonly procedures: ProceduresRepository,
    private readonly versions: VersionsRepository,
    private readonly users: UsersDirectory,
    private readonly areas: AreasDirectory,
  ) {}

  async list(user: AuthUser, page: number, limit: number): Promise<ProcedureListView> {
    try {
      const viewer = await procedureViewerFor(this.users, user);
      const found = await this.listing.list(viewer, page, limit);
      // P21: one call to the directory for the whole page.
      const ids = [...new Set(found.data.flatMap((item) => item.areaIds))];
      const named = ids.length > 0 ? await this.areas.findByIds(ids) : [];
      const data = found.data.map(({ areaIds, hasOpenDraft, ...item }) => ({
        ...item,
        areas: areaViews(user.role, areaIds, named),
        ...(user.role === 'ADMIN' && { hasOpenDraft }),
      }));
      return { data, total: found.total };
    } catch (error) {
      throw toHttpException(error, this.logger, 'listProcedures');
    }
  }

  async get(user: AuthUser, id: string): Promise<ProcedureDetailView> {
    try {
      // The viewer first and the procedure after, always: if it stopped early for a missing id, the
      // difference in time would show which ones exist.
      const viewer = await procedureViewerFor(this.users, user);
      const procedure = await this.procedures.findById(id);
      if (!procedure || !canViewProcedure(viewer, procedure)) throw procedureNotFound();
      const shown = versionToShow(user, procedure);
      const version = shown && (await this.versions.findVersion(id, shown.id));
      if (!version) throw procedureNotFound();

      const named = await this.areas.findByIds(procedure.areaIds);
      return {
        id: procedure.id,
        createdAt: procedure.createdAt,
        areas: areaViews(user.role, procedure.areaIds, named),
        ...(user.role === 'ADMIN' && {
          hasOpenDraft: procedure.versions.some((item) => item.status === 'DRAFT'),
        }),
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          status: version.status,
          title: version.title,
          description: version.description,
          stepCount: version.stepCount,
          steps: version.steps,
        },
      };
    } catch (error) {
      throw toHttpException(error, this.logger, 'getProcedure');
    }
  }
}
