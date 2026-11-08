import type { CatalogProcedureVersion } from '../ports/procedures-catalog';
import type { InProgressExecution } from './execution-metrics.repository';
import {
  buildMyProcedures,
  buildResume,
  myAreaScope,
  myTotals,
} from './my-metrics';
import type { ExecutionAggregate, StepAggregate } from './procedure-metrics';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const CIERRE = '1a000000-0000-4000-8000-000000000001';
const RECEPCION = '1a000000-0000-4000-8000-000000000002';
const CIERRE_V1 = '1b000000-0000-4000-8000-000000000001';
const CIERRE_V2 = '1b000000-0000-4000-8000-000000000002';
const RECEPCION_V1 = '1b000000-0000-4000-8000-000000000003';
const MINUTE = 60_000;

const version = (
  procedureId: string,
  versionId: string,
  areaIds: string[],
  titles: string[],
): CatalogProcedureVersion => ({
  procedureId,
  versionId,
  areaIds,
  steps: titles.map((title, i) => ({
    id: `${versionId.slice(0, -2)}${String(i + 1).padStart(2, '0')}`,
    order: i + 1,
    title,
  })),
});

const V_CIERRE_V1 = version(CIERRE, CIERRE_V1, [VENTAS], ['Contar']);
const V_CIERRE_V2 = version(
  CIERRE,
  CIERRE_V2,
  [VENTAS],
  ['Contar', 'Comparar', 'Guardar'],
);
const V_RECEPCION = version(
  RECEPCION,
  RECEPCION_V1,
  [OPERACIONES],
  ['Verificar'],
);
const ALL = new Map(
  [V_CIERRE_V1, V_CIERRE_V2, V_RECEPCION].map((v) => [v.versionId, v]),
);

const aggregate = (
  procedureId: string,
  procedureVersionId: string,
  values: Partial<ExecutionAggregate>,
): ExecutionAggregate => ({
  procedureId,
  procedureVersionId,
  started: 1,
  completed: 1,
  inProgress: 0,
  completedDurationMs: 10 * MINUTE,
  minCompletionMs: 10 * MINUTE,
  maxCompletionMs: 10 * MINUTE,
  lastStartedAt: new Date('2026-11-01T13:00:00.000Z'),
  ...values,
});

const stepRow = (
  procedureVersionId: string,
  stepId: string,
  avgMinutes: number,
): StepAggregate => ({
  procedureVersionId,
  stepId,
  reached: 1,
  finished: 1,
  finishedDurationMs: avgMinutes * MINUTE,
  abandoned: 0,
});

describe('myAreaScope', () => {
  it('without an area: every active area of the viewer', () => {
    expect(myAreaScope([VENTAS, OPERACIONES])).toEqual([VENTAS, OPERACIONES]);
  });

  it('one of their areas: only that one', () => {
    expect(myAreaScope([VENTAS, OPERACIONES], OPERACIONES)).toEqual([
      OPERACIONES,
    ]);
  });

  it('an area that is not theirs, inactive or unknown: no scope (404)', () => {
    expect(myAreaScope([VENTAS], OPERACIONES)).toBeNull();
  });

  it('a viewer without active areas sees nothing', () => {
    expect(myAreaScope([])).toEqual([]);
  });
});

describe('buildMyProcedures', () => {
  it('the most recently started procedure first, with its counts and average', () => {
    const procedures = buildMyProcedures(
      [
        aggregate(CIERRE, CIERRE_V2, {
          started: 3,
          completed: 2,
          inProgress: 1,
          completedDurationMs: 30 * MINUTE,
          lastStartedAt: new Date('2026-11-01T13:00:00.000Z'),
        }),
        aggregate(RECEPCION, RECEPCION_V1, {
          lastStartedAt: new Date('2026-11-04T13:00:00.000Z'),
        }),
      ],
      [],
      ALL,
    );

    expect(procedures.map((p) => p.procedureId)).toEqual([RECEPCION, CIERRE]);
    expect(procedures[1]).toMatchObject({
      areaIds: [VENTAS],
      started: 3,
      completed: 2,
      inProgress: 1,
      abandoned: 0,
      avgCompletionMs: 15 * MINUTE,
      lastStartedAt: new Date('2026-11-01T13:00:00.000Z'),
    });
  });

  it('the last start is the latest of every version of the procedure', () => {
    const [cierre] = buildMyProcedures(
      [
        aggregate(CIERRE, CIERRE_V1, {
          lastStartedAt: new Date('2026-11-03T13:00:00.000Z'),
        }),
        aggregate(CIERRE, CIERRE_V2, {
          lastStartedAt: new Date('2026-11-02T13:00:00.000Z'),
        }),
      ],
      [],
      ALL,
    );

    expect(cierre.lastStartedAt).toEqual(new Date('2026-11-03T13:00:00.000Z'));
  });

  it('the slowest step is the one of the latest version they ran; on a tie, the first', () => {
    const [cierre] = buildMyProcedures(
      [
        aggregate(CIERRE, CIERRE_V2, {
          lastStartedAt: new Date('2026-11-04T13:00:00.000Z'),
        }),
        aggregate(CIERRE, CIERRE_V1, {
          lastStartedAt: new Date('2026-11-01T13:00:00.000Z'),
        }),
      ],
      [
        stepRow(CIERRE_V2, V_CIERRE_V2.steps[0].id, 2),
        stepRow(CIERRE_V2, V_CIERRE_V2.steps[1].id, 7),
        stepRow(CIERRE_V2, V_CIERRE_V2.steps[2].id, 7),
        stepRow(CIERRE_V1, V_CIERRE_V1.steps[0].id, 30),
      ],
      ALL,
    );

    expect(cierre.slowestStep).toEqual({
      stepId: V_CIERRE_V2.steps[1].id,
      order: 2,
      title: 'Comparar',
      avgDurationMs: 7 * MINUTE,
    });
  });

  it('without finished steps there is no slowest step', () => {
    const [recepcion] = buildMyProcedures(
      [aggregate(RECEPCION, RECEPCION_V1, { completed: 0, inProgress: 1 })],
      [],
      ALL,
    );

    expect(recepcion.slowestStep).toBeNull();
  });

  it('a version that is not visible is left out', () => {
    const onlyVentas = new Map([[CIERRE_V2, V_CIERRE_V2]]);

    const procedures = buildMyProcedures(
      [
        aggregate(CIERRE, CIERRE_V2, {}),
        aggregate(RECEPCION, RECEPCION_V1, {}),
      ],
      [],
      onlyVentas,
    );

    expect(procedures.map((p) => p.procedureId)).toEqual([CIERRE]);
  });
});

