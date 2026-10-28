import type { CatalogProcedureVersion } from '../ports/procedures-catalog';
import {
  ExecutionAggregate,
  StepAggregate,
  buildProcedureMetrics,
  ratio,
  totalsOf,
} from './procedure-metrics';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const CIERRE = '1a000000-0000-4000-8000-000000000001';
const RECEPCION = '1a000000-0000-4000-8000-000000000002';
const CIERRE_V1 = '1b000000-0000-4000-8000-000000000001';
const CIERRE_V2 = '1b000000-0000-4000-8000-000000000002';
const RECEPCION_V1 = '1b000000-0000-4000-8000-000000000003';

const step = (version: number, order: number) => ({
  id: `1c000000-0000-4000-8000-000000000${version}0${order}`,
  order,
  title: `Step ${order} of v${version}`,
});

const version = (
  procedureId: string,
  versionId: string,
  areaIds: string[],
  n: number,
  stepCount: number,
): CatalogProcedureVersion => ({
  procedureId,
  versionId,
  areaIds,
  steps: Array.from({ length: stepCount }, (_, i) => step(n, i + 1)),
});

const V1 = version(CIERRE, CIERRE_V1, [VENTAS], 1, 2);
const V2 = version(CIERRE, CIERRE_V2, [VENTAS], 2, 3);
const R1 = version(RECEPCION, RECEPCION_V1, [OPERACIONES], 3, 2);
const ALL = new Map([V1, V2, R1].map((v) => [v.versionId, v]));

const executions = (
  v: CatalogProcedureVersion,
  overrides: Partial<ExecutionAggregate> = {},
): ExecutionAggregate => ({
  procedureId: v.procedureId,
  procedureVersionId: v.versionId,
  started: 0,
  completed: 0,
  inProgress: 0,
  completedDurationMs: 0,
  lastStartedAt: new Date('2026-10-27T10:00:00.000Z'),
  ...overrides,
});

const stepRows = (
  v: CatalogProcedureVersion,
  order: number,
  overrides: Partial<StepAggregate> = {},
): StepAggregate => ({
  procedureVersionId: v.versionId,
  stepId: v.steps[order - 1].id,
  reached: 0,
  finished: 0,
  finishedDurationMs: 0,
  abandoned: 0,
  ...overrides,
});

describe('ratio', () => {
  it('divides', () => {
    expect(ratio(1, 4)).toBe(0.25);
  });

  it('is null instead of dividing by zero', () => {
    expect(ratio(0, 0)).toBeNull();
  });
});

