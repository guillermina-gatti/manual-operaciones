import { render, screen, waitFor, within } from '@testing-library/react';
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
  getDocuments: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getProcedureMetrics: mocks.getProcedureMetrics,
}));

vi.mock('@/lib/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/metrics')>()),
  teamCMetrics: {
    getAssistant: () => Promise.resolve(null),
    getDocuments: mocks.getDocuments,
  },
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
  mocks.getDocuments.mockResolvedValue({
    filters: { areaId: null, from: '2026-09-28', to: '2026-10-27' },
    totals: { active: 12, upToDate: 8, dueSoon: 3, overdue: 1, processingFailed: 0, uploaded: 4 },
  });
  mocks.listAreas.mockResolvedValue([
    { id: VENTAS, name: 'Ventas' },
    { id: OPERACIONES, name: 'Operaciones' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const procedureCard = () => screen.findByRole('article', { name: 'Cierre de caja' });
type User = ReturnType<typeof userEvent.setup>;
const areaButton = () => screen.getByRole('button', { name: /^Área/ });
// Until the area names arrive, the selector only has "Todas las áreas".
const areasLoaded = (hint: string) =>
  waitFor(() => expect(areaButton()).toHaveTextContent(hint));
// Each option as "label · hint", as the selector shows it.
const optionTexts = async (user: User) => {
  await user.click(areaButton());
  return within(screen.getByRole('listbox', { name: 'Área' }))
    .getAllByRole('option')
    .map((option) =>
      [...option.querySelectorAll('span')].map((span) => span.textContent).join(' · '),
    );
};
const chooseArea = async (user: User, name: string) => {
  await user.click(areaButton());
  await user.click(screen.getByRole('option', { name: new RegExp(`^${name}`) }));
};
const spaces = (text: string | null) => text?.replace(/\s/g, ' ');
const quickPeriod = (label: string) =>
  within(screen.getByRole('group', { name: 'Período rápido' })).getByRole('button', {
    name: label,
  });

describe('loading and filters', () => {
  test('shows the loading state while the metrics arrive', () => {
    mocks.getProcedureMetrics.mockReturnValue(new Promise(() => {}));
    render(<MetricsPanel />);

    expect(screen.getByText('Cargando las métricas…')).toBeInTheDocument();
  });

  test('without filters in the address asks for this month of every area', async () => {
    render(<MetricsPanel />);

    await procedureCard();
    expect(mocks.getProcedureMetrics).toHaveBeenCalledWith(
      { areaId: null, from: '2026-10-01', to: '2026-10-27' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Del 01/10/2026 al 27/10/2026, en todas las áreas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
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

  test('ADMIN chooses among "Todas las áreas" and every area, with their procedures', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);

    await procedureCard();
    await areasLoaded('2 áreas');
    expect(areaButton()).toHaveTextContent('Todas las áreas');
    expect(await optionTexts(user)).toEqual([
      'Todas las áreas · 2 áreas',
      'Ventas · 1 procedimiento',
      'Operaciones · 1 procedimiento',
    ]);
  });

  test('SUPERVISOR chooses only among their areas', async () => {
    const user = userEvent.setup();
    mocks.useSession.mockReturnValue(SERGIO);
    mocks.getProcedureMetrics.mockResolvedValue(metricsResponse({ areaIds: [VENTAS] }));
    render(<MetricsPanel />);

    await procedureCard();
    await areasLoaded('1 área');
    expect(await optionTexts(user)).toEqual([
      'Todas mis áreas · 1 área',
      'Ventas · 1 procedimiento',
    ]);
  });

  test('an area without executions in the period says "Sin datos"', async () => {
    const user = userEvent.setup();
    const metrics = metricsResponse();
    mocks.getProcedureMetrics.mockResolvedValue({
      ...metrics,
      procedures: metrics.procedures.filter((procedure) => procedure.areaIds.includes(VENTAS)),
    });
    render(<MetricsPanel />);

    await procedureCard();
    await areasLoaded('2 áreas');
    expect(await optionTexts(user)).toContain('Operaciones · Sin datos');
  });

  test('with an area chosen, the other areas show no counts', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    render(<MetricsPanel />);

    await procedureCard();
    await waitFor(() => expect(areaButton()).toHaveTextContent('Ventas'));
    expect(await optionTexts(user)).toEqual(['Todas las áreas · 2 áreas', 'Ventas', 'Operaciones']);
  });

  test('applying changes the address with the chosen filters', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await areasLoaded('2 áreas');

    await chooseArea(user, 'Ventas');
    expect(areaButton()).toHaveTextContent('Ventas');
    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-10-05');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(mocks.push).toHaveBeenCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-05&hasta=2026-10-27`,
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

  test('"Limpiar filtros" goes back to every area and this month', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15`);
    render(<MetricsPanel />);
    await procedureCard();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(mocks.push).toHaveBeenCalledWith('/metricas');
  });

  test('"Este mes" is marked by default', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    expect(quickPeriod('Este mes')).toHaveAttribute('aria-pressed', 'true');
    expect(quickPeriod('Hoy')).toHaveAttribute('aria-pressed', 'false');
    expect(quickPeriod('Últimos 3 meses')).toHaveAttribute('aria-pressed', 'false');
  });

  test.each([
    ['Hoy', '2026-10-27'],
    ['Este mes', '2026-10-01'],
    ['Últimos 3 meses', '2026-07-27'],
  ])('"%s" applies at once, up to today, with the chosen area', async (label, from) => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await areasLoaded('2 áreas');

    await chooseArea(user, 'Ventas');
    await user.click(quickPeriod(label));

    expect(mocks.push).toHaveBeenCalledWith(
      `/metricas?area=${VENTAS}&desde=${from}&hasta=2026-10-27`,
    );
  });

  test('changing a date by hand leaves no quick period marked', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await procedureCard();

    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-10-05');

    for (const label of ['Hoy', 'Este mes', 'Últimos 3 meses']) {
      expect(quickPeriod(label)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('the footer says what is being shown', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15`);
    render(<MetricsPanel />);
    await procedureCard();
    await waitFor(() => expect(areaButton()).toHaveTextContent('Ventas'));

    const footer = screen.getByText(/^Mostrando/);
    expect(footer).toHaveTextContent('Mostrando Ventas · 1 oct 2026 – 15 oct 2026');
    expect(footer).toHaveAttribute('aria-live', 'polite');
  });

  test('a single day is shown once in the footer', async () => {
    mocks.searchParams = new URLSearchParams('desde=2026-10-27&hasta=2026-10-27');
    render(<MetricsPanel />);
    await procedureCard();

    expect(screen.getByText(/^Mostrando/)).toHaveTextContent(
      'Mostrando Todas las áreas · 27 oct 2026',
    );
    expect(quickPeriod('Hoy')).toHaveAttribute('aria-pressed', 'true');
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
    expect(mocks.getDocuments).not.toHaveBeenCalled();
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
      '/metricas?desde=2026-10-01&hasta=2026-10-27',
    );
  });

  test('invalid filters (400) ask to check them', async () => {
    mocks.getProcedureMetrics.mockRejectedValue(new ApiError(400));
    render(<MetricsPanel />);

    expect(await screen.findByText('Revisá las fechas y el área elegidas.')).toBeInTheDocument();
  });

  test('without the area names the selector still offers "Todas las áreas"', async () => {
    const user = userEvent.setup();
    mocks.listAreas.mockRejectedValue(new Error('down'));
    render(<MetricsPanel />);

    await procedureCard();
    await waitFor(() => expect(mocks.listAreas).toHaveBeenCalled());
    expect(await optionTexts(user)).toEqual(['Todas las áreas']);
  });
});

describe('metrics of pair C', () => {
  test('the assistant card says it is not available yet, without numbers', async () => {
    render(<MetricsPanel />);

    const card = (await screen.findByRole('heading', { name: 'Asistente' })).closest('article')!;
    expect(await within(card).findByText('Todavía no disponible.')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d/);
  });

  test('the documents card asks with the panel filters and shows the totals', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15`);
    render(<MetricsPanel />);

    const card = await screen.findByRole('article', { name: 'Documentos' });
    const active = await within(card).findByText('Activos', { selector: 'dt' });
    expect(active.nextSibling).toHaveTextContent('12');
    expect(within(card).getByText('Del 01/10/2026 al 15/10/2026')).toBeInTheDocument();
    expect(mocks.getDocuments).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-15' },
      expect.any(AbortSignal),
    );
  });
});

test('the procedure id is never shown', async () => {
  render(<MetricsPanel />);
  await procedureCard();

  expect(document.body.textContent).not.toContain(CIERRE_DE_CAJA);
});
