/* Atención de reclamos: el procedimiento compartido por Ventas y Operaciones (spec 016) */
import { demoSteps, demoUuid, demoVersion } from './demo-ids';
import type { DemoProcedure } from './demo-types';

export const atencionDeReclamos: DemoProcedure = {
  id: demoUuid('1a', 7),
  areas: ['ventas', 'operaciones'],
  versions: [
    demoVersion({
      id: demoUuid('1b', 10),
      versionNumber: 1,
      status: 'PUBLISHED',
      title: 'Atención de reclamos',
      description:
        'Cómo recibir, registrar y resolver el reclamo de un cliente.',
      day: '2026-10-08',
      steps: demoSteps(7, 1, [
        [
          1,
          'Escuchar al cliente',
          'Dejá que explique el problema completo sin interrumpirlo.',
        ],
        [
          2,
          'Registrar el reclamo',
          'Anotá nombre, contacto, producto y qué pasó en el libro de reclamos.',
        ],
        [
          3,
          'Resolver o derivar',
          'Si podés resolverlo en el momento, hacelo; si no, derivalo al encargado del área.',
        ],
        [
          4,
          'Avisar al cliente',
          'Informale la solución o el plazo y confirmá que esté conforme.',
        ],
        [
          5,
          'Cerrar el registro',
          'Anotá cómo se resolvió y la fecha de cierre.',
        ],
      ]),
    }),
  ],
};
