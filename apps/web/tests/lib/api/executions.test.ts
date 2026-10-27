import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createExecutionsApi } from '@/lib/api/executions';
import type { ExecutionResponse } from '@/lib/api/executions';

const EXECUTION_ID = '1e000000-0000-4000-8000-000000000001';
const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const STEP_ID = '1c000000-0000-4000-8000-000000000011';

// Same shape as the API's ExecutionResponse: if a web type drifts, this stops compiling.
const EXECUTION: ExecutionResponse = {
  id: EXECUTION_ID,
  procedureId: PROCEDURE_ID,
  procedureVersionId: '1b000000-0000-4000-8000-000000000002',
  status: 'IN_PROGRESS',
  startedAt: '2026-10-27T13:00:00.000Z',
  finishedAt: null,
  currentStepId: STEP_ID,
  steps: [
    {
      stepId: STEP_ID,
      order: 1,
      title: 'Contar el efectivo',
      startedAt: '2026-10-27T13:00:00.000Z',
      finishedAt: null,
      durationMs: null,
    },
  ],
};

function fakeClient() {
  const request = vi.fn().mockResolvedValue(EXECUTION);
  const client: ApiClient = { request };
  return { api: createExecutionsApi(client), request };
}

describe('startExecution', () => {
  test('posts the procedure id as JSON and returns the execution', async () => {
    const { api, request } = fakeClient();
    const signal = new AbortController().signal;

    const result = await api.startExecution(PROCEDURE_ID, signal);

    expect(result).toBe(EXECUTION);
    expect(request).toHaveBeenCalledWith('/api/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedureId: PROCEDURE_ID }),
      signal,
    });
  });
});

describe('getExecution', () => {
  test('gets the execution by id with the abort signal', async () => {
    const { api, request } = fakeClient();
    const signal = new AbortController().signal;

    await api.getExecution(EXECUTION_ID, signal);

    expect(request).toHaveBeenCalledWith(`/api/executions/${EXECUTION_ID}`, { signal });
  });

  test('encodes the id so it cannot change the path', async () => {
    const { api, request } = fakeClient();

    await api.getExecution('../documents', undefined);

    expect(request).toHaveBeenCalledWith('/api/executions/..%2Fdocuments', { signal: undefined });
  });
});

describe('completeStep', () => {
  test('posts to the complete route of that step, without a body', async () => {
    const { api, request } = fakeClient();

    await api.completeStep(EXECUTION_ID, STEP_ID);

    expect(request).toHaveBeenCalledWith(
      `/api/executions/${EXECUTION_ID}/steps/${STEP_ID}/complete`,
      { method: 'POST', signal: undefined },
    );
  });
});