describe('buildProcedureMetrics', () => {
  it('counts executions and computes the averages of each step', () => {
    // 4 started: 2 completed, 1 in progress, 1 abandoned at step 2.
    const [cierre] = buildProcedureMetrics(
      [
        executions(V2, {
          started: 4,
          completed: 2,
          inProgress: 2,
          completedDurationMs: 2 * 540_000,
        }),
      ],
      [
        stepRows(V2, 1, {
          reached: 4,
          finished: 4,
          finishedDurationMs: 4 * 180_000,
        }),
        stepRows(V2, 2, {
          reached: 4,
          finished: 2,
          finishedDurationMs: 2 * 120_000,
          abandoned: 1,
        }),
        stepRows(V2, 3, {
          reached: 2,
          finished: 2,
          finishedDurationMs: 2 * 240_000,
        }),
      ],
      ALL,
    );

    expect(cierre).toMatchObject({
      procedureId: CIERRE,
      areaIds: [VENTAS],
      started: 4,
      completed: 2,
      inProgress: 1,
      abandoned: 1,
      completionRate: 0.5,
      avgCompletionMs: 540_000,
    });
    expect(cierre.versions[0].steps).toEqual([
      {
        stepId: V2.steps[0].id,
        order: 1,
        title: 'Step 1 of v2',
        reached: 4,
        finished: 4,
        avgDurationMs: 180_000,
        abandoned: 0,
        abandonRate: 0,
      },
      {
        stepId: V2.steps[1].id,
        order: 2,
        title: 'Step 2 of v2',
        reached: 4,
        finished: 2,
        avgDurationMs: 120_000,
        abandoned: 1,
        abandonRate: 0.25,
      },
      {
        stepId: V2.steps[2].id,
        order: 3,
        title: 'Step 3 of v2',
        reached: 2,
        finished: 2,
        avgDurationMs: 240_000,
        abandoned: 0,
        abandonRate: 0,
      },
    ]);
  });

  it('a step nobody reached has zeros and nulls, never a division by zero', () => {
    const [cierre] = buildProcedureMetrics(
      [executions(V2, { started: 1, inProgress: 1 })],
      [stepRows(V2, 1, { reached: 1 })],
      ALL,
    );

    expect(cierre.versions[0].steps[0]).toMatchObject({
      reached: 1,
      finished: 0,
      avgDurationMs: null,
      abandonRate: 0,
    });
    expect(cierre.versions[0].steps[2]).toMatchObject({
      reached: 0,
      finished: 0,
      avgDurationMs: null,
      abandoned: 0,
      abandonRate: null,
    });
    expect(cierre).toMatchObject({ completionRate: 0, avgCompletionMs: null });
  });

  it('keeps each version with its own steps, the one with the latest execution first', () => {
    const [cierre] = buildProcedureMetrics(
      [
        executions(V1, {
          started: 1,
          completed: 1,
          lastStartedAt: new Date('2026-10-01T10:00:00.000Z'),
        }),
        executions(V2, {
          started: 2,
          completed: 2,
          lastStartedAt: new Date('2026-10-20T10:00:00.000Z'),
        }),
      ],
      [],
      ALL,
    );

    expect(cierre.started).toBe(3);
    expect(cierre.completed).toBe(3);
    expect(cierre.versions.map((v) => v.procedureVersionId)).toEqual([
      CIERRE_V2,
      CIERRE_V1,
    ]);
    expect(cierre.versions.map((v) => v.steps.length)).toEqual([3, 2]);
  });

  it('the average completion time weighs every completed execution, across versions', () => {
    const [cierre] = buildProcedureMetrics(
      [
        executions(V1, { started: 1, completed: 1, completedDurationMs: 100 }),
        executions(V2, { started: 3, completed: 3, completedDurationMs: 500 }),
      ],
      [],
      ALL,
    );

    expect(cierre.avgCompletionMs).toBe(150);
  });

  it('the abandoned executions are the abandoned steps, so the counts add up', () => {
    const [cierre] = buildProcedureMetrics(
      [executions(V2, { started: 3, inProgress: 3 })],
      [
        stepRows(V2, 1, { reached: 3, finished: 2, abandoned: 1 }),
        stepRows(V2, 2, { reached: 2, abandoned: 1 }),
      ],
      ALL,
    );

    expect(cierre).toMatchObject({
      started: 3,
      completed: 0,
      inProgress: 1,
      abandoned: 2,
    });
  });

  it('leaves out the versions it was not given', () => {
    const procedures = buildProcedureMetrics(
      [
        executions(V2, { started: 1, completed: 1 }),
        executions(R1, { started: 2, completed: 2 }),
      ],
      [stepRows(R1, 1, { reached: 2, finished: 2 })],
      new Map([[V2.versionId, V2]]),
    );

    expect(procedures.map((p) => p.procedureId)).toEqual([CIERRE]);
  });

  it('sorts procedures by executions started, most first', () => {
    const procedures = buildProcedureMetrics(
      [
        executions(V2, { started: 1, completed: 1 }),
        executions(R1, { started: 2, completed: 2 }),
      ],
      [],
      ALL,
    );

    expect(procedures.map((p) => p.procedureId)).toEqual([RECEPCION, CIERRE]);
  });

  it('without aggregates there are no procedures', () => {
    expect(buildProcedureMetrics([], [], ALL)).toEqual([]);
  });
});

describe('totalsOf', () => {
  it('adds up every procedure', () => {
    const procedures = buildProcedureMetrics(
      [
        executions(V2, { started: 2, completed: 1, inProgress: 1 }),
        executions(R1, { started: 2, completed: 2 }),
      ],
      [],
      ALL,
    );

    expect(totalsOf(procedures)).toEqual({
      started: 4,
      completed: 3,
      inProgress: 1,
      abandoned: 0,
      completionRate: 0.75,
    });
  });

  it('with no executions the completion rate is null', () => {
    expect(totalsOf([])).toEqual({
      started: 0,
      completed: 0,
      inProgress: 0,
      abandoned: 0,
      completionRate: null,
    });
  });
});
