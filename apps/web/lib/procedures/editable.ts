// A procedure as the editor holds it (spec 006, W6): what GET /api/procedures/:id answered, plus the
// changes the API accepted afterwards (see snapshot.ts). It lives in memory: there is no copy in the
// browser storage (P25).
import type { ProcedureDetail } from '@/lib/api/procedure-view';
import type { ProcedureVersionStatus } from '@/lib/api/procedures';

export interface EditableStep {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface EditableProcedure {
  id: string;
  // The version the screens work on: the open draft or, if there is none, the current one.
  versionId: string;
  versionNumber: number;
  // The state of that version. A draft if it is missing.
  status?: ProcedureVersionStatus;
  title: string;
  description: string | null;
  areaIds: string[];
  steps: EditableStep[];
  createdAt: string;
}

// The answer of the API, ready to edit. The steps are new objects, so changing the result does not
// change the answer; they keep the order the API gave, by number.
export function fromDetail(detail: ProcedureDetail): EditableProcedure {
  const { version } = detail;
  return {
    id: detail.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    title: version.title,
    description: version.description,
    areaIds: detail.areas.map((area) => area.id),
    steps: version.steps.map((step) => ({ ...step })).sort((a, b) => a.order - b.order),
    createdAt: detail.createdAt,
  };
}
