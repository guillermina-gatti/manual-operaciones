import { describe, expect, test } from 'vitest';
import { summarizeExecution } from '@/lib/executions/summary';
import { execution } from '../../support/executions';

describe('summarizeExecution', () => {
  test('just started: step 1 of 4, nothing finished, not resumed', () => {
    const summary = summarizeExecution(execution(0));

    expect(summary).toMatchObject({
      total: 4,
      finishedCount: 0,
      currentNumber: 1,
      resumed: false,
      totalDurationMs: null,
    });
    expect(summary.currentStep?.title).toBe('Contar el efectivo');
  });

  test('halfway: the current step is the one in currentStepId and it counts as resumed', () => {
    const summary = summarizeExecution(execution(2));

    expect(summary).toMatchObject({
      total: 4,
      finishedCount: 2,
      currentNumber: 3,
      resumed: true,
    });
    expect(summary.currentStep?.title).toBe('Comparar con el reporte del sistema');
  });

  test('completed: no current step, not resumed, total duration from start to finish', () => {
    const summary = summarizeExecution(execution(4));

    expect(summary).toMatchObject({
      total: 4,
      finishedCount: 4,
      currentStep: null,
      currentNumber: null,
      resumed: false,
      // 4 steps of 3 minutes each.
      totalDurationMs: 12 * 60_000,
    });
  });
});
