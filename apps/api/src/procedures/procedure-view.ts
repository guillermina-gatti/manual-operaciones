/* What the reads of procedures give back (spec 006, P21 to P23): the records with the areas named */
import type { Role } from '../common/auth';
import type { DirectoryArea } from '../documents/ports/areas-directory';
import type { ListedVersion } from './procedure-list.repository';
import type { VersionStepRecord } from './versions.repository';

export interface AreaView {
  id: string;
  name: string;
  isActive: boolean;
}

// hasOpenDraft is only for the ADMIN (P21).
export interface ProcedureListItemView {
  id: string;
  createdAt: Date;
  shown: ListedVersion;
  areas: AreaView[];
  hasOpenDraft?: boolean;
}

export interface ProcedureDetailView {
  id: string;
  createdAt: Date;
  areas: AreaView[];
  hasOpenDraft?: boolean;
  version: ListedVersion & { steps: VersionStepRecord[] };
}

// P23: the ADMIN sees every area the procedure keeps, with its state; the others only the active
// ones (P20). The ones the directory does not know are left out. By name, so the order is stable.
export function areaViews(
  role: Role,
  areaIds: string[],
  found: DirectoryArea[],
): AreaView[] {
  const wanted = new Set(areaIds);
  return found
    .filter((area) => wanted.has(area.id) && (role === 'ADMIN' || area.isActive))
    .map(({ id, name, isActive }) => ({ id, name, isActive }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
