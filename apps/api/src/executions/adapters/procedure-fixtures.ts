/* Fixed procedures for tests and local development until Mica's catalog exists */
import { AREA_IDS } from '../../documents/adapters/fixtures';
import type { CatalogProcedureVersion } from '../ports/procedures-catalog';

// Hand-written fixed UUIDs. Prefixes not used by other fixtures:
// 1a… procedures, 1b… versions, 1c… steps.
export const PROCEDURE_IDS = {
  cierreDeCaja: '1a000000-0000-4000-8000-000000000001', // Ventas
  recepcionMercaderia: '1a000000-0000-4000-8000-000000000002', // Operaciones
} as const;

export const PROCEDURE_VERSION_IDS = {
  cierreDeCajaV1: '1b000000-0000-4000-8000-000000000001',
  cierreDeCajaV2: '1b000000-0000-4000-8000-000000000002',
  recepcionMercaderiaV1: '1b000000-0000-4000-8000-000000000003',
} as const;

// Areas belong to the procedure, not to a version: every version reports these.
export const PROCEDURE_AREAS: Record<string, string[]> = {
  [PROCEDURE_IDS.cierreDeCaja]: [AREA_IDS.ventas],
  [PROCEDURE_IDS.recepcionMercaderia]: [AREA_IDS.operaciones],
};

// A catalog version without its areas, plus whether it is the published one of
// its procedure.
export interface FixtureProcedureVersion extends Omit<
  CatalogProcedureVersion,
  'areaIds'
> {
  published: boolean;
}

// Ventas has v1 (replaced) and v2 (published) with different steps, so tests can
// check that an execution stays on the version it was started with.
export const FIXTURE_PROCEDURE_VERSIONS: FixtureProcedureVersion[] = [
  {
    procedureId: PROCEDURE_IDS.cierreDeCaja,
    versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV1,
    published: false,
    steps: [
      {
        id: '1c000000-0000-4000-8000-000000000001',
        order: 1,
        title: 'Contar el efectivo',
      },
      {
        id: '1c000000-0000-4000-8000-000000000002',
        order: 2,
        title: 'Comparar con el reporte del sistema',
      },
      {
        id: '1c000000-0000-4000-8000-000000000003',
        order: 3,
        title: 'Guardar el efectivo en la caja fuerte',
      },
    ],
  },
  {
    procedureId: PROCEDURE_IDS.cierreDeCaja,
    versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
    published: true,
    steps: [
      {
        id: '1c000000-0000-4000-8000-000000000011',
        order: 1,
        title: 'Contar el efectivo',
      },
      {
        id: '1c000000-0000-4000-8000-000000000012',
        order: 2,
        title: 'Contar los comprobantes de tarjeta',
      },
      {
        id: '1c000000-0000-4000-8000-000000000013',
        order: 3,
        title: 'Comparar con el reporte del sistema',
      },
      {
        id: '1c000000-0000-4000-8000-000000000014',
        order: 4,
        title: 'Guardar el efectivo en la caja fuerte',
      },
    ],
  },
  {
    procedureId: PROCEDURE_IDS.recepcionMercaderia,
    versionId: PROCEDURE_VERSION_IDS.recepcionMercaderiaV1,
    published: true,
    steps: [
      {
        id: '1c000000-0000-4000-8000-000000000021',
        order: 1,
        title: 'Verificar el remito',
      },
      {
        id: '1c000000-0000-4000-8000-000000000022',
        order: 2,
        title: 'Controlar cantidades y estado',
      },
    ],
  },
];
