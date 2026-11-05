import type { ExecutionView } from '../execution.service';
import { toExecutionResponse } from './execution.response';

const view: ExecutionView = {
  id: '1d000000-0000-4000-8000-000000000001',
  procedureId: '1a000000-0000-4000-8000-000000000001',
  procedureVersionId: '1b000000-0000-4000-8000-000000000001',
  status: 'IN_PROGRESS',
  startedAt: new Date('2026-10-27T10:00:00.000Z'),
  finishedAt: null,
  currentStepId: '1c000000-0000-4000-8000-000000000002',
  steps: [
    {
      stepId: '1c000000-0000-4000-8000-000000000001',
      order: 1,
      title: 'Contar el efectivo',
      startedAt: new Date('2026-10-27T10:00:00.000Z'),
      finishedAt: new Date('2026-10-27T10:03:00.000Z'),
      durationMs: 180000,
    },
    {
      stepId: '1c000000-0000-4000-8000-000000000002',
      order: 2,
      title: 'Comparar con el reporte del sistema',
      startedAt: new Date('2026-10-27T10:03:00.000Z'),
      finishedAt: null,
      durationMs: null,
    },
    {
      stepId: '1c000000-0000-4000-8000-000000000003',
      order: 3,
      title: 'Guardar el efectivo en la caja fuerte',
      startedAt: null,
      finishedAt: null,
      durationMs: null,
    },
  ],
};

describe('toExecutionResponse', () => {
  it('maps every field, with dates as ISO strings', () => {
    expect(toExecutionResponse(view)).toEqual({
      id: view.id,
      procedureId: view.procedureId,
      procedureVersionId: view.procedureVersionId,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-27T10:00:00.000Z',
      finishedAt: null,
      currentStepId: '1c000000-0000-4000-8000-000000000002',
      steps: [
        {
          stepId: '1c000000-0000-4000-8000-000000000001',
          order: 1,
          title: 'Contar el efectivo',
          startedAt: '2026-10-27T10:00:00.000Z',
          finishedAt: '2026-10-27T10:03:00.000Z',
          durationMs: 180000,
        },
        {
          stepId: '1c000000-0000-4000-8000-000000000002',
          order: 2,
          title: 'Comparar con el reporte del sistema',
          startedAt: '2026-10-27T10:03:00.000Z',
          finishedAt: null,
          durationMs: null,
        },
        {
          stepId: '1c000000-0000-4000-8000-000000000003',
          order: 3,
          title: 'Guardar el efectivo en la caja fuerte',
          startedAt: null,
          finishedAt: null,
          durationMs: null,
        },
      ],
    });
  });

  it('maps a completed execution', () => {
    const completed: ExecutionView = {
      ...view,
      status: 'COMPLETED',
      finishedAt: new Date('2026-10-27T10:09:00.000Z'),
      currentStepId: null,
    };

    expect(toExecutionResponse(completed)).toMatchObject({
      status: 'COMPLETED',
      finishedAt: '2026-10-27T10:09:00.000Z',
      currentStepId: null,
    });
  });

  // Built field by field: anything extra on the input never reaches the client.
  it('does not copy fields that are not part of the response, such as userId', () => {
    const leaky = {
      ...view,
      userId: '0b000000-0000-4000-8000-000000000003',
      steps: view.steps.map((s) => ({ ...s, executionId: view.id })),
    } as ExecutionView;

    const response = toExecutionResponse(leaky);

    expect(response).not.toHaveProperty('userId');
    response.steps.forEach((s) => expect(s).not.toHaveProperty('executionId'));
  });
});
