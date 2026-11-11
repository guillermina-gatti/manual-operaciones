/* Fixed procedures for tests and local development until Mica's catalog exists */
import { AREA_IDS } from '../../documents/adapters/fixtures';
import type { CatalogProcedureVersion } from '../ports/procedures-catalog';

// Hand-written fixed UUIDs. Prefixes not used by other fixtures:
// 1a… procedures, 1b… versions, 1c… steps, 1d… step keys (shared by the copies of a
// step across versions).
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

// A catalog version without its areas, plus whether it is the published one of its
// procedure, whether it was published before (superseded) and when it was published.
export interface FixtureProcedureVersion extends Omit<
  CatalogProcedureVersion,
  'areaIds'
> {
  published: boolean;
  superseded?: boolean;
  publishedAt?: Date;
}

const STEP_KEYS = {
  contarEfectivo: '1d000000-0000-4000-8000-000000000001',
  compararReporte: '1d000000-0000-4000-8000-000000000002',
  guardarEfectivo: '1d000000-0000-4000-8000-000000000003',
  contarComprobantes: '1d000000-0000-4000-8000-000000000004',
  verificarRemito: '1d000000-0000-4000-8000-000000000021',
  controlarCantidades: '1d000000-0000-4000-8000-000000000022',
} as const;

// Ventas has v1 (replaced) and v2 (published) with different steps, so tests can
// check that an execution stays on the version it was started with.
export const FIXTURE_PROCEDURE_VERSIONS: FixtureProcedureVersion[] = [
  {
    procedureId: PROCEDURE_IDS.cierreDeCaja,
    versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV1,
    title: 'Cierre de caja',
    versionNumber: 1,
    isCritical: false,
    changeSummary: null,
    published: false,
    superseded: true,
    publishedAt: new Date('2026-10-01T12:00:00.000Z'),
    steps: [
      {
        id: '1c000000-0000-4000-8000-000000000001',
        order: 1,
        title: 'Contar el efectivo',
        description: 'Contá los billetes y las monedas de la caja.',
        stepKey: STEP_KEYS.contarEfectivo,
      },
      {
        id: '1c000000-0000-4000-8000-000000000002',
        order: 2,
        title: 'Comparar con el reporte del sistema',
        description: 'Compará lo contado con el total del reporte de cierre.',
        stepKey: STEP_KEYS.compararReporte,
      },
      {
        id: '1c000000-0000-4000-8000-000000000003',
        order: 3,
        title: 'Guardar el efectivo en la caja fuerte',
        description:
          'Guardá el efectivo en un sobre cerrado dentro de la caja fuerte.',
        stepKey: STEP_KEYS.guardarEfectivo,
      },
    ],
  },
  {
    procedureId: PROCEDURE_IDS.cierreDeCaja,
    versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
    title: 'Cierre de caja',
    versionNumber: 2,
    isCritical: false,
    changeSummary: 'Se agrega contar los comprobantes de tarjeta',
    published: true,
    publishedAt: new Date('2026-10-15T12:00:00.000Z'),
    steps: [
      {
        id: '1c000000-0000-4000-8000-000000000011',
        order: 1,
        title: 'Contar el efectivo',
        description: 'Contá los billetes y las monedas de la caja.',
        stepKey: STEP_KEYS.contarEfectivo,
      },
      {
        id: '1c000000-0000-4000-8000-000000000012',
        order: 2,
        title: 'Contar los comprobantes de tarjeta',
        description: 'Contá los comprobantes de tarjeta del día.',
        stepKey: STEP_KEYS.contarComprobantes,
      },
      {
        id: '1c000000-0000-4000-8000-000000000013',
        order: 3,
        title: 'Comparar con el reporte del sistema',
        description: 'Compará lo contado con el total del reporte de cierre.',
        stepKey: STEP_KEYS.compararReporte,
      },
      {
        id: '1c000000-0000-4000-8000-000000000014',
        order: 4,
        title: 'Guardar el efectivo en la caja fuerte',
        description:
          'Guardá el efectivo en un sobre cerrado dentro de la caja fuerte.',
        stepKey: STEP_KEYS.guardarEfectivo,
      },
    ],
  },
  {
    procedureId: PROCEDURE_IDS.recepcionMercaderia,
    versionId: PROCEDURE_VERSION_IDS.recepcionMercaderiaV1,
    title: 'Recepción de mercadería',
    versionNumber: 1,
    isCritical: false,
    changeSummary: null,
    published: true,
    publishedAt: new Date('2026-10-01T12:00:00.000Z'),
    steps: [
      {
        id: '1c000000-0000-4000-8000-000000000021',
        order: 1,
        title: 'Verificar el remito',
        description: 'Revisá que el remito coincida con la orden de compra.',
        stepKey: STEP_KEYS.verificarRemito,
      },
      {
        id: '1c000000-0000-4000-8000-000000000022',
        order: 2,
        title: 'Controlar cantidades y estado',
        description: 'Contá los bultos y revisá que lleguen en buen estado.',
        stepKey: STEP_KEYS.controlarCantidades,
      },
    ],
  },
];
