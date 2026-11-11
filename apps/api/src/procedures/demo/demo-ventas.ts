/* Procedimientos de Ventas de Supermercado La Esquina (spec 016) */
import { FIXTURE_PROCEDURE_VERSIONS } from '../../executions/adapters/procedure-fixtures';
import { demoSteps, demoUuid, demoVersion, fromCatalog } from './demo-ids';
import type { DemoProcedure, DemoStatus } from './demo-types';

// Cierre de caja: los ids y pasos de los fixtures; la V2 es un cambio crítico.
const cierre = FIXTURE_PROCEDURE_VERSIONS.filter(
  (v) => v.title === 'Cierre de caja',
);
const CIERRE_STATUS: DemoStatus[] = ['SUPERSEDED', 'PUBLISHED'];

export const cierreDeCaja: DemoProcedure = {
  id: cierre[0].procedureId,
  areas: ['ventas'],
  versions: cierre.map((v, i) =>
    demoVersion({
      id: v.versionId,
      versionNumber: i + 1,
      status: CIERRE_STATUS[i],
      title: 'Cierre de caja',
      description:
        'Cómo se cuenta y se resguarda la caja al terminar el turno.',
      day: v.publishedAt!.toISOString().slice(0, 10),
      steps: fromCatalog(v.steps),
      changeSummary:
        i === 1
          ? 'Se agrega contar los comprobantes de tarjeta antes de comparar.'
          : undefined,
    }),
  ),
};

export const cambioDeProducto: DemoProcedure = {
  id: demoUuid('1a', 3),
  areas: ['ventas'],
  versions: [
    demoVersion({
      id: demoUuid('1b', 4),
      versionNumber: 1,
      status: 'PUBLISHED',
      title: 'Atención de un cambio de producto',
      description:
        'Qué hacer cuando un cliente quiere cambiar un producto ya comprado.',
      day: '2026-10-05',
      steps: demoSteps(3, 1, [
        [
          1,
          'Pedir el ticket',
          'Pedile al cliente el ticket de compra y verificá que sea de los últimos 30 días.',
        ],
        [
          2,
          'Revisar el producto',
          'Controlá que el producto esté cerrado, sin uso y con su envase original.',
        ],
        [
          3,
          'Ofrecer el cambio',
          'Ofrecé cambiarlo por otro igual o por uno de valor similar.',
        ],
        [
          4,
          'Registrar el cambio',
          'Cargá el cambio en caja con el motivo y guardá el ticket original.',
        ],
      ]),
    }),
  ],
};

export const aperturaDelLocal: DemoProcedure = {
  id: demoUuid('1a', 4),
  areas: ['ventas'],
  versions: [
    demoVersion({
      id: demoUuid('1b', 5),
      versionNumber: 1,
      status: 'PUBLISHED',
      title: 'Apertura del local',
      description: 'Pasos para dejar el local listo antes de recibir clientes.',
      day: '2026-10-06',
      steps: demoSteps(4, 1, [
        [
          1,
          'Desactivar la alarma',
          'Ingresá el código de apertura y confirmá que el panel quede en verde.',
        ],
        [
          2,
          'Encender luces y heladeras',
          'Prendé las luces del salón y revisá que las heladeras estén funcionando.',
        ],
        [
          3,
          'Preparar las cajas',
          'Colocá el fondo de cambio en cada caja y encendé los equipos.',
        ],
        [
          4,
          'Recorrer el salón',
          'Revisá góndolas y pasillos: nada en el piso y precios a la vista.',
        ],
        [5, 'Abrir la puerta', 'Abrí al público en el horario indicado.'],
      ]),
    }),
  ],
};
