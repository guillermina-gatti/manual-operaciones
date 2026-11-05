import { describe, expect, test } from 'vitest';
import type { ProcedureMetricsResponse, StepMetricsResponse } from '@/lib/api';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { procedureTimeRows, slowestStep } from '@/lib/metrics/procedure-time';

const step = (order: number, title: string, avgDurationMs: number | null): StepMetricsResponse => ({
  stepId: `1c000000-0000-4000-8000-00000000000${order}`,
  order,
  title,
  reached: 1,
  finished: avgDurationMs === null ? 0 : 1,
  avgDurationMs,
  abandoned: 0,
  abandonRate: 0,
});

const procedure = (
  id: string,
  avgCompletionMs: number | null,
  steps: StepMetricsResponse[] = [],
): ProcedureMetricsResponse => ({
  procedureId: id,
  areaIds: [],
  started: 2,
  completed: avgCompletionMs === null ? 0 : 2,
  inProgress: 0,
  abandoned: avgCompletionMs === null ? 2 : 0,
  completionRate: avgCompletionMs === null ? 0 : 1,
  avgCompletionMs,
  versions: [
    { procedureVersionId: `${id}-v`, started: 2, completed: 2, inProgress: 0, abandoned: 0, steps },
  ],
});

describe('slowestStep', () => {
  test('the step with the highest average time', () => {
    expect(
      slowestStep([step(1, 'Contar', 240000), step(2, 'Comparar', 420000), step(3, 'Guardar', 60000)]),
    ).toEqual({ title: 'Comparar', avgDurationMs: 420000 });
  });

  test('on a tie, the first one; steps nobody finished do not count', () => {
    expect(
      slowestStep([step(1, 'Uno', null), step(2, 'Dos', 60000), step(3, 'Tres', 60000)]),
    ).toEqual({ title: 'Dos', avgDurationMs: 60000 });
    expect(slowestStep([step(1, 'Uno', null)])).toBeNull();
    expect(slowestStep([])).toBeNull();
  });
});

describe('procedureTimeRows', () => {
  test('slowest first, with the bar relative to the slowest one', () => {
    const rows = procedureTimeRows([
      procedure('a', 900000),
      procedure('b', 5400000),
      procedure('c', 2700000),
    ]);

    expect(rows.map((row) => row.procedureId)).toEqual(['b', 'c', 'a']);
    expect(rows.map((row) => row.barRatio)).toEqual([1, 0.5, 1 / 6]);
  });

  test('procedures without completed executions go last, without a bar', () => {
    const rows = procedureTimeRows([procedure('sin', null), procedure('con', 60000)]);

    expect(rows.map((row) => [row.procedureId, row.barRatio])).toEqual([
      ['con', 1],
      ['sin', 0],
    ]);
  });

  test('the slowest step is the one of the latest version', () => {
    const latest = procedure('a', 60000, [step(1, 'Nuevo', 30000)]);
    latest.versions.push({ ...latest.versions[0], steps: [step(1, 'Viejo', 90000)] });

    expect(procedureTimeRows([latest])[0].slowestStep).toEqual({
      title: 'Nuevo',
      avgDurationMs: 30000,
    });
  });
});

describe('metricsProcedureName', () => {
  test('a sample procedure keeps its name', () => {
    expect(metricsProcedureName('1a000000-0000-4000-8000-000000000001')).toBe('Cierre de caja');
  });

  test('another one gets "Procedimiento" and a short code of its id, so they differ', () => {
    expect(metricsProcedureName('5d2f6a10-8c3e-4f3a-9c2b-4f3a9c2b81de')).toBe(
      'Procedimiento 2B81DE',
    );
    expect(metricsProcedureName('1a000000-0000-4000-8000-00000000000a')).toBe(
      'Procedimiento 00000A',
    );
  });
});
