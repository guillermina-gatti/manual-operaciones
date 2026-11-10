// The name of a procedure in the metrics panel. The API only gives its id: the name comes from the
// sample procedures, and a procedure that is not there gets "Procedimiento" plus a short code of
// its id, so two of them never look the same ("Procedimiento 00000A", "Procedimiento 2B81DE").
// TODO(HU38): use the procedure title once Mica's catalog gives it through the metrics API.
import { SAMPLE_PROCEDURES } from '@/lib/executions/sample-procedures';

export function metricsProcedureName(procedureId: string): string {
  const sample = SAMPLE_PROCEDURES.find((procedure) => procedure.id === procedureId);
  return sample?.name ?? `Procedimiento ${procedureId.slice(-6).toUpperCase()}`;
}
