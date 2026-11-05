// Spec 010 (T10): el panel del asistente montado desde la ejecución.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExecutionChatPanel } from '@/components/chat/ExecutionChatPanel';
import type { ExecutionResponse } from '@/lib/api';
import { controlledStream, doneOf, type ControlledStream } from '../../support/chat';

const fetchMock = vi.fn<typeof fetch>();
let streams: ControlledStream[];

beforeEach(() => {
  streams = [];
  fetchMock.mockImplementation(async () => {
    const stream = controlledStream();
    streams.push(stream);
    return stream.response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const step = (order: number, title: string) => ({
  stepId: `step-${order}`,
  order,
  title,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
});

const execution = (currentStepId: string | null): ExecutionResponse => ({
  id: 'exec-1',
  procedureId: 'proc-1',
  procedureVersionId: 'version-1',
  status: currentStepId ? 'IN_PROGRESS' : 'COMPLETED',
  startedAt: '2026-11-04T10:00:00.000Z',
  finishedAt: currentStepId ? null : '2026-11-04T10:30:00.000Z',
  currentStepId,
  steps: [step(1, 'Abrir la caja'), step(2, 'Contar el efectivo')],
});

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string) as Record<string, unknown>;

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  const calls = fetchMock.mock.calls.length;
  await user.type(screen.getByRole('textbox', { name: 'Tu pregunta' }), text);
  await user.click(screen.getByRole('button', { name: /Preguntar/ }));
  await waitFor(() => expect(fetchMock.mock.calls.length).toBe(calls + 1));
}

describe('ExecutionChatPanel (spec 010, T10)', () => {
  test('toma la versión y el paso actual de la ejecución', async () => {
    const user = userEvent.setup();
    render(<ExecutionChatPanel execution={execution('step-1')} />);

    expect(screen.getByText('Paso 1 · Abrir la caja')).toBeInTheDocument();
    await ask(user, 'hola');
    expect(bodyOf(0).context).toEqual({ procedureVersionId: 'version-1', stepId: 'step-1' });
  });

  test('E14: al cambiar el paso vacía la conversación y la próxima pregunta va sin conversationId', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ExecutionChatPanel execution={execution('step-1')} />);

    await ask(user, 'primera');
    streams[0].send('start', { conversationId: 'conv-1' });
    streams[0].send('done', doneOf({ conversationId: 'conv-1' }));
    streams[0].close();
    await screen.findByRole('link', { name: /Fuente 1/ });

    rerender(<ExecutionChatPanel execution={execution('step-2')} />);

    expect(screen.getByText('Paso 2 · Contar el efectivo')).toBeInTheDocument();
    expect(screen.queryByText('primera')).not.toBeInTheDocument();
    await ask(user, 'segunda');
    expect(bodyOf(1)).toEqual({
      message: 'segunda',
      context: { procedureVersionId: 'version-1', stepId: 'step-2' },
    });
  });

  test('E14: al cambiar el paso corta la respuesta en curso', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ExecutionChatPanel execution={execution('step-1')} />);

    await ask(user, 'primera');
    streams[0].send('start', { conversationId: 'conv-1' });
    rerender(<ExecutionChatPanel execution={execution('step-2')} />);

    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('primera')).not.toBeInTheDocument();
  });

  test('E15: completada (sin paso actual), no muestra nada', () => {
    const { container } = render(<ExecutionChatPanel execution={execution(null)} />);

    expect(container).toBeEmptyDOMElement();
  });
});
