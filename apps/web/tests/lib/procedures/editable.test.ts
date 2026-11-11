import { describe, expect, test } from 'vitest';
import { fromDetail } from '@/lib/procedures/editable';
import { OPERACIONES_AREA, VENTAS_AREA, procedureDetail } from '../../support/procedure-view';
import { OPERACIONES, PROCEDURE_ID, STEP_A, STEP_B, VENTAS, VERSION_ID } from '../../support/procedures';

// Spec 006, W6 (E46): the editor holds what GET /api/procedures/:id answered.
describe('fromDetail', () => {
  test('takes the version the API shows: its id, number, state, title and description', () => {
    const procedure = fromDetail(procedureDetail());

    expect(procedure).toMatchObject({
      id: PROCEDURE_ID,
      versionId: VERSION_ID,
      versionNumber: 2,
      status: 'PUBLISHED',
      title: 'Cierre de caja',
      description: 'Al final del día',
    });
  });

  test('keeps the steps, in order, with their description', () => {
    const detail = procedureDetail();
    const reversed = { ...detail, version: { ...detail.version, steps: [...detail.version.steps].reverse() } };

    const { steps } = fromDetail(reversed);

    expect(steps.map((step) => [step.id, step.order, step.description])).toEqual([
      [STEP_A, 1, 'Billetes y monedas'],
      [STEP_B, 2, ''],
    ]);
  });

  test('keeps the ids of the areas, also a deactivated one an ADMIN receives', () => {
    const inactive = { ...VENTAS_AREA, isActive: false };

    const { areaIds } = fromDetail(procedureDetail({ areas: [inactive, OPERACIONES_AREA] }));

    expect(areaIds).toEqual([VENTAS, OPERACIONES]);
  });

  test('does not share the steps with the answer: changing the copy does not change it', () => {
    const detail = procedureDetail();

    const procedure = fromDetail(detail);
    procedure.steps[0].title = 'Otro';

    expect(detail.version.steps[0].title).toBe('Contar el efectivo');
  });
});
