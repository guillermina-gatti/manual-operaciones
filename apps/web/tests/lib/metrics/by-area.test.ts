import { describe, expect, test } from 'vitest';
import { groupByArea } from '@/lib/metrics/by-area';
import { CIERRE_DE_CAJA, OPERACIONES, VENTAS, metricsResponse } from '../../support/metrics';

const LOGISTICA = '0a000000-0000-4000-8000-000000000003';
const AREAS = [
  { id: VENTAS, name: 'Ventas', isActive: true },
  { id: OPERACIONES, name: 'Operaciones', isActive: false },
  { id: LOGISTICA, name: 'Logística', isActive: true },
];

// Cierre de caja in Ventas and Operaciones; Recepción de mercadería in Operaciones.
const twoAreas = () =>
  metricsResponse().procedures.map((procedure) =>
    procedure.procedureId === CIERRE_DE_CAJA
      ? { ...procedure, areaIds: [VENTAS, OPERACIONES] }
      : procedure,
  );

describe('groupByArea', () => {
  test('one group per area with executions, in the order of the directory', () => {
    const { groups } = groupByArea(metricsResponse().procedures, AREAS, {
      areaId: null,
      viewerAreaIds: null,
    });

    expect(groups.map((group) => [group.name, group.procedures.length])).toEqual([
      ['Ventas', 1],
      ['Operaciones (inactiva)', 1],
    ]);
    expect(groups[0].counts).toEqual({ started: 4, completed: 2, inProgress: 1, abandoned: 1 });
    expect(groups[0].avgCompletionMs).toBe(720000);
  });

  test('a procedure with two areas is in both groups, so groups must not be added up', () => {
    const procedures = twoAreas();
    const { groups } = groupByArea(procedures, AREAS, { areaId: null, viewerAreaIds: null });

    expect(groups.map((group) => group.counts.started)).toEqual([4, 5]);
    const addedUp = groups.reduce((sum, group) => sum + group.counts.started, 0);
    expect(addedUp).toBe(9);
    // The general summary uses the procedures: 5, each one once.
    expect(procedures.reduce((sum, procedure) => sum + procedure.started, 0)).toBe(5);
  });

  test('with an area chosen, only that area, even if a procedure has others', () => {
    const { groups, withoutExecutions } = groupByArea(twoAreas(), AREAS, {
      areaId: VENTAS,
      viewerAreaIds: null,
    });

    expect(groups.map((group) => group.areaId)).toEqual([VENTAS]);
    expect(withoutExecutions).toBe(0);
  });

  test('a supervisor only sees their areas', () => {
    const { groups } = groupByArea(twoAreas(), AREAS, { areaId: null, viewerAreaIds: [VENTAS] });

    expect(groups.map((group) => group.areaId)).toEqual([VENTAS]);
  });

  test('counts the active areas without executions; inactive ones do not count', () => {
    expect(
      groupByArea([], AREAS, { areaId: null, viewerAreaIds: null }).withoutExecutions,
    ).toBe(2);
    expect(
      groupByArea(metricsResponse().procedures, AREAS, { areaId: null, viewerAreaIds: null })
        .withoutExecutions,
    ).toBe(1);
    expect(
      groupByArea([], AREAS, { areaId: null, viewerAreaIds: [VENTAS, LOGISTICA] })
        .withoutExecutions,
    ).toBe(2);
  });

  test('an area the directory does not know gets a distinguishable name and goes last', () => {
    const { groups } = groupByArea(metricsResponse().procedures, AREAS.slice(1), {
      areaId: null,
      viewerAreaIds: null,
    });

    expect(groups.map((group) => group.name)).toEqual(['Operaciones (inactiva)', 'Área 000001']);
  });
});
