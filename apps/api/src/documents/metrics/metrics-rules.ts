/* Reglas de las métricas de documentos (spec 007, plan 2). Es el único archivo de documentos que
importa de src/executions: las reglas de alcance, período y fechas son las de las métricas de
procedimientos de la pareja B (P3), importadas sin modificarlas (D3). Si la pareja B las mueve,
se cambia solo este archivo; metrics-rules.spec.ts fija el comportamiento del que dependemos. */
import type { MetricsScope } from '../../executions/metrics/metrics-access.policy';

export { metricsScope } from '../../executions/metrics/metrics-access.policy';
export type { MetricsScope } from '../../executions/metrics/metrics-access.policy';
export {
  isCalendarDate,
  toMetricsPeriod,
} from '../../executions/metrics/metrics-period';

// R2: las áreas por las que se cuenta; null = todas (ADMIN sin areaId), como SearchScope (spec 004).
export function documentMetricsAreaIds(scope: MetricsScope): string[] | null {
  return scope.all ? null : scope.areaIds;
}
