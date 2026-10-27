import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MetricsPanel } from '@/components/metrics/MetricsPanel';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import {
  CIERRE_DE_CAJA,
  EMPTY_METRICS,
  OPERACIONES,
  VENTAS,
  metricsResponse,
} from '../../support/metrics';

const mocks = vi.hoisted(() => ({
  getProcedureMetrics: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getProcedureMetrics: mocks.getProcedureMetrics,
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

const ANA: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000001', name: 'Ana Administradora', role: 'ADMIN' },
  status: 'ready',
};
const SERGIO: SessionState = {
  user: {
    id: '0b000000-0000-4000-8000-000000000002',
    name: 'Sergio Supervisor de Ventas',
    role: 'SUPERVISOR',
  },
  status: 'ready',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Only Date is faked: "today" is 27/10/2026 in Buenos Aires, and timers keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T15:00:00.000Z'));
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(ANA);
  mocks.getProcedureMetrics.mockResolvedValue(metricsResponse());
  mocks.listAreas.mockResolvedValue([
    { id: VENTAS, name: 'Ventas' },
    { id: OPERACIONES, name: 'Operaciones' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const procedureCard = () => screen.findByRole('article', { name: 'Cierre de caja' });
const areaSelect = () => screen.getByRole('combobox', { name: 'Área' });
const optionLabels = () =>
  within(areaSelect())
    .getAllByRole('option')
    .map((option) => option.textContent);
const spaces = (text: string | null) => text?.replace(/\s/g, ' ');

describe('loading and filters', () => {
  test('shows the loading state while the metrics arrive', () => {
    mocks.getProcedureMetrics.mockReturnValue(new Promise(() => {}));
    render(<MetricsPanel />);

    expect(screen.getByText('Cargando las métricas…')).toBeInTheDocument();
  });

  test('without filters in the address asks for the last 30 days of every area', async () => {
    render(<MetricsPanel />);

    await procedureCard();
    expect(mocks.getProcedureMetrics).toHaveBeenCalledWith(
      { areaId: null, from: '2026-09-28', to: '2026-10-27' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Del 28/09/2026 al 27/10/2026, en todas las áreas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-28');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-27');
  });

  test('asks with the filters of the address', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15`);
    render(<MetricsPanel />);

    await procedureCard();
    expect(mocks.getProcedureMetrics).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-15' },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('Del 01/10/2026 al 15/10/2026, en Ventas.')).toBeInTheDocument();
  });

  test('ADMIN chooses among "Todas" and every area', async () => {
    render(<MetricsPanel />);

    await procedureCard();
    await screen.findByRole('option', { name: 'Operaciones' });
    expect(optionLabels()).toEqual(['Todas', 'Ventas', 'Operaciones']);
  });

  test('SUPERVISOR chooses only among their areas', async () => {
    mocks.useSession.mockReturnValue(SERGIO);
    mocks.getProcedureMetrics.mockResolvedValue(metricsResponse({ areaIds: [VENTAS] }));
    render(<MetricsPanel />);

    await procedureCard();
    await screen.findByRole('option', { name: 'Ventas' });
    expect(optionLabels()).toEqual(['Todas mis áreas', 'Ventas']);
  });

  test('applying changes the address with the chosen filters', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await screen.findByRole('option', { name: 'Ventas' });

    await user.selectOptions(areaSelect(), 'Ventas');
    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(mocks.push).toHaveBeenCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );
  });

  test('a start after the end is not applied and says why', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await procedureCard();

    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-10-28');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha "Desde" no puede ser posterior a "Hasta".',
    );
    expect(screen.getByLabelText('Desde')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('"Últimos 30 días" goes back to the default filters', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await procedureCard();

    await user.click(screen.getByRole('button', { name: 'Últimos 30 días' }));

    expect(mocks.push).toHaveBeenCalledWith('/metricas');
  });
});

describe('with data', () => {
  test('shows the headline numbers', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const tile = (label: string) => screen.getAllByText(label, { selector: 'dt' })[0].parentElement!;
    expect(tile('Iniciadas')).toHaveTextContent('5');
    expect(tile('Completadas')).toHaveTextContent('3');
    expect(tile('En curso')).toHaveTextContent('Con avance en las últimas 24 h');
    expect(tile('Abandonadas')).toHaveTextContent('Sin avanzar hace más de 24 h');
    expect(spaces(tile('Finalización').textContent)).toContain('60 %');
  });

  test('one card per procedure, with its name, areas and steps', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    expect(screen.getByRole('article', { name: 'Recepción de mercadería' })).toBeInTheDocument();
    expect(await within(card).findByText('Ventas')).toBeInTheDocument();

    const table = within(card).getByRole('table', { name: 'Pasos de Cierre de caja' });
    const second = within(table).getByRole('row', { name: /Comparar con el reporte/ });
    const cells = within(second).getAllByRole('cell').map((cell) => spaces(cell.textContent));
    expect(cells).toEqual(['4', '2', '3 min 20 s', '1', '25 %']);
  });

  test('a step nobody reached shows "—" instead of a number', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    const row = within(card).getByRole('row', { name: /Guardar en la caja fuerte/ });
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['0', '0', '—', '0', '—']);
  });

  test('older versions fold below, with their own steps', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    expect(within(card).getByText('Versiones anteriores (1)')).toBeInTheDocument();
    expect(
      within(card).getByRole('table', { name: 'Versión anterior 1 de Cierre de caja', hidden: true }),
    ).toBeInTheDocument();
  });

  test('never asks for the metrics without a session', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<MetricsPanel />);

    expect(mocks.getProcedureMetrics).not.toHaveBeenCalled();
  });
});

describe('empty and errors', () => {
  test('a period without executions says so', async () => {
    mocks.getProcedureMetrics.mockResolvedValue(EMPTY_METRICS);
    render(<MetricsPanel />);

    expect(await screen.findByText('No hay ejecuciones en este período.')).toBeInTheDocument();
    expect(screen.getByText('Probá con otras fechas u otra área.')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Cierre de caja' })).not.toBeInTheDocument();
  });

  test('a service that is down offers to retry, and retrying asks again', async () => {
    const user = userEvent.setup();
    mocks.getProcedureMetrics.mockRejectedValueOnce(new ApiError(503));
    render(<MetricsPanel />);

    expect(await screen.findByText(/El servicio no está disponible/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await procedureCard()).toBeInTheDocument();
    expect(mocks.getProcedureMetrics).toHaveBeenCalledTimes(2);
  });

  test('an area of someone else offers to see all of theirs, without retry', async () => {
    mocks.useSession.mockReturnValue(SERGIO);
    mocks.searchParams = new URLSearchParams(`area=${OPERACIONES}`);
    mocks.getProcedureMetrics.mockRejectedValue(new ApiError(404));
    render(<MetricsPanel />);

    expect(
      await screen.findByText('No tenés acceso a las métricas de esa área.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas mis áreas' })).toHaveAttribute(
      'href',
      '/metricas?desde=2026-09-28&hasta=2026-10-27',
    );
  });

  test('invalid filters (400) ask to check them', async () => {
    mocks.getProcedureMetrics.mockRejectedValue(new ApiError(400));
    render(<MetricsPanel />);

    expect(await screen.findByText('Revisá las fechas y el área elegidas.')).toBeInTheDocument();
  });

  test('without the area names the selector still offers "Todas"', async () => {
    mocks.listAreas.mockRejectedValue(new Error('down'));
    render(<MetricsPanel />);

    await procedureCard();
    expect(optionLabels()).toEqual(['Todas']);
  });
});

describe('metrics of pair C', () => {
  test('both cards say they are not available yet, without numbers', async () => {
    render(<MetricsPanel />);

    const assistant = await screen.findByRole('heading', { name: 'Asistente' });
    const documents = screen.getByRole('heading', { name: 'Documentos' });
    for (const heading of [assistant, documents]) {
      const card = heading.closest('article')!;
      expect(await within(card).findByText('Todavía no disponible.')).toBeInTheDocument();
      expect(card.textContent).not.toMatch(/\d/);
    }
  });
});

test('the procedure id is never shown', async () => {
  render(<MetricsPanel />);
  await procedureCard();

  expect(document.body.textContent).not.toContain(CIERRE_DE_CAJA);
});
