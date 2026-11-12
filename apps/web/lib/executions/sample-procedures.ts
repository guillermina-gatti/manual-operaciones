// The sample procedures, with the same ids as the in-memory catalog of the API
// (apps/api/src/executions/adapters/procedure-fixtures.ts). Only a fallback for names: the
// picker of /ejecuciones lists the real ones (GET /api/procedures), and the API gives the title
// of each execution. They still name the executions of the sample data and the e2e tests.

export interface ProcedureOption {
  id: string;
  name: string;
  areaName: string;
}

export const SAMPLE_PROCEDURES: readonly ProcedureOption[] = [
  {
    id: '1a000000-0000-4000-8000-000000000001',
    name: 'Cierre de caja',
    areaName: 'Ventas',
  },
  {
    id: '1a000000-0000-4000-8000-000000000002',
    name: 'Recepción de mercadería',
    areaName: 'Operaciones',
  },
];

// The title the API gives when the catalog has it; otherwise the name of the sample procedure,
// or "Procedimiento".
export function procedureName(procedureId: string, title?: string | null): string {
  if (title?.trim()) return title.trim();
  return SAMPLE_PROCEDURES.find((p) => p.id === procedureId)?.name ?? 'Procedimiento';
}
