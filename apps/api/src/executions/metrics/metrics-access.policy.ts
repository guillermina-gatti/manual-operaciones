/* Who sees the metrics of which procedures (HU38; permissions matrix, "Auditoría y
métricas"): ADMIN every area, SUPERVISOR only their own, EMPLOYEE none */
import type { Role } from '../../common/auth';

// The procedures in view: all of them, or those sharing an area with areaIds.
export type MetricsScope = { all: true } | { all: false; areaIds: string[] };

// null: the viewer cannot see what they asked for, answered with a 404 like any other
// resource of someone else. Areas come from UsersDirectory, never from the session.
export function metricsScope(
  role: Role,
  viewerAreaIds: string[],
  requestedAreaId?: string,
): MetricsScope | null {
  if (role === 'ADMIN') {
    return requestedAreaId
      ? { all: false, areaIds: [requestedAreaId] }
      : { all: true };
  }
  if (role === 'SUPERVISOR') {
    if (!requestedAreaId) return { all: false, areaIds: viewerAreaIds };
    return viewerAreaIds.includes(requestedAreaId)
      ? { all: false, areaIds: [requestedAreaId] }
      : null;
  }
  return null;
}

// A procedure is in view if it currently has at least one area of the scope.
export function inScope(
  scope: MetricsScope,
  procedureAreaIds: string[],
): boolean {
  return scope.all || procedureAreaIds.some((id) => scope.areaIds.includes(id));
}

// The areas the viewer may filter by; null means any area (ADMIN).
export function filterableAreaIds(
  role: Role,
  viewerAreaIds: string[],
): string[] | null {
  return role === 'ADMIN' ? null : viewerAreaIds;
}
