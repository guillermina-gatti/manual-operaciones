// Procedures an employee can choose on /ejecuciones.
// TODO(HU12): provisional sample data, the same ids as the API fixtures
// (apps/api/src/executions/adapters/procedure-fixtures.ts). Replace with Mica's procedure
// listing once it exists. They are not filtered by area: the API decides, and answers 404
// to an employee of another area.

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

// The execution only brings the procedure id; the name comes from here for now.
export function procedureName(procedureId: string): string {
  return SAMPLE_PROCEDURES.find((p) => p.id === procedureId)?.name ?? 'Procedimiento';
}
