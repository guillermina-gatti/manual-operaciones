import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedurePicker } from '@/components/executions/ProcedurePicker';
import { ApiError } from '@/lib/api';
import type { MyMetricsResponse, MyResumeItem } from '@/lib/api';
import type { ProcedureListItem, ProcedureListPage } from '@/lib/procedures';
import type { SessionState } from '@/lib/session';
import { CIERRE_DE_CAJA, EXECUTION_ID, RECEPCION, execution } from '../../support/executions';

const mocks = vi.hoisted(() => ({
  startExecution: vi.fn(),
  getMyMetrics: vi.fn(),
  listProcedures: vi.fn(),
  useSession: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  startExecution: mocks.startExecution,
  getMyMetrics: mocks.getMyMetrics,
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
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/ejecuciones',
  useSearchParams: () => mocks.searchParams,
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

const CIERRE = item(CIERRE_DE_CAJA, 'Cierre de caja', [VENTAS], { stepCount: 5 });
const RECEPCION_ITEM = item(RECEPCION, 'Recepción de mercadería', [OPERACIONES], { stepCount: 2 });
const APERTURA = '1a000000-0000-4000-8000-000000000005';
const APERTURA_ITEM = item(APERTURA, 'Apertura del local', [VENTAS], { stepCount: 8 });

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000 - 5_000).toISOString();

// An execution in progress, as "resume" of GET /api/metrics/me gives it.
const running = (
  executionId: string,
  procedureId: string,
  order: number,
  totalSteps: number,
  minutes: number,
): MyResumeItem => ({
  executionId,
  procedureId,
  procedureTitle: 'Título de la métrica',
  procedureVersionId: `${procedureId.slice(0, -2)}99`,
  currentStep: { stepId: `${executionId}-step`, order, title: `Paso ${order}` },
  totalSteps,
  startedAt: minutesAgo(minutes + 30),
  lastActivityAt: minutesAgo(minutes),
  stale: false,
});

const EXEC_CIERRE = 'e0000000-0000-4000-8000-000000000011';
const EXEC_RECEPCION = 'e0000000-0000-4000-8000-000000000012';

const metrics = (resume: MyResumeItem[]): MyMetricsResponse => ({
  filters: { areaId: null, from: null, to: null },
  staleAfterHours: 24,
  areaIds: [VENTAS.id],
  totals: { started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null },
  resume,
  procedures: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(ELENA);
  mocks.listProcedures.mockResolvedValue(page([CIERRE, RECEPCION_ITEM]));
  mocks.getMyMetrics.mockResolvedValue(metrics([]));
  mocks.startExecution.mockResolvedValue(execution(0));
});

const card = (name: string) =>
  screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const startButton = (name: string) =>
  within(card(name)).getByRole('button', { name: /^(Empezar|Continuar|Abriendo…)$/ });
const cardTitles = () =>
  [...document.querySelectorAll('li h2')].map((heading) => heading.textContent);
const strip = () => screen.queryByRole('region', { name: 'Para retomar' });
const search = () => screen.getByRole('searchbox', { name: 'Buscar un procedimiento' });
const sortSelect = () => screen.getByRole('combobox', { name: 'Orden' });
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
    expect(screen.getAllByRole('button', { name: 'Empezar' })).toHaveLength(2);
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

    expect(cardTitles()).toEqual(['Cierre de caja']);
  });

  test('while they arrive, skeletons and the loading text for screen readers', () => {
    mocks.listProcedures.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProcedurePicker />);

    expect(screen.getByText('Cargando los procedimientos…')).toHaveClass('sr-only');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.animate-pulse')).toHaveClass('motion-reduce:animate-none');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('none to execute → empty state, saying when they will appear', async () => {
    mocks.listProcedures.mockResolvedValue(page([]));
    render(<ProcedurePicker />);

    expect(
      await screen.findByText('Todavía no hay procedimientos para ejecutar.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cuando publiquen un recorrido de tu área, aparece acá.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  test('each card says how many steps it has, and the description only when there is one', async () => {
    mocks.listProcedures.mockResolvedValue(
      page([
        item(CIERRE_DE_CAJA, 'Cierre de caja', [VENTAS], {
          stepCount: 1,
          description: 'Al final del turno.',
        }),
        RECEPCION_ITEM,
      ]),
    );
    render(<ProcedurePicker />);
    await loaded();

    expect(within(card('Cierre de caja')).getByText('1 paso')).toBeInTheDocument();
    expect(within(card('Cierre de caja')).getByText('Al final del turno.')).toBeInTheDocument();
    expect(within(card('Recepción de mercadería')).getByText('2 pasos')).toBeInTheDocument();
    expect(card('Recepción de mercadería').querySelector('.line-clamp-2')).toBeNull();
  });

  test('without a session nothing is asked for', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<ProcedurePicker />);

    expect(mocks.listProcedures).not.toHaveBeenCalled();
    expect(mocks.getMyMetrics).not.toHaveBeenCalled();
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

describe('searching', () => {
  test('by title, without case or accents, and the count follows it', async () => {
    mocks.listProcedures.mockResolvedValue(page([CIERRE, RECEPCION_ITEM, APERTURA_ITEM]));
    render(<ProcedurePicker />);
    await loaded();

    const count = screen.getByText('3 procedimientos');
    expect(count).toHaveAttribute('aria-live', 'polite');
    expect(search()).toHaveAttribute('placeholder', 'Buscar un procedimiento…');

    await userEvent.type(search(), 'RECEPCION');
    expect(cardTitles()).toEqual(['Recepción de mercadería']);
    expect(count).toHaveTextContent('1 procedimiento');

    await userEvent.clear(search());
    await userEvent.type(search(), 'de');
    expect(cardTitles()).toEqual([
      'Apertura del local',
      'Cierre de caja',
      'Recepción de mercadería',
    ]);
    expect(count).toHaveTextContent('3 procedimientos');
  });

  test('no results: says what was searched and clearing it brings every card back', async () => {
    render(<ProcedurePicker />);
    await loaded();

    await userEvent.type(search(), 'xyz');

    expect(screen.getByText('No encontramos procedimientos con «xyz».')).toBeInTheDocument();
    expect(screen.getByText('0 procedimientos')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(search()).toHaveValue('');
    expect(search()).toHaveFocus();
    expect(cardTitles()).toEqual(['Cierre de caja', 'Recepción de mercadería']);
  });

  test('never asks the API again', async () => {
    render(<ProcedurePicker />);
    await loaded();

    await userEvent.type(search(), 'cierre');

    expect(mocks.listProcedures).toHaveBeenCalledTimes(1);
  });
});

describe('ordering', () => {
  beforeEach(() => {
    mocks.listProcedures.mockResolvedValue(page([RECEPCION_ITEM, APERTURA_ITEM, CIERRE]));
  });

  test('A–Z by default, with the four options', async () => {
    render(<ProcedurePicker />);
    await loaded();

    expect(sortSelect()).toHaveValue('az');
    expect(within(sortSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'A–Z',
      'Menos pasos primero',
      'Más pasos primero',
      'En curso primero',
    ]);
    expect(cardTitles()).toEqual([
      'Apertura del local',
      'Cierre de caja',
      'Recepción de mercadería',
    ]);
  });

  test('by the number of steps, both ways', async () => {
    render(<ProcedurePicker />);
    await loaded();

    await userEvent.selectOptions(sortSelect(), 'Menos pasos primero');
    expect(cardTitles()).toEqual([
      'Recepción de mercadería',
      'Cierre de caja',
      'Apertura del local',
    ]);

    await userEvent.selectOptions(sortSelect(), 'Más pasos primero');
    expect(cardTitles()).toEqual([
      'Apertura del local',
      'Cierre de caja',
      'Recepción de mercadería',
    ]);
  });

  test('in progress first, then A–Z', async () => {
    mocks.getMyMetrics.mockResolvedValue(metrics([running(EXEC_RECEPCION, RECEPCION, 1, 2, 5)]));
    render(<ProcedurePicker />);
    await screen.findByRole('region', { name: 'Para retomar' });

    await userEvent.selectOptions(sortSelect(), 'En curso primero');

    expect(cardTitles()).toEqual([
      'Recepción de mercadería',
      'Apertura del local',
      'Cierre de caja',
    ]);
  });
});

describe('"Para retomar" (GET /api/metrics/me)', () => {
  test('asks for it once, without filters and with the abort signal', async () => {
    render(<ProcedurePicker />);
    await loaded();

    expect(mocks.getMyMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.getMyMetrics).toHaveBeenCalledWith({}, expect.any(AbortSignal));
  });

  test('nothing in progress: no strip and every card says "Empezar"', async () => {
    render(<ProcedurePicker />);
    await loaded();

    expect(strip()).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Empezar' })).toHaveLength(2);
    expect(screen.queryByText(/En curso ·/)).not.toBeInTheDocument();
  });

  test('one in progress: its title, step, time, the nest and "Continuar" to that execution', async () => {
    mocks.getMyMetrics.mockResolvedValue(
      metrics([running(EXEC_CIERRE, CIERRE_DE_CAJA, 3, 5, 20)]),
    );
    render(<ProcedurePicker />);

    const region = await screen.findByRole('region', { name: 'Para retomar' });
    expect(within(region).queryByRole('link', { name: /más en curso/ })).not.toBeInTheDocument();
    // The title of the list, not the one of the metrics.
    expect(within(region).getByText('Cierre de caja')).toBeInTheDocument();
    expect(
      within(region).getByText('Vas por el paso 3 de 5 · lo dejaste hace 20 min'),
    ).toBeInTheDocument();
    const link = within(region).getByRole('link', { name: 'Continuar' });
    expect(link).toHaveAttribute('href', `/ejecuciones/${EXEC_CIERRE}`);
    expect(link).toHaveAccessibleDescription('Cierre de caja');
    const layers = [...region.querySelectorAll('[data-layer]')].map((layer) =>
      layer.getAttribute('data-state'),
    );
    expect(layers).toEqual(['done', 'done', 'current', 'pending', 'pending']);
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();

    // Its card: the mark, a soft blue border and "Continuar".
    const cierre = card('Cierre de caja');
    expect(within(cierre).getByText('En curso · paso 3 de 5')).toBeInTheDocument();
    expect(cierre).toHaveClass('border-azul-borrador/40!');
    expect(startButton('Cierre de caja')).toHaveAccessibleName('Continuar');
    expect(startButton('Recepción de mercadería')).toHaveAccessibleName('Empezar');
    expect(card('Recepción de mercadería')).not.toHaveClass('border-azul-borrador/40!');
  });

  test('several: only the one that moved last, and a link to all of them on "Mi actividad"', async () => {
    mocks.listProcedures.mockResolvedValue(page([CIERRE, RECEPCION_ITEM, APERTURA_ITEM]));
    mocks.getMyMetrics.mockResolvedValue(
      metrics([
        running(EXEC_CIERRE, CIERRE_DE_CAJA, 2, 5, 90),
        running(EXEC_RECEPCION, RECEPCION, 1, 2, 10),
      ]),
    );
    render(<ProcedurePicker />);

    const region = await screen.findByRole('region', { name: 'Para retomar' });
    expect(within(region).getByText('Recepción de mercadería')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      `/ejecuciones/${EXEC_RECEPCION}`,
    );
    expect(within(card('Cierre de caja')).getByText('En curso · paso 2 de 5')).toBeInTheDocument();

    expect(
      within(region).getByRole('link', { name: 'Tenés 1 recorrido más en curso' }),
    ).toHaveAttribute('href', '/ejecuciones/mi-actividad#para-retomar');
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();

    // A link: it does not touch the order of the list.
    await userEvent.click(within(region).getByRole('link', { name: /más en curso/ }));
    expect(sortSelect()).toHaveValue('az');
    expect(cardTitles()).toEqual([
      'Apertura del local',
      'Cierre de caja',
      'Recepción de mercadería',
    ]);
  });

  test('three in progress: "Tenés 2 recorridos más en curso"', async () => {
    mocks.getMyMetrics.mockResolvedValue(
      metrics([
        running(EXEC_CIERRE, CIERRE_DE_CAJA, 2, 5, 90),
        running(EXEC_RECEPCION, RECEPCION, 1, 2, 10),
        running('e0000000-0000-4000-8000-000000000013', APERTURA, 4, 8, 300),
      ]),
    );
    render(<ProcedurePicker />);

    expect(
      await screen.findByRole('link', { name: 'Tenés 2 recorridos más en curso' }),
    ).toHaveAttribute('href', '/ejecuciones/mi-actividad#para-retomar');
  });

  test('a procedure not in the list keeps the name the metrics give', async () => {
    mocks.getMyMetrics.mockResolvedValue(metrics([running(EXEC_CIERRE, APERTURA, 1, 8, 5)]));
    render(<ProcedurePicker />);

    const region = await screen.findByRole('region', { name: 'Para retomar' });
    expect(within(region).getByText('Título de la métrica')).toBeInTheDocument();
  });

  test.each([new ApiError(503), new ApiError(403), new Error('red')])(
    'it failed (%s): the picker works the same, without the strip, the marks or an error',
    async (failure) => {
      mocks.getMyMetrics.mockRejectedValue(failure);
      render(<ProcedurePicker />);
      await loaded();
      await vi.waitFor(() => expect(mocks.getMyMetrics).toHaveBeenCalled());
      await Promise.resolve();

      expect(strip()).not.toBeInTheDocument();
      expect(screen.queryByText(/En curso ·/)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Empezar' })).toHaveLength(2);

      await userEvent.click(startButton('Cierre de caja'));
      expect(mocks.startExecution).toHaveBeenCalledWith(CIERRE_DE_CAJA);
    },
  );

  test('while it arrives the cards are already there', async () => {
    mocks.getMyMetrics.mockReturnValue(new Promise(() => {}));
    render(<ProcedurePicker />);

    expect(await loaded()).toBeInTheDocument();
    expect(strip()).not.toBeInTheDocument();
  });

  test('a card in progress starts it the same way (the API resumes it)', async () => {
    mocks.getMyMetrics.mockResolvedValue(
      metrics([running(EXEC_CIERRE, CIERRE_DE_CAJA, 3, 5, 20)]),
    );
    render(<ProcedurePicker />);
    await screen.findByRole('region', { name: 'Para retomar' });

    await userEvent.click(startButton('Cierre de caja'));

    expect(mocks.startExecution).toHaveBeenCalledWith(CIERRE_DE_CAJA);
  });
});

describe('a given list (procedures prop)', () => {
  test('is shown as it is, without asking the API', () => {
    render(
      <ProcedurePicker
        procedures={[
          {
            id: CIERRE_DE_CAJA,
            title: 'Cierre de caja',
            areas: [VENTAS],
            stepCount: 4,
            description: null,
          },
        ]}
      />,
    );

    expect(within(card('Cierre de caja')).getByText('Ventas')).toBeInTheDocument();
    expect(mocks.listProcedures).not.toHaveBeenCalled();
    expect(mocks.getMyMetrics).not.toHaveBeenCalled();
    expect(strip()).not.toBeInTheDocument();
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

    const buttons = await screen.findAllByRole('button', { name: 'Empezar' });
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

describe('the two views (?vista=)', () => {
  const viewButton = (name: 'Lista' | 'Tarjetas') =>
    within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', {
      name: `Ver como ${name}`,
    });
  const asList = () => {
    mocks.searchParams = new URLSearchParams('vista=lista');
  };
  const rows = () => [...document.querySelectorAll('li')];

  test('Tarjetas by default, with the switch of /documentos', async () => {
    render(<ProcedurePicker />);
    await loaded();

    expect(viewButton('Tarjetas')).toHaveAttribute('aria-pressed', 'true');
    expect(viewButton('Lista')).toHaveAttribute('aria-pressed', 'false');
    expect(card('Cierre de caja').parentElement).toHaveClass('md:grid-cols-2', 'md:auto-rows-fr');
  });

  test('choosing Lista writes it in the address, keeping the history entry and the scroll', async () => {
    render(<ProcedurePicker />);
    await loaded();

    await userEvent.click(viewButton('Tarjetas'));
    expect(mocks.replace).not.toHaveBeenCalled();

    await userEvent.click(viewButton('Lista'));
    expect(mocks.replace).toHaveBeenCalledWith('/ejecuciones?vista=lista', { scroll: false });
  });

  test('back to Tarjetas takes the parameter out', async () => {
    asList();
    render(<ProcedurePicker />);
    await loaded();

    await userEvent.click(viewButton('Tarjetas'));

    expect(mocks.replace).toHaveBeenCalledWith('/ejecuciones', { scroll: false });
  });

  test('the address brings the view back; an unknown value is Tarjetas', async () => {
    asList();
    const { unmount } = render(<ProcedurePicker />);
    await loaded();
    expect(viewButton('Lista')).toHaveAttribute('aria-pressed', 'true');
    unmount();

    mocks.searchParams = new URLSearchParams('vista=mosaico');
    render(<ProcedurePicker />);
    await loaded();
    expect(viewButton('Tarjetas')).toHaveAttribute('aria-pressed', 'true');
  });

  test('nothing is kept in the browser storage: it works the same without it', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sin almacenamiento');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin almacenamiento');
    });
    try {
      render(<ProcedurePicker />);
      await loaded();
      await userEvent.click(viewButton('Lista'));

      expect(mocks.replace).toHaveBeenCalledTimes(1);
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  test('the search and the order are kept when switching', async () => {
    mocks.listProcedures.mockResolvedValue(page([CIERRE, RECEPCION_ITEM, APERTURA_ITEM]));
    const { rerender } = render(<ProcedurePicker />);
    await loaded();
    await userEvent.type(search(), 'de');
    await userEvent.selectOptions(sortSelect(), 'Menos pasos primero');

    await userEvent.click(viewButton('Lista'));
    asList();
    rerender(<ProcedurePicker />);

    expect(viewButton('Lista')).toHaveAttribute('aria-pressed', 'true');
    expect(search()).toHaveValue('de');
    expect(sortSelect()).toHaveValue('fewer-steps');
    expect(cardTitles()).toEqual([
      'Recepción de mercadería',
      'Cierre de caja',
      'Apertura del local',
    ]);
    expect(screen.getByText('3 procedimientos')).toBeInTheDocument();
  });

  describe('Tarjetas: the same structure with and without a state', () => {
    beforeEach(() => {
      mocks.listProcedures.mockResolvedValue(
        page([
          item(CIERRE_DE_CAJA, 'Cierre de caja', [VENTAS], {
            stepCount: 5,
            description: 'Al final del turno.',
          }),
          RECEPCION_ITEM,
        ]),
      );
      mocks.getMyMetrics.mockResolvedValue(
        metrics([running(EXEC_CIERRE, CIERRE_DE_CAJA, 3, 5, 20)]),
      );
    });

    test('first row: areas and steps on the left, the state on the right; then title, description and button', async () => {
      render(<ProcedurePicker />);
      await screen.findByRole('region', { name: 'Para retomar' });

      const cierre = card('Cierre de caja');
      const [meta, title, description, button] = [...cierre.children];
      expect(meta).toHaveClass('min-h-7', 'justify-between');
      expect(meta.firstElementChild).toHaveTextContent('Áreas: Ventas5 pasos');
      expect(meta.lastElementChild).toHaveTextContent('En curso · paso 3 de 5');
      expect(title).toHaveTextContent('Cierre de caja');
      expect(description).toHaveClass('line-clamp-2');
      expect(button).toHaveAccessibleName('Continuar');
      expect(button).toHaveClass('mt-auto', 'min-h-11!');
    });

    test('without a state the chip stays in the same place, and without a description there is no line', async () => {
      render(<ProcedurePicker />);
      await screen.findByRole('region', { name: 'Para retomar' });

      const recepcion = card('Recepción de mercadería');
      const [meta, title, button] = [...recepcion.children];
      expect(meta).toHaveClass('min-h-7');
      expect(meta.children).toHaveLength(1);
      expect(meta.firstElementChild).toHaveTextContent('Áreas: Operaciones2 pasos');
      expect(title).toHaveTextContent('Recepción de mercadería');
      expect(button).toHaveAccessibleName('Empezar');
      expect(recepcion.children).toHaveLength(3);
    });
  });

  describe('Lista', () => {
    beforeEach(() => {
      asList();
      mocks.listProcedures.mockResolvedValue(
        page([
          item(CIERRE_DE_CAJA, 'Cierre de caja', [VENTAS], {
            stepCount: 5,
            description: 'Al final del turno, antes de irte.',
          }),
          RECEPCION_ITEM,
        ]),
      );
      mocks.getMyMetrics.mockResolvedValue(
        metrics([running(EXEC_CIERRE, CIERRE_DE_CAJA, 3, 5, 20)]),
      );
    });

    test('a discreet header and four fixed columns in every row, with the state empty when there is none', async () => {
      const { container } = render(<ProcedurePicker />);
      await screen.findByRole('region', { name: 'Para retomar' });

      const header = container.querySelector('[aria-hidden="true"].md\\:grid')!;
      expect([...header.children].map((cell) => cell.textContent)).toEqual([
        'Procedimiento',
        'Área y pasos',
        'Estado',
        '',
      ]);
      const [cierre, recepcion] = rows();
      expect(cierre.children).toHaveLength(4);
      expect(recepcion.children).toHaveLength(4);
      expect(cierre.className).toContain('md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_150px]');
      expect(cierre.children[2]).toHaveTextContent('En curso · paso 3 de 5');
      expect(recepcion.children[2]).toBeEmptyDOMElement();
      expect(cierre.children[1]).toHaveTextContent('Áreas: Ventas5 pasos');
    });

    test('the title whole, and the description in one line with its full text in the tooltip', async () => {
      render(<ProcedurePicker />);
      await loaded();

      const title = screen.getByRole('heading', { level: 2, name: 'Cierre de caja' });
      expect(title).not.toHaveClass('truncate');
      expect(title).toHaveClass('break-words');
      const description = screen.getByText('Al final del turno, antes de irte.');
      expect(description).toHaveClass('truncate');
      expect(description).toHaveAttribute('title', 'Al final del turno, antes de irte.');
    });

    test('the buttons start or continue, as in the cards', async () => {
      render(<ProcedurePicker />);
      await screen.findByRole('region', { name: 'Para retomar' });

      expect(startButton('Cierre de caja')).toHaveAccessibleName('Continuar');
      expect(startButton('Recepción de mercadería')).toHaveAccessibleName('Empezar');
      expect(startButton('Recepción de mercadería')).toHaveClass('md:w-[150px]', 'w-full');
      expect(startButton('Cierre de caja')).toHaveAccessibleDescription('Cierre de caja');

      await userEvent.click(startButton('Recepción de mercadería'));

      expect(mocks.startExecution).toHaveBeenCalledWith(RECEPCION);
      expect(mocks.push).toHaveBeenCalledWith(`/ejecuciones/${EXECUTION_ID}`);
    });

    test('"Para retomar" does not change, and its link keeps the view', async () => {
      mocks.getMyMetrics.mockResolvedValue(
        metrics([
          running(EXEC_CIERRE, CIERRE_DE_CAJA, 3, 5, 20),
          running(EXEC_RECEPCION, RECEPCION, 1, 2, 90),
        ]),
      );
      render(<ProcedurePicker />);

      const region = await screen.findByRole('region', { name: 'Para retomar' });
      expect(within(region).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
        'href',
        `/ejecuciones/${EXEC_CIERRE}`,
      );
      expect(within(region).getByRole('link', { name: /más en curso/ })).toHaveAttribute(
        'href',
        '/ejecuciones/mi-actividad?vista=lista#para-retomar',
      );
    });
  });

  describe.each(['tarjetas', 'lista'] as const)('the states in %s', (view) => {
    beforeEach(() => {
      mocks.searchParams = new URLSearchParams(view === 'lista' ? 'vista=lista' : '');
    });

    test('loading: the skeleton of that view', () => {
      mocks.listProcedures.mockReturnValue(new Promise(() => {}));
      const { container } = render(<ProcedurePicker />);

      expect(screen.getByText('Cargando los procedimientos…')).toHaveClass('sr-only');
      expect(container.querySelector('[data-view]')).toHaveAttribute('data-view', view);
    });

    test('no results, and clearing brings them back in the same view', async () => {
      render(<ProcedurePicker />);
      await loaded();

      await userEvent.type(search(), 'xyz');
      expect(screen.getByText('No encontramos procedimientos con «xyz».')).toBeInTheDocument();
      expect(screen.getByText('0 procedimientos')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
      expect(cardTitles()).toEqual(['Cierre de caja', 'Recepción de mercadería']);
    });

    test('empty', async () => {
      mocks.listProcedures.mockResolvedValue(page([]));
      render(<ProcedurePicker />);

      expect(
        await screen.findByText('Cuando publiquen un recorrido de tu área, aparece acá.'),
      ).toBeInTheDocument();
    });

    test('error, with "Reintentar"', async () => {
      mocks.listProcedures.mockRejectedValueOnce(new ApiError(503));
      render(<ProcedurePicker />);

      await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
      expect(await loaded()).toBeInTheDocument();
    });
  });
});
