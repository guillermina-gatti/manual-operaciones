/* Control de stock e Inventario anual (spec 016) */
import { demoSteps, demoUuid, demoVersion } from './demo-ids';
import type { DemoProcedure } from './demo-types';

export const controlDeStock: DemoProcedure = {
  id: demoUuid('1a', 6),
  areas: ['operaciones'],
  versions: [
    demoVersion({
      id: demoUuid('1b', 8),
      versionNumber: 1,
      status: 'PUBLISHED',
      title: 'Control de stock',
      description:
        'Control semanal de las cantidades del depósito contra el sistema.',
      day: '2026-10-10',
      steps: demoSteps(6, 1, [
        [
          1,
          'Elegir la sección',
          'Tomá la sección del depósito que toca controlar esa semana.',
        ],
        [
          2,
          'Contar los productos',
          'Contá las unidades físicas de cada producto de la sección.',
        ],
        [
          3,
          'Comparar con el sistema',
          'Compará lo contado con el stock del sistema y marcá las diferencias.',
        ],
        [
          4,
          'Informar las diferencias',
          'Avisá al encargado de las diferencias mayores a 5 unidades.',
        ],
      ]),
    }),
  ],
};

// Solo borrador: todavía no se publicó ninguna versión.
export const inventarioAnual: DemoProcedure = {
  id: demoUuid('1a', 8),
  areas: ['operaciones'],
  versions: [
    demoVersion({
      id: demoUuid('1b', 9),
      versionNumber: 1,
      status: 'DRAFT',
      title: 'Inventario anual',
      description: 'Borrador del conteo general de fin de año.',
      day: '2026-11-02',
      steps: demoSteps(8, 1, [
        [
          1,
          'Planificar la fecha',
          'Definí el día y el equipo que participa del inventario.',
        ],
        [
          2,
          'Cerrar el local al público',
          'Avisá a los clientes y cerrá las cajas antes de empezar.',
        ],
        [
          3,
          'Contar por sectores',
          'Dividí el local en sectores y asigná una pareja de conteo a cada uno.',
        ],
      ]),
    }),
  ],
};
