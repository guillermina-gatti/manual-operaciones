import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ExecutionView } from '@/components/executions/ExecutionView';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { EXECUTION_ID, STEPS, execution } from '../../support/executions';

const mocks = vi.hoisted(() => ({
  getExecution: vi.fn(),
  completeStep: vi.fn(),
  useSession: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getExecution: mocks.getExecution,
  completeStep: mocks.completeStep,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
}));

const ELENA: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};
const EMILIO: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000005', name: 'Emilio Empleado de Operaciones', role: 'EMPLOYEE' },
  status: 'ready',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: EXECUTION_ID };
  mocks.useSession.mockReturnValue(ELENA);
  mocks.getExecution.mockResolvedValue(execution(0));
});

const heading = () => screen.findByRole('heading', { level: 1, name: 'Cierre de caja' });
const stepItem = (n: number) =>
  within(screen.getByRole('list', { name: 'Pasos' })).getAllByRole('listitem')[n - 1];
const finishButton = () => screen.getByRole('button', { name: 'Terminé este paso' });

describe('loading and session', () => {
  test('shows the loading state while the execution arrives', () => {
    mocks.getExecution.mockReturnValue(new Promise(() => {}));
    render(<ExecutionView />);

    expect(screen.getByText('Cargando la ejecución…')).toBeInTheDocument();
  });

  test('asks for the execution of that id, with an abort signal', async () => {
    render(<ExecutionView />);

    await heading();
    expect(mocks.getExecution).toHaveBeenCalledWith(EXECUTION_ID, expect.any(AbortSignal));
  });

  test('an id that is not a UUID → not found, without calling the API', () => {
    mocks.params = { id: 'abc' };
    render(<ExecutionView />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se encontró la ejecución.');
    expect(mocks.getExecution).not.toHaveBeenCalled();
  });

  test('changing the user asks for the execution again', async () => {
    const { rerender } = render(<ExecutionView />);
    await heading();

    mocks.useSession.mockReturnValue(EMILIO);
    mocks.getExecution.mockRejectedValue(new ApiError(404));
    rerender(<ExecutionView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la ejecución.');
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
  });
});

describe('errors when loading', () => {
  // The way back is the page's "Volver a procedimientos" link, above this component.
  test('404 → not found, without "Reintentar"', async () => {
    mocks.getExecution.mockRejectedValue(new ApiError(404));
    render(<ExecutionView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la ejecución.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  test('503 → unavailable, and "Reintentar" asks again', async () => {
    mocks.getExecution.mockRejectedValueOnce(new ApiError(503));
    render(<ExecutionView />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await heading();
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
  });
});

describe('an execution in progress', () => {
  test('shows the progress and every step in order', async () => {
    render(<ExecutionView />);

    await heading();
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Pasos terminados' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    STEPS.forEach((step, i) => expect(stepItem(i + 1)).toHaveTextContent(step.title));
  });

  test('only the current step has the button, and it says when it started', async () => {
    render(<ExecutionView />);

    await heading();
    expect(screen.getAllByRole('button', { name: 'Terminé este paso' })).toHaveLength(1);
    expect(within(stepItem(1)).getByRole('button', { name: 'Terminé este paso' })).toBeInTheDocument();
    expect(stepItem(1)).toHaveTextContent('En curso');
    expect(stepItem(1)).toHaveTextContent('Empezó a las 10:00');
    expect(stepItem(2)).toHaveTextContent('Pendiente');
  });

  test('a resumed execution shows the finished steps with their duration', async () => {
    mocks.getExecution.mockResolvedValue(execution(2));
    render(<ExecutionView />);

    await heading();
    expect(screen.getByText('Retomaste donde quedaste.')).toBeInTheDocument();
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument();
    expect(stepItem(1)).toHaveTextContent('Terminado');
    expect(stepItem(1)).toHaveTextContent('3 min');
    expect(stepItem(2)).toHaveTextContent('Terminó a las 10:06');
    expect(within(stepItem(3)).getByRole('button', { name: 'Terminé este paso' })).toBeInTheDocument();
  });

  test('a new execution does not say it was resumed', async () => {
    render(<ExecutionView />);

    await heading();
    expect(screen.queryByText('Retomaste donde quedaste.')).not.toBeInTheDocument();
  });
});

describe('completing a step', () => {
  test('completes the current step and shows the execution the API returns', async () => {
    mocks.completeStep.mockResolvedValue(execution(1));
    render(<ExecutionView />);
    await heading();

    await userEvent.click(finishButton());

    expect(mocks.completeStep).toHaveBeenCalledWith(EXECUTION_ID, STEPS[0].stepId);
    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument();
    expect(stepItem(1)).toHaveTextContent('Terminado');
    expect(within(stepItem(2)).getByRole('button', { name: 'Terminé este paso' })).toHaveFocus();
    expect(mocks.getExecution).toHaveBeenCalledTimes(1);
  });

  test('a double click completes only once', async () => {
    let resolve!: (value: unknown) => void;
    mocks.completeStep.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ExecutionView />);
    await heading();

    const button = finishButton();
    await userEvent.dblClick(button);

    expect(mocks.completeStep).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Guardando…');

    resolve(execution(1));
    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument();
  });

  test.each([
    ['STEP_ALREADY_FINISHED', 'Ese paso ya estaba terminado.'],
    ['STEP_OUT_OF_ORDER', 'Ese no es el paso actual.'],
    ['EXECUTION_COMPLETED', 'La ejecución ya estaba completa.'],
  ])('409 %s → a notice, and the execution is asked again', async (reason, message) => {
    mocks.completeStep.mockRejectedValue(new ApiError(409, [], undefined, reason));
    render(<ExecutionView />);
    await heading();

    mocks.getExecution.mockResolvedValue(execution(2));
    await userEvent.click(finishButton());

    expect(await screen.findByText('Paso 3 de 4')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
  });

  test('404 → the whole screen says the execution was not found', async () => {
    mocks.completeStep.mockRejectedValue(new ApiError(404));
    render(<ExecutionView />);
    await heading();

    await userEvent.click(finishButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la ejecución.');
    expect(screen.queryByRole('list', { name: 'Pasos' })).not.toBeInTheDocument();
  });

  test('503 → a notice above the steps, and the button can be pressed again', async () => {
    mocks.completeStep.mockRejectedValueOnce(new ApiError(503)).mockResolvedValue(execution(1));
    render(<ExecutionView />);
    await heading();

    await userEvent.click(finishButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );
    expect(finishButton()).toBeEnabled();

    await userEvent.click(finishButton());
    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('a completed execution', () => {
  test('completing the last step shows the completed state', async () => {
    mocks.getExecution.mockResolvedValue(execution(3));
    mocks.completeStep.mockResolvedValue(execution(4));
    render(<ExecutionView />);
    await heading();

    await userEvent.click(finishButton());

    expect(await screen.findByText('Completaste el procedimiento')).toBeInTheDocument();
  });

  test('shows the total time, every duration, no button, and a link to choose another', async () => {
    mocks.getExecution.mockResolvedValue(execution(4));
    render(<ExecutionView />);
    await heading();

    expect(screen.getByText('Completaste el procedimiento')).toBeInTheDocument();
    expect(screen.getByText('Tiempo total: 12 min')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Pasos terminados' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    STEPS.forEach((_, i) => expect(stepItem(i + 1)).toHaveTextContent('3 min'));
    expect(screen.queryByRole('button', { name: 'Terminé este paso' })).not.toBeInTheDocument();
    expect(screen.queryByText('Retomaste donde quedaste.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elegir otro procedimiento' })).toHaveAttribute(
      'href',
      '/ejecuciones',
    );
  });
});

// With cacheComponents, Next hides the page with <Activity> instead of unmounting it, and shows
// the same instance again when the user comes back to this execution.
describe('coming back to the screen (Activity)', () => {
  const view = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <ExecutionView />
    </Activity>
  );

  test('shows the execution as it is now, not as it was left', async () => {
    mocks.completeStep.mockResolvedValue(execution(1));
    const { rerender } = render(view('visible'));
    await heading();
    await userEvent.click(finishButton());
    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument();

    // Meanwhile, step 2 was finished in another tab.
    mocks.getExecution.mockResolvedValue(execution(2));
    rerender(view('hidden'));
    rerender(view('visible'));

    expect(await screen.findByText('Paso 3 de 4')).toBeInTheDocument();
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
    expect(finishButton()).toBeEnabled();
  });

  test('coming back does not show an old notice', async () => {
    mocks.completeStep.mockRejectedValue(new ApiError(503));
    const { rerender } = render(view('visible'));
    await heading();
    await userEvent.click(finishButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(view('hidden'));
    rerender(view('visible'));

    await vi.waitFor(() => expect(mocks.getExecution).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(finishButton()).toBeEnabled();
  });
});

test('keeps a place for the assistant next to the steps', async () => {
  render(<ExecutionView />);

  await heading();
  expect(document.querySelector('[data-slot="chat-panel"]')).not.toBeNull();
});
