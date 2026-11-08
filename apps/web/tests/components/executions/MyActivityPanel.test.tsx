import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MyActivityPanel } from '@/components/executions/MyActivityPanel';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import {
  EMPTY_MY_METRICS,
  OPERACIONES,
  VENTAS,
  myMetricsResponse,
} from '../../support/my-metrics';

// A whole mount (filters, tiles, lists) looked up by role is slow in jsdom; as in MetricsPanel.
vi.setConfig({ testTimeout: 15_000 });

const mocks = vi.hoisted(() => ({
  getMyMetrics: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getMyMetrics: mocks.getMyMetrics,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ push: mocks.push }),
}));

const ELENA: SessionState = {
  user: {
    id: '0b000000-0000-4000-8000-000000000003',
    name: 'Elena Empleada de Ventas',
    role: 'EMPLOYEE',
  },
  status: 'ready',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Only Date is faked: "today" is 27/10/2026 in Buenos Aires, and timers keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T15:00:00.000Z'));
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(ELENA);
  mocks.getMyMetrics.mockResolvedValue(myMetricsResponse());
  mocks.listAreas.mockResolvedValue([
    { id: VENTAS, name: 'Ventas' },
    { id: OPERACIONES, name: 'Operaciones' },
    { id: '0a000000-0000-4000-8000-000000000003', name: 'Compras' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const summary = () => screen.getByRole('region', { name: 'Tu resumen' });
// A tile: its label (dt) and, in the same box, its number and its line.
const tile = (label: string) =>
  within(summary()).getByText(label, { selector: 'dt' }).parentElement!;

describe('filters', () => {
  test('without filters in the address asks for this month of all their areas', async () => {
    render(<MyActivityPanel />);

    await screen.findByText('Completadas');
    expect(mocks.getMyMetrics).toHaveBeenCalledWith(
      { areaId: null, from: '2026-10-01', to: '2026-10-27' },
      expect.any(AbortSignal),
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
  });

  test('the filters of the address are the ones asked for', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-10&hasta=2026-10-20`);
    render(<MyActivityPanel />);

    await screen.findByText('Completadas');
    expect(mocks.getMyMetrics).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-10-10', to: '2026-10-20' },
      expect.any(AbortSignal),
    );
  });

  test('the area selector offers only their areas, and applying stays on this page', async () => {
    const user = userEvent.setup();
    render(<MyActivityPanel />);
    await screen.findByText('Completadas');

    await user.click(screen.getByRole('button', { name: /^Área/ }));
    const options = within(screen.getByRole('listbox', { name: 'Área' }))
      .getAllByRole('option')
      .map((option) => option.querySelector('span:not([class*="text-sm"])')?.textContent);
    expect(options).toEqual(['Todas mis áreas', 'Ventas', 'Operaciones']);

    await user.click(screen.getByRole('option', { name: /^Ventas/ }));
    expect(mocks.push).toHaveBeenCalledWith(
      `/ejecuciones/mi-actividad?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );
  });
});

describe('summary', () => {
  test('their counts and their average time', async () => {
    render(<MyActivityPanel />);
    await screen.findByText('Completadas');

    expect(tile('Empezadas')).toHaveTextContent('5');
    expect(tile('Completadas')).toHaveTextContent('60,0% del total');
    expect(tile('En curso')).toHaveTextContent('20,0% del total');
    expect(tile('Tu tiempo medio')).toHaveTextContent('10 min');
  });

  test('says "Sin avanzar hace más de 24 h", never "abandonadas"', async () => {
    render(<MyActivityPanel />);
    await screen.findByText('Completadas');

    expect(tile('Sin avanzar hace más de 24 h')).toHaveTextContent('20,0% del total');
    expect(screen.queryByText(/abandonad/i)).not.toBeInTheDocument();
  });

  test('a period without executions says so', async () => {
    mocks.getMyMetrics.mockResolvedValue(EMPTY_MY_METRICS);
    render(<MyActivityPanel />);

    expect(
      await screen.findByText('No empezaste procedimientos en este período.'),
    ).toBeInTheDocument();
  });

  test('shows the loading state while the answer arrives', () => {
    mocks.getMyMetrics.mockReturnValue(new Promise(() => {}));
    render(<MyActivityPanel />);

    expect(screen.getAllByText('Cargando tu actividad…').length).toBeGreaterThan(0);
  });
});

describe('errors', () => {
  test('an area that is not theirs offers to see all of them', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    mocks.getMyMetrics.mockRejectedValue(new ApiError(404, ['No se encontró el área']));
    render(<MyActivityPanel />);

    expect(await screen.findByText('No encontramos esa área entre las tuyas.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas mis áreas' })).toHaveAttribute(
      'href',
      '/ejecuciones/mi-actividad?desde=2026-10-01&hasta=2026-10-27',
    );
    expect(screen.queryByText('No se encontró el área')).not.toBeInTheDocument();
  });

  test('the service down can be retried', async () => {
    const user = userEvent.setup();
    mocks.getMyMetrics.mockRejectedValueOnce(new ApiError(503));
    render(<MyActivityPanel />);

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Completadas')).toBeInTheDocument();
    expect(mocks.getMyMetrics).toHaveBeenCalledTimes(2);
  });
});
