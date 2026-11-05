// "Detalle por área" (HU38): the procedures of the period grouped by area. A procedure with two
// areas is shown in both, so the area numbers must never be added up to get the general ones:
// those come from the API totals (see summary.ts).
import type { ExecutionCounts, ProcedureMetricsResponse } from '@/lib/api';
import type { Area } from '@/lib/directory';
import { displayAreaName } from '@/lib/directory/areas-directory';
import { averageCompletionMs } from './summary';

export interface AreaGroup {
  areaId: string;
  name: string;
  procedures: ProcedureMetricsResponse[];
  counts: ExecutionCounts;
  avgCompletionMs: number | null;
}

export interface AreaGroups {
  groups: AreaGroup[];
  // Areas that could be shown but have no executions in the period; only counted without an
  // area filter (with one, the empty state of the panel says it).
  withoutExecutions: number;
}

interface GroupOptions {
  // The area of the filter, if any: only that one is shown.
  areaId: string | null;
  // The areas the viewer may see; null means any (ADMIN).
  viewerAreaIds: string[] | null;
}

// An area the directory does not know (or that did not load) still gets a distinguishable name.
function areaName(areaId: string, areas: Area[]): string {
  const area = areas.find((candidate) => candidate.id === areaId);
  return area ? displayAreaName(area) : `Área ${areaId.slice(-6).toUpperCase()}`;
}

export function groupByArea(
  procedures: ProcedureMetricsResponse[],
  areas: Area[],
  { areaId, viewerAreaIds }: GroupOptions,
): AreaGroups {
  const shown = (id: string) =>
    areaId ? id === areaId : viewerAreaIds === null || viewerAreaIds.includes(id);

  const byArea = new Map<string, ProcedureMetricsResponse[]>();
  for (const procedure of procedures) {
    for (const id of new Set(procedure.areaIds)) {
      if (shown(id)) byArea.set(id, [...(byArea.get(id) ?? []), procedure]);
    }
  }

  // In the order of the directory; areas it does not know go last.
  const position = (id: string) => {
    const index = areas.findIndex((area) => area.id === id);
    return index === -1 ? areas.length : index;
  };
  const groups = [...byArea.entries()]
    .sort(([a], [b]) => position(a) - position(b))
    .map(([id, list]) => ({
      areaId: id,
      name: areaName(id, areas),
      procedures: list,
      counts: {
        started: sum(list, (p) => p.started),
        completed: sum(list, (p) => p.completed),
        inProgress: sum(list, (p) => p.inProgress),
        abandoned: sum(list, (p) => p.abandoned),
      },
      avgCompletionMs: averageCompletionMs(list),
    }));

  // Inactive areas do not count as "without executions": nothing new runs in them.
  const candidates = areaId
    ? []
    : viewerAreaIds === null
      ? areas.filter((area) => area.isActive !== false).map((area) => area.id)
      : viewerAreaIds;
  const withoutExecutions = candidates.filter((id) => !byArea.has(id)).length;

  return { groups, withoutExecutions };
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
