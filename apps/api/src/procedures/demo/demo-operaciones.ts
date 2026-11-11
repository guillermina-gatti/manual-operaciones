/* Procedimientos de Operaciones de Supermercado La Esquina (spec 016) */
import { FIXTURE_PROCEDURE_VERSIONS } from '../../executions/adapters/procedure-fixtures';
import { demoSteps, demoUuid, demoVersion, fromCatalog } from './demo-ids';
import type { DemoProcedure } from './demo-types';

// Recepción de mercadería: los ids y pasos de los fixtures, más un tercer paso (P5).
const recepcion = FIXTURE_PROCEDURE_VERSIONS.find(
  (v) => v.title === 'Recepción de mercadería',
)!;

export const recepcionDeMercaderia: DemoProcedure = {
  id: recepcion.procedureId,
  areas: ['operaciones'],
  versions: [
    demoVersion({
      id: recepcion.versionId,
      versionNumber: 1,
      status: 'PUBLISHED',
      title: 'Recepción de mercadería',
      description:
        'Cómo recibir y controlar la mercadería que llega al depósito.',
      day: '2026-10-01',
      steps: [
        ...fromCatalog(recepcion.steps),
        {
          id: demoUuid('1c', 23),
          stepKey: demoUuid('1d', 23),
          title: 'Ingresar al stock',
          description:
            'Cargá la mercadería recibida en el sistema y ubicala en su lugar del depósito.',
        },
      ],
    }),
  ],
};

const LIMPIEZA_V1 = demoSteps(5, 1, [
  [
    1,
    'Barrer el piso',
    'Barré todo el depósito, incluso debajo de las estanterías.',
  ],
  [
    2,
    'Ordenar las estanterías',
    'Acomodá los productos en las estanterías sin dejar cajas en el piso.',
  ],
  [
    3,
    'Retirar las cajas vacías',
    'Aplastá las cajas vacías y llevalas al contenedor de cartón.',
  ],
  [
    4,
    'Registrar la limpieza',
    'Firmá la planilla de limpieza con fecha y hora.',
  ],
]);

// V2: se modifica el paso 2, se agrega el 5 (desinfectar) y se quita el 3.
const LIMPIEZA_V2 = demoSteps(5, 2, [
  [
    1,
    'Barrer el piso',
    'Barré todo el depósito, incluso debajo de las estanterías.',
  ],
  [
    2,
    'Ordenar las estanterías',
    'Acomodá los productos por fecha de vencimiento, los más próximos adelante.',
  ],
  [
    5,
    'Desinfectar la zona de frío',
    'Limpiá y desinfectá la cámara de frío con el producto autorizado.',
  ],
  [
    4,
    'Registrar la limpieza',
    'Firmá la planilla de limpieza con fecha y hora.',
  ],
]);

export const limpiezaDelDeposito: DemoProcedure = {
  id: demoUuid('1a', 5),
  areas: ['operaciones'],
  versions: [
    demoVersion({
      id: demoUuid('1b', 6),
      versionNumber: 1,
      status: 'SUPERSEDED',
      title: 'Limpieza del depósito',
      description: 'Rutina de limpieza y orden del depósito.',
      day: '2026-10-03',
      steps: LIMPIEZA_V1,
    }),
    demoVersion({
      id: demoUuid('1b', 7),
      versionNumber: 2,
      status: 'PUBLISHED',
      title: 'Limpieza del depósito',
      description: 'Rutina de limpieza y orden del depósito.',
      day: '2026-10-22',
      steps: LIMPIEZA_V2,
      changeSummary:
        'Se agrega desinfectar la zona de frío, se ordena por vencimiento y ya no se retiran cajas aparte.',
    }),
  ],
};
