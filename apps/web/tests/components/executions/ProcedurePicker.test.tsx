import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedurePicker } from '@/components/executions/ProcedurePicker';
import { ApiError } from '@/lib/api';
import type { ProcedureListItem, ProcedureListPage } from '@/lib/procedures';
import type { SessionState } from '@/lib/session';
import { CIERRE_DE_CAJA, EXECUTION_ID, RECEPCION, execution } from '../../support/executions';

const mocks = vi.hoisted(() => ({
  startExecution: vi.fn(),
  listProcedures: vi.fn(),
  useSession: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  startExecution: mocks.startExecution,
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  listProcedures: mocks.listProcedures,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const VENTAS = { id: '0a000000-0000-4000-8000-000000000001', name: 'Ventas', isActive: true };
const OPERACIONES = {
  id: '0a000000-0000-4000-8000-000000000002',
  name: 'Operaciones',
  isActive: true,
};

const ELENA: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena', role: 'EMPLOYEE' },
  status: 'ready',
};

// An item of GET /api/procedures, as the API gives it.
const item = (
  id: string,
  title: string,
  areas: ProcedureListItem['areas'],
  version: Partial<ProcedureListItem['version']> = {},
): ProcedureListItem => ({
  id,
  createdAt: '2026-11-01T10:00:00.000Z',
  version: {
    id: `${id.slice(0, -2)}99`,
    versionNumber: 1,
    status: 'PUBLISHED',
    title,
    description: null,
    stepCount: 3,
    ...version,
  },
  areas,
});

const page = (data: ProcedureListItem[]): ProcedureListPage => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
});

const CIERRE = item(CIERRE_DE_CAJA, 'Cierre de caja', [VENTAS]);
const RECEPCION_ITEM = item(RECEPCION, 'Recepción de mercadería', [OPERACIONES]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue(ELENA);
  mocks.listProcedures.mockResolvedValue(page([CIERRE, RECEPCION_ITEM]));
  mocks.startExecution.mockResolvedValue(execution(0));
});

const card = (name: string) =>
  screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const startButton = (name: string) =>
  within(card(name)).getByRole('button', { name: 'Comenzar o continuar' });
const loaded = () => screen.findByRole('heading', { level: 2, name: 'Cierre de caja' });

describe('the procedures of the API', () => {
  test('asks for them once, with the abort signal', async () => {
    render(<ProcedurePicker />);
    await loaded();

    expect(mocks.listProcedures).toHaveBeenCalledTimes(1);
    expect(mocks.listProcedures).toHaveBeenCalledWith({ limit: 100 }, expect.any(AbortSignal));
  });

  test('shows each one with the title of its version and a chip per area', async () => {
    mocks.listProcedures.mockResolvedValue(
      page([CIERRE, item(RECEPCION, 'Recepción de mercadería', [OPERACIONES, VENTAS])]),
    );
    render(<ProcedurePicker />);
    await loaded();

    expect(within(card('Cierre de caja')).getByText('Ventas')).toBeInTheDocument();
    const recepcion = card('Recepción de mercadería');
    expect(within(recepcion).getByText('Operaciones')).toBeInTheDocument();
    expect(within(recepcion).getByText('Ventas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Comenzar o continuar' })).toHaveLength(2);
  });

  test('only the published ones with steps: never a draft nor a version without steps', async () => {
    mocks.listProcedures.mockResolvedValue(
      page([
        CIERRE,
        item('1a000000-0000-4000-8000-000000000003', 'Borrador nuevo', [VENTAS], {
          status: 'DRAFT',
        }),
        item('1a000000-0000-4000-8000-000000000004', 'Sin pasos', [VENTAS], { stepCount: 0 }),
      ]),
    );
    render(<ProcedurePicker />);
    await loaded();

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Cierre de caja',
    ]);
  });

  test('while they arrive, a loading state', () => {
    mocks.listProcedures.mockReturnValue(new Promise(() => {}));
    render(<ProcedurePicker />);

    expect(screen.getByText('Cargando los procedimientos…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('none to execute → empty state', async () => {
    mocks.listProcedures.mockResolvedValue(page([]));
    render(<ProcedurePicker />);

    expect(
      await screen.findByText('Todavía no hay procedimientos para ejecutar.'),
    ).toBeInTheDocument();
  });

  test('without a session nothing is asked for', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<ProcedurePicker />);

    expect(mocks.listProcedures).not.toHaveBeenCalled();
  });

  test('the list failed (503): the message and retrying asks again', async () => {
    mocks.listProcedures.mockRejectedValueOnce(new ApiError(503));
    render(<ProcedurePicker />);

    expect(
      await screen.findByText('El servicio no está disponible. Probá de nuevo en unos minutos.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await loaded()).toBeInTheDocument();
    expect(mocks.listProcedures).toHaveBeenCalledTimes(2);
  });

  test('the session is not valid (401): the message, without retry', async () => {
    mocks.listProcedures.mockRejectedValue(new ApiError(401));
    render(<ProcedurePicker />);

    expect(
      await screen.findByText('Tu sesión no es válida. Volvé a ingresar.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  test('does not start any execution until a procedure is chosen', async () => {
    render(<ProcedurePicker />);
    await loaded();

    expect(mocks.startExecution).not.toHaveBeenCalled();
  });
});

describe('a given list (procedures prop)', () => {
  test('is shown as it is, without asking the API', () => {
    render(
      <ProcedurePicker
        procedures={[{ id: CIERRE_DE_CAJA, title: 'Cierre de caja', areas: [VENTAS] }]}
      />,
    );

    expect(within(card('Cierre de caja')).getByText('Ventas')).toBeInTheDocument();
    expect(mocks.listProcedures).not.toHaveBeenCalled();
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
    await loaded();

    await userEvent.click(startButton('Cierre de caja'));

    expect(mocks.startExecution).toHaveBeenCalledWith(CIERRE_DE_CAJA);
    expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${EXECUTION_ID}`);
  });

  test('an execution already in progress (200) opens the same way', async () => {
    mocks.startExecution.mockResolvedValue(execution(2));
    render(<ProcedurePicker />);
    await loaded();

    await userEvent.click(startButton('Recepción de mercadería'));

    expect(mocks.startExecution).toHaveBeenCalledWith(RECEPCION);
    expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${EXECUTION_ID}`);
  });

  test('a double click starts only once and every button waits', async () => {
    let resolve!: (value: unknown) => void;
    mocks.startExecution.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ProcedurePicker />);
    await loaded();

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
    await loaded();
    await userEvent.click(startButton('Cierre de caja'));
    expect(mocks.push).toHaveBeenCalledTimes(1);

    rerender(picker('hidden'));
    rerender(picker('visible'));

    const buttons = await screen.findAllByRole('button', { name: 'Comenzar o continuar' });
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
    await loaded();
    await userEvent.click(startButton('Cierre de caja'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(picker('hidden'));
    rerender(picker('visible'));

    await loaded();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a start that answers after leaving the screen does not navigate', async () => {
    let resolve!: (value: unknown) => void;
    mocks.startExecution.mockReturnValue(new Promise((r) => (resolve = r)));
    const { rerender } = render(picker('visible'));
    await loaded();
    await userEvent.click(startButton('Cierre de caja'));

    rerender(picker('hidden'));
    resolve(execution(0));
    await Promise.resolve();

    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('errors when starting', () => {
  test('404 → the procedure is not available, and the buttons work again', async () => {
    mocks.startExecution.mockRejectedValue(new ApiError(404));
    render(<ProcedurePicker />);
    await loaded();

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
    await loaded();

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
