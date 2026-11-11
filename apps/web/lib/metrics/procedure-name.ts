// The name of a procedure in the metrics panel: the title the API gives when the catalog has it.
// Without one, the name of the sample procedure, and a procedure that is not there gets
// "Procedimiento" plus a short code of its id, so two of them never look the same
// ("Procedimiento 00000A", "Procedimiento 2B81DE").
// TODO(HU11): Mica's real catalog does not give the title yet; the fallback covers it.
import { SAMPLE_PROCEDURES } from '@/lib/executions/sample-procedures';

export function metricsProcedureName(procedureId: string, title?: string | null): string {
  if (title?.trim()) return title.trim();
  const sample = SAMPLE_PROCEDURES.find((procedure) => procedure.id === procedureId);
  return sample?.name ?? `Procedimiento ${procedureId.slice(-6).toUpperCase()}`;
}
