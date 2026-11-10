import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ExecutionView } from '@/components/executions/ExecutionView';
import { ApiError } from '@/lib/api';
import type { ExecutionResponse } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { EXECUTION_ID, STEPS, execution } from '../../support/executions';

const mocks = vi.hoisted(() => ({
  getExecution: vi.fn(),
  completeStep: vi.fn(),
  restartExecution: vi.fn(),
  push: vi.fn(),
  useSession: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getExecution: mocks.getExecution,
  completeStep: mocks.completeStep,
  restartExecution: mocks.restartExecution,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: mocks.push }),
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
  within(screen.getByRole('list', { name: 'Pasos del procedimiento' })).getAllByRole('listitem')[
    n - 1
  ];
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
  test('the header says the procedure, what the screen is for and its area', async () => {
    render(<ExecutionView />);

    await heading();
    expect(
      screen.getByText('Seguí los pasos en orden y marcá cada uno cuando lo termines.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
  });

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
    expect(screen.getByText('Retomaste donde quedaste')).toBeInTheDocument();
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument();
    expect(stepItem(1)).toHaveTextContent('Terminado');
    expect(stepItem(1)).toHaveTextContent('3 min');
    expect(stepItem(2)).toHaveTextContent('Terminó a las 10:06');
    expect(within(stepItem(3)).getByRole('button', { name: 'Terminé este paso' })).toBeInTheDocument();
  });

  test('each step says its state and its times, the current one marked as the step', async () => {
    mocks.getExecution.mockResolvedValue(execution(2));
    render(<ExecutionView />);
    await heading();

    expect(stepItem(1)).toHaveTextContent('TerminadoTerminó a las 10:03 · duró 3 min');
    expect(stepItem(3)).toHaveTextContent('En cursoEmpezó a las 10:06');
    expect(stepItem(3)).toHaveAttribute('aria-current', 'step');
    expect(stepItem(4)).toHaveTextContent('Pendiente');
    expect(stepItem(4)).not.toHaveAttribute('aria-current');
    expect(within(stepItem(4)).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Paso 4: Guardar el efectivo en la caja fuerte',
    );
  });

  test('the last step says so on its button', async () => {
    mocks.getExecution.mockResolvedValue(execution(3));
    render(<ExecutionView />);
    await heading();

    expect(
      within(stepItem(4)).getByRole('button', { name: 'Terminé el último paso' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminé este paso' })).not.toBeInTheDocument();
  });

  test('a new execution does not say it was resumed', async () => {
    render(<ExecutionView />);

    await heading();
    expect(screen.queryByText('Retomaste donde quedaste')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('list', { name: 'Pasos del procedimiento' })).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: 'Terminé el último paso' }));

    expect(await screen.findByRole('heading', { name: '¡Procedimiento completado!' })).toBeInTheDocument();
  });

  test('shows the completed panel, every duration and no button', async () => {
    mocks.getExecution.mockResolvedValue(execution(4));
    render(<ExecutionView />);
    await heading();

    const panel = screen.getByRole('status');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent(
      '¡Procedimiento completado!',
    );
    expect(panel).toHaveTextContent('Terminaste Cierre de caja en 12 min. Quedó registrado.');
    expect(screen.getByRole('progressbar', { name: 'Pasos terminados' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    STEPS.forEach((_, i) => expect(stepItem(i + 1)).toHaveTextContent('3 min'));
    expect(screen.queryByRole('button', { name: 'Terminé este paso' })).not.toBeInTheDocument();
    expect(screen.queryByText('Retomaste donde quedaste')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Ver otro procedimiento' })).toHaveAttribute(
      'href',
      '/ejecuciones',
    );
    expect(within(panel).getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  test('the completed panel goes between the progress and the steps', async () => {
    mocks.getExecution.mockResolvedValue(execution(4));
    render(<ExecutionView />);
    await heading();

    const progress = screen.getByRole('progressbar', { name: 'Pasos terminados' });
    const panel = screen.getByRole('status');
    const steps = screen.getByRole('list', { name: 'Pasos del procedimiento' });
    expect(progress.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('an execution in progress has no completed panel', async () => {
    render(<ExecutionView />);
    await heading();

    expect(screen.queryByRole('heading', { name: '¡Procedimiento completado!' })).not.toBeInTheDocument();
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

test('the side column has the summary above the assistant', async () => {
  render(<ExecutionView />);
  await heading();

  const summary = screen.getByRole('region', { name: 'Resumen' });
  const assistant = screen.getByRole('complementary', { name: 'Asistente' });
  expect(summary.parentElement).toBe(assistant.parentElement);
  expect(summary.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(summary).toHaveTextContent('Pasos terminados0 de 4');
});


// ── HU33: the procedure changed while it runs ────────────────────────────────

const NEW_ID = '1e000000-0000-4000-8000-000000000002';

// The execution after `finished` steps, with v3 published since it started.
const changed = (critical: boolean, finished = 1): ExecutionResponse => ({
  ...execution(finished),
  versionChange: {
    changed: true,
    critical,
    currentVersionId: '1b000000-0000-4000-8000-000000000009',
    currentVersionNumber: 3,
    changes: [
      {
        versionNumber: 3,
        isCritical: critical,
        changeSummary: 'Cambia el límite de caja',
        publishedAt: '2026-11-10T12:00:00.000Z',
      },
    ],
  },
});

const notice = () => screen.findByRole('alert', { name: /El procedimiento/ });

describe('HU33: a change that is not critical', () => {
  test('says so with what changed, and offers both ways', async () => {
    mocks.getExecution.mockResolvedValue(changed(false));
    render(<ExecutionView />);

    const box = await notice();
    expect(box).toHaveAccessibleName('El procedimiento cambió');
    expect(box).toHaveTextContent('Mientras lo ejecutabas se publicó la versión 3.');
    expect(within(box).getByRole('list', { name: 'Qué cambió' })).toHaveTextContent(
      'Versión 3 · Cambia el límite de caja',
    );
    expect(within(box).getByRole('button', { name: 'Reiniciar con la nueva' })).toBeEnabled();
    expect(within(box).getByRole('button', { name: 'Terminar con esta versión' })).toBeEnabled();
    // The steps go on as usual.
    expect(finishButton()).toBeEnabled();
  });

  test('"Terminar con esta versión" hides the notice and keeps the steps', async () => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValue(changed(false));
    render(<ExecutionView />);

    await user.click(await screen.findByRole('button', { name: 'Terminar con esta versión' }));

    expect(screen.queryByRole('alert', { name: /El procedimiento/ })).not.toBeInTheDocument();
    expect(finishButton()).toBeEnabled();
    expect(mocks.restartExecution).not.toHaveBeenCalled();
  });

  test('loading the execution again shows the notice again while it is pending', async () => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValue(changed(false));
    const { unmount } = render(<ExecutionView />);
    await user.click(await screen.findByRole('button', { name: 'Terminar con esta versión' }));
    unmount();

    render(<ExecutionView />);

    expect(await notice()).toBeInTheDocument();
  });

  test('a version without a summary says so', async () => {
    const withoutSummary = changed(false);
    withoutSummary.versionChange!.changes[0].changeSummary = null;
    mocks.getExecution.mockResolvedValue(withoutSummary);
    render(<ExecutionView />);

    expect(await notice()).toHaveTextContent('Versión 3 · Sin resumen del cambio');
  });
});

describe('HU33: a critical change', () => {
  test('only offers to restart, and the current step cannot be finished', async () => {
    mocks.getExecution.mockResolvedValue(changed(true));
    render(<ExecutionView />);

    const box = await notice();
    expect(box).toHaveAccessibleName('El procedimiento tuvo un cambio crítico');
    expect(box).toHaveTextContent('Para seguir, reiniciá con la versión nueva: empieza desde el paso 1.');
    expect(box).toHaveTextContent('Versión 3 · Cambio crítico · Cambia el límite de caja');
    expect(within(box).getByRole('button', { name: 'Reiniciar con la nueva' })).toBeInTheDocument();
    expect(
      within(box).queryByRole('button', { name: 'Terminar con esta versión' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminé este paso' })).not.toBeInTheDocument();
    expect(within(stepItem(2)).getByText('Para seguir, reiniciá con la versión nueva.')).toBeInTheDocument();
  });

  test('a 409 PROCEDURE_CHANGED_CRITICAL when finishing a step shows the notice it asks again for', async () => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValueOnce(execution(1)).mockResolvedValueOnce(changed(true));
    mocks.completeStep.mockRejectedValue(
      new ApiError(409, [], undefined, 'PROCEDURE_CHANGED_CRITICAL'),
    );
    render(<ExecutionView />);

    await user.click(await screen.findByRole('button', { name: 'Terminé este paso' }));

    expect(
      await screen.findByText(
        'El procedimiento tuvo un cambio crítico. Para seguir, reiniciá con la versión nueva.',
      ),
    ).toBeInTheDocument();
    expect(await notice()).toHaveAccessibleName('El procedimiento tuvo un cambio crítico');
  });
});

describe('HU33: restarting', () => {
  test('restarts once and opens the new execution', async () => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValue(changed(true));
    let answer: (value: ExecutionResponse) => void = () => {};
    mocks.restartExecution.mockReturnValue(
      new Promise<ExecutionResponse>((resolve) => {
        answer = resolve;
      }),
    );
    render(<ExecutionView />);

    const button = await screen.findByRole('button', { name: 'Reiniciar con la nueva' });
    await user.click(button);
    await user.click(button);

    expect(screen.getByRole('button', { name: 'Reiniciando…' })).toBeDisabled();
    answer({ ...execution(0), id: NEW_ID });
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${NEW_ID}`));
    expect(mocks.restartExecution).toHaveBeenCalledTimes(1);
    expect(mocks.restartExecution).toHaveBeenCalledWith(EXECUTION_ID);
  });

  test.each([
    ['EXECUTION_RESTARTED', 'Esta ejecución ya se reinició con la versión nueva.'],
    ['PROCEDURE_NOT_CHANGED', 'El procedimiento no cambió: podés seguir con esta ejecución.'],
  ])('409 %s → a friendly notice, and the execution is asked again', async (reason, message) => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValueOnce(changed(false)).mockResolvedValueOnce(execution(1));
    mocks.restartExecution.mockRejectedValue(new ApiError(409, [], undefined, reason));
    render(<ExecutionView />);

    await user.click(await screen.findByRole('button', { name: 'Reiniciar con la nueva' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('404 → the whole screen says the execution was not found', async () => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValue(changed(true));
    mocks.restartExecution.mockRejectedValue(new ApiError(404));
    render(<ExecutionView />);

    await user.click(await screen.findByRole('button', { name: 'Reiniciar con la nueva' }));

    expect(await screen.findByText('No se encontró la ejecución.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pasos del procedimiento' })).not.toBeInTheDocument();
  });

  test('503 → a notice, and "Reiniciar con la nueva" can be pressed again', async () => {
    const user = userEvent.setup();
    mocks.getExecution.mockResolvedValue(changed(true));
    mocks.restartExecution.mockRejectedValue(new ApiError(503));
    render(<ExecutionView />);

    await user.click(await screen.findByRole('button', { name: 'Reiniciar con la nueva' }));

    expect(await screen.findByText(/no está disponible|Intentá de nuevo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reiniciar con la nueva' })).toBeEnabled();
  });
});

describe('HU33: a restarted or completed execution', () => {
  test('a restarted one says so, with a way back, no button and no assistant', async () => {
    mocks.getExecution.mockResolvedValue({
      ...execution(1),
      status: 'RESTARTED',
      finishedAt: '2026-10-27T13:05:00.000Z',
      currentStepId: null,
    });
    render(<ExecutionView />);

    expect(
      await screen.findByText('Esta ejecución se reinició con la versión nueva del procedimiento.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elegí el procedimiento otra vez' })).toHaveAttribute(
      'href',
      '/ejecuciones',
    );
    expect(screen.queryByRole('button', { name: /Terminé/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Asistente' })).not.toBeInTheDocument();
  });

  test('a completed one shows no notice, whatever the API says', async () => {
    mocks.getExecution.mockResolvedValue({ ...changed(true, STEPS.length), status: 'COMPLETED' });
    render(<ExecutionView />);

    await heading();
    expect(screen.queryByRole('alert', { name: /El procedimiento/ })).not.toBeInTheDocument();
  });

  test('without versionChange in the answer there is no notice', async () => {
    render(<ExecutionView />);

    await heading();
    expect(screen.queryByRole('alert', { name: /El procedimiento/ })).not.toBeInTheDocument();
  });
});