describe('myTotals', () => {
  it('adds up the procedures and weights every completed execution the same', () => {
    const executions = [
      aggregate(CIERRE, CIERRE_V2, {
        started: 3,
        completed: 2,
        inProgress: 1,
        completedDurationMs: 20 * MINUTE,
      }),
      aggregate(RECEPCION, RECEPCION_V1, {
        started: 1,
        completed: 1,
        completedDurationMs: 50 * MINUTE,
      }),
    ];
    const procedures = buildMyProcedures(executions, [], ALL);

    expect(myTotals(procedures, executions, ALL)).toEqual({
      started: 4,
      completed: 3,
      inProgress: 1,
      abandoned: 0,
      // (20 + 50) minutes over 3 completed.
      avgCompletionMs: Math.round((70 * MINUTE) / 3),
    });
  });

  it('only the visible versions count for the average', () => {
    const executions = [
      aggregate(CIERRE, CIERRE_V2, { completedDurationMs: 10 * MINUTE }),
      aggregate(RECEPCION, RECEPCION_V1, { completedDurationMs: 90 * MINUTE }),
    ];
    const onlyVentas = new Map([[CIERRE_V2, V_CIERRE_V2]]);
    const procedures = buildMyProcedures(executions, [], onlyVentas);

    expect(myTotals(procedures, executions, onlyVentas).avgCompletionMs).toBe(
      10 * MINUTE,
    );
  });

  it('without executions everything is 0 and there is no average', () => {
    expect(myTotals([], [], ALL)).toEqual({
      started: 0,
      completed: 0,
      inProgress: 0,
      abandoned: 0,
      avgCompletionMs: null,
    });
  });
});

describe('buildResume', () => {
  const STALE_BEFORE = new Date('2026-11-05T15:00:00.000Z');
  const inProgress = (
    procedureVersionId: string,
    currentStepStartedAt: Date,
    step = 1,
  ): InProgressExecution => {
    const v = ALL.get(procedureVersionId)!;
    return {
      executionId: `1e000000-0000-4000-8000-0000000000${procedureVersionId.slice(-2)}`,
      procedureId: v.procedureId,
      procedureVersionId,
      startedAt: new Date('2026-11-01T13:00:00.000Z'),
      currentStepId: v.steps[step - 1].id,
      currentStepOrder: step,
      currentStepStartedAt,
    };
  };

  it('the current step with its title, the total of steps and the last activity', () => {
    const moved = new Date('2026-11-06T12:00:00.000Z');

    expect(
      buildResume([inProgress(CIERRE_V2, moved, 2)], ALL, STALE_BEFORE),
    ).toEqual([
      {
        executionId: '1e000000-0000-4000-8000-000000000002',
        procedureId: CIERRE,
        procedureVersionId: CIERRE_V2,
        currentStep: {
          stepId: V_CIERRE_V2.steps[1].id,
          order: 2,
          title: 'Comparar',
        },
        totalSteps: 3,
        startedAt: new Date('2026-11-01T13:00:00.000Z'),
        lastActivityAt: moved,
        stale: false,
      },
    ]);
  });

  it('without progress for more than 24 hours it is stale, but still listed', () => {
    const [item] = buildResume(
      [inProgress(CIERRE_V2, new Date('2026-11-05T14:59:59.000Z'))],
      ALL,
      STALE_BEFORE,
    );

    expect(item.stale).toBe(true);
  });

  it('exactly at the limit it is not stale yet', () => {
    const [item] = buildResume(
      [inProgress(CIERRE_V2, STALE_BEFORE)],
      ALL,
      STALE_BEFORE,
    );

    expect(item.stale).toBe(false);
  });

  it('an execution of a procedure that is no longer in their areas is left out', () => {
    const onlyVentas = new Map([[CIERRE_V2, V_CIERRE_V2]]);
    const moved = new Date('2026-11-06T12:00:00.000Z');

    const items = buildResume(
      [inProgress(CIERRE_V2, moved), inProgress(RECEPCION_V1, moved)],
      onlyVentas,
      STALE_BEFORE,
    );

    expect(items.map((i) => i.procedureVersionId)).toEqual([CIERRE_V2]);
  });

  it('keeps the order of the repository (the most recently moved first)', () => {
    const items = buildResume(
      [
        inProgress(RECEPCION_V1, new Date('2026-11-06T12:00:00.000Z')),
        inProgress(CIERRE_V2, new Date('2026-11-06T10:00:00.000Z')),
      ],
      ALL,
      STALE_BEFORE,
    );

    expect(items.map((i) => i.procedureId)).toEqual([RECEPCION, CIERRE]);
  });
});
