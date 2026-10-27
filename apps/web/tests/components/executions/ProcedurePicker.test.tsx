import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedurePicker } from '@/components/executions/ProcedurePicker';
import { ApiError } from '@/lib/api';
import { CIERRE_DE_CAJA, EXECUTION_ID, RECEPCION, execution } from '../../support/executions';

const mocks = vi.hoisted(() => ({
  startExecution: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  startExecution: mocks.startExecution,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startExecution.mockResolvedValue(execution(0));
});

const card = (name: string) =>
  screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const startButton = (name: string) =>
  within(card(name)).getByRole('button', { name: 'Comenzar o continuar' });

describe('sample procedures', () => {
  test('shows both procedures with their area', () => {
    render(<ProcedurePicker />);

    expect(within(card('Cierre de caja')).getByText('Ventas')).toBeInTheDocument();
    expect(within(card('Recepción de mercadería')).getByText('Operaciones')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Comenzar o continuar' })).toHaveLength(2);
  });

  test('does not call the API until a procedure is chosen', () => {
    render(<ProcedurePicker />);

    expect(mocks.startExecution).not.toHaveBeenCalled();
  });

  test('empty list → empty state', () => {
    render(<ProcedurePicker procedures={[]} />);

    expect(screen.getByText('Todavía no hay procedimientos para ejecutar.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('starting or resuming', () => {
  test('starts the chosen procedure and opens its execution', async () => {
    render(<ProcedurePicker />);

    await userEvent.click(startButton('Cierre de caja'));

    expect(mocks.startExecution).toHaveBeenCalledWith(CIERRE_DE_CAJA);
    expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${EXECUTION_ID}`);
  });

  test('an execution already in progress (200) opens the same way', async () => {
    mocks.startExecution.mockResolvedValue(execution(2));
    render(<ProcedurePicker />);

    await userEvent.click(startButton('Recepción de mercadería'));

    expect(mocks.startExecution).toHaveBeenCalledWith(RECEPCION);
    expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${EXECUTION_ID}`);
  });

  test('a double click starts only once and every button waits', async () => {
    let resolve!: (value: unknown) => void;
    mocks.startExecution.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ProcedurePicker />);

    const button = startButton('Cierre de caja');
    await userEvent.dblClick(button);

    expect(mocks.startExecution).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Abriendo…');
    expect(startButton('Recepción de mercadería')).toBeDisabled();

    resolve(execution(0));
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });
});

// With cacheComponents, Next hides the page with <Activity> instead of unmounting it, and shows
// the same instance again when the user comes back to /ejecuciones.
describe('coming back to the screen (Activity)', () => {
  const picker = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <ProcedurePicker />
    </Activity>
  );

  test('after a successful start, coming back shows the buttons enabled again', async () => {
    const { rerender } = render(picker('visible'));
    await userEvent.click(startButton('Cierre de caja'));
    expect(mocks.push).toHaveBeenCalledTimes(1);

    rerender(picker('hidden'));
    rerender(picker('visible'));

    const buttons = screen.getAllByRole('button', { name: 'Comenzar o continuar' });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByText('Abriendo…')).not.toBeInTheDocument();

    await userEvent.click(startButton('Recepción de mercadería'));
    expect(mocks.startExecution).toHaveBeenLastCalledWith(RECEPCION);
    expect(mocks.push).toHaveBeenCalledTimes(2);
  });

  test('coming back does not show an old error', async () => {
    mocks.startExecution.mockRejectedValue(new ApiError(503));
    const { rerender } = render(picker('visible'));
    await userEvent.click(startButton('Cierre de caja'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(picker('hidden'));
    rerender(picker('visible'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a start that answers after leaving the screen does not navigate', async () => {
    let resolve!: (value: unknown) => void;
    mocks.startExecution.mockReturnValue(new Promise((r) => (resolve = r)));
    const { rerender } = render(picker('visible'));
    await userEvent.click(startButton('Cierre de caja'));

    rerender(picker('hidden'));
    resolve(execution(0));
    await Promise.resolve();

    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  test('404 → the procedure is not available, and the buttons work again', async () => {
    mocks.startExecution.mockRejectedValue(new ApiError(404));
    render(<ProcedurePicker />);

    await userEvent.click(startButton('Cierre de caja'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No encontramos ese procedimiento para tu área.',
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(startButton('Cierre de caja')).toBeEnabled();
  });

  test('503 → service unavailable, and choosing again retries', async () => {
    mocks.startExecution.mockRejectedValueOnce(new ApiError(503));
    render(<ProcedurePicker />);

    await userEvent.click(startButton('Cierre de caja'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );

    await userEvent.click(startButton('Cierre de caja'));

    expect(mocks.startExecution).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${EXECUTION_ID}`);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
