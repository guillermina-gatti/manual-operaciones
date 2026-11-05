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

// Each test mounts the whole panel (summary, time table, area cards and their steps tables) and
// looks things up by role and accessible name, which is slow in jsdom. Alone a test takes under
// a second, but with the whole suite running in parallel the first full mount went over the
// default 5 s once. Only this file gets more time; the global vitest config is not changed.
vi.setConfig({ testTimeout: 15_000 });

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
const areaCard = (name: string) =>
  screen.getByRole('region', { name: new RegExp(`^${name}$`) });
const SIN_DATOS = '0a000000-0000-4000-8000-000000000003';
const summaryHeading = () =>
  screen.getByRole('heading', { name: 'Resumen general' }).parentElement!;
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
    expect(summaryHeading()).toHaveTextContent('Todas las áreas');
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
    await waitFor(() => expect(summaryHeading()).toHaveTextContent('Ventas'));
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

  test('choosing an area applies it at once, with the loaded dates', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('desde=2026-10-05&hasta=2026-10-20');
    render(<MetricsPanel />);
    await areasLoaded('2 áreas');

    await chooseArea(user, 'Ventas');

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-05&hasta=2026-10-20`,
    );
  });

  test('choosing an area keeps the dates edited by hand, without "Aplicar"', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await areasLoaded('2 áreas');

    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-10-05');
    expect(mocks.push).not.toHaveBeenCalled();
    await chooseArea(user, 'Ventas');

    expect(mocks.push).toHaveBeenCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-05&hasta=2026-10-27`,
    );
  });

  test('with invalid dates in the form, the area applies with the applied ones', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await areasLoaded('2 áreas');

    await user.clear(screen.getByLabelText('Desde'));
    await user.type(screen.getByLabelText('Desde'), '2026-10-28');
    await chooseArea(user, 'Ventas');

    expect(mocks.push).toHaveBeenCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );
  });

  test('"Aplicar" applies the dates edited by hand', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    render(<MetricsPanel />);
    await procedureCard();

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
    expect(tile('Ejecuciones')).toHaveTextContent('5en el período elegido');
    expect(tile('Completadas')).toHaveTextContent('360,0% del total');
    expect(tile('En curso')).toHaveTextContent('120,0% del total');
    expect(tile('Abandonadas')).toHaveTextContent('120,0% del total');
    // (12 min × 2 + 5 min × 1) ÷ 3 completed.
    expect(tile('Tiempo medio')).toHaveTextContent('9 min 40 spor ejecución completada');
    expect(
      screen.getByText(/^En curso: con avance en las últimas 24 h\. Abandonadas: sin avanzar/),
    ).toBeInTheDocument();
  });

  test('the distribution bar tells the counts as text, and the legend only counts', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const distribution = screen.getByRole('region', { name: 'Distribución de ejecuciones' });
    expect(within(distribution).getByRole('img')).toHaveAccessibleName(
      'Distribución: 3 completadas, 1 en curso, 1 abandonadas',
    );
    const legend = within(distribution).getAllByRole('listitem').map((item) => item.textContent);
    expect(legend).toEqual(['Completadas: 3', 'En curso: 1', 'Abandonadas: 1']);
  });

  test('a procedure with two areas counts once in the general summary', async () => {
    const metrics = metricsResponse();
    mocks.getProcedureMetrics.mockResolvedValue({
      ...metrics,
      procedures: metrics.procedures.map((procedure) =>
        procedure.procedureId === CIERRE_DE_CAJA
          ? { ...procedure, areaIds: [VENTAS, OPERACIONES] }
          : procedure,
      ),
    });
    render(<MetricsPanel />);

    // It is shown in both area cards…
    expect(await screen.findAllByRole('article', { name: 'Cierre de caja' })).toHaveLength(2);
    // …but the general summary counts it once.
    const tile = (label: string) => screen.getAllByText(label, { selector: 'dt' })[0].parentElement!;
    expect(tile('Ejecuciones')).toHaveTextContent('5en el período elegido');
    expect(tile('Tiempo medio')).toHaveTextContent('9 min 40 s');
    expect(areaCard('Operaciones')).toHaveTextContent('2 procedimientos · 5 ejecuciones');
  });

  test('below the summary, the time per procedure, slowest first', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const table = screen.getByRole('table', { name: 'Tiempo por procedimiento' });
    const names = within(table)
      .getAllByRole('rowheader')
      .map((header) => header.querySelector('span')?.textContent);
    expect(names).toEqual(['Cierre de caja', 'Recepción de mercadería']);
  });

  test('one card per area with executions, with its procedures inside', async () => {
    render(<MetricsPanel />);
    await procedureCard();
    await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Detalle por área' })).toBeInTheDocument();
    expect(
      screen.getByText(/^Dónde se traban: paso a paso de cada procedimiento/),
    ).toBeInTheDocument();
    expect(areaCard('Ventas')).toHaveTextContent('1 procedimiento · 4 ejecuciones');
    expect(
      within(areaCard('Ventas')).getByRole('article', { name: 'Cierre de caja' }),
    ).toBeInTheDocument();
    expect(
      within(areaCard('Operaciones')).getByRole('article', { name: 'Recepción de mercadería' }),
    ).toBeInTheDocument();
  });

  test('each procedure says its executions and has its feather bar', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    expect(spaces(card.textContent)).toContain(
      '4 ejecuciones · 2 completadas (50,0%) · 1 en curso · 1 abandonadas (25,0%)',
    );
    expect(within(card).getByRole('img', { name: /^Distribución/ })).toHaveAccessibleName(
      'Distribución: 2 completadas, 1 en curso, 1 abandonadas',
    );
  });

  test('the steps table: reached, finished, abandoned and time, with "Mayor tiempo"', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    const table = within(card).getByRole('table', { name: 'Pasos de Cierre de caja' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Paso',
      'Descripción',
      'Llegaron',
      'Terminaron',
      'Abandonaron',
      'Tiempo medio del paso',
    ]);

    const second = within(table).getByRole('row', { name: /Comparar con el reporte/ });
    expect(within(second).getByRole('rowheader')).toHaveTextContent(
      'Comparar con el reporteMayor tiempo',
    );
    const cells = within(second).getAllByRole('cell').map((cell) => spaces(cell.textContent));
    expect(cells).toEqual(['2', '4', '2', '1 (25,0%)', '3 min 20 s53% del total']);

    const first = within(table).getByRole('row', { name: /Contar el efectivo/ });
    expect(within(first).getAllByRole('cell').map((cell) => spaces(cell.textContent))).toEqual([
      '1',
      '4',
      '4',
      '0',
      '3 min47% del total',
    ]);
  });

  test('a step nobody reached shows "—" instead of a time', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    const row = within(card).getByRole('row', { name: /Guardar en la caja fuerte/ });
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['3', '0', '0', '0', '—']);
  });

  test('"Procedimiento completo" shows the time only with a single version', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    // Cierre de caja has two versions in the period: no time per version.
    const table = within(card).getByRole('table', { name: 'Pasos de Cierre de caja' });
    const complete = within(table).getByRole('row', { name: /Procedimiento completo/ });
    expect(within(complete).getByRole('rowheader')).toHaveTextContent(
      'Procedimiento completo · de inicio a fin',
    );
    expect(within(complete).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '',
      '3',
      '1',
      '1',
      '—',
    ]);

    // Recepción de mercadería has one: its average time.
    const recepcion = screen.getByRole('table', { name: 'Pasos de Recepción de mercadería' });
    const row = within(recepcion).getByRole('row', { name: /Procedimiento completo/ });
    expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('5 min');
  });

  test('the leaf opens and closes the area summary', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await procedureCard();
    await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

    const leaf = within(areaCard('Ventas')).getByRole('button', { name: 'Ver resumen de Ventas' });
    expect(leaf).toHaveAttribute('aria-expanded', 'false');
    await user.click(leaf);

    expect(leaf).toHaveAccessibleName('Ocultar resumen de Ventas');
    expect(leaf).toHaveAttribute('aria-expanded', 'true');
    const summary = document.getElementById(leaf.getAttribute('aria-controls')!)!;
    expect(spaces(summary.textContent)).toContain('Completadas 250,0%');
    expect(spaces(summary.textContent)).toContain('Tiempo medio 12 min');

    await user.click(leaf);
    expect(leaf).toHaveAttribute('aria-expanded', 'false');
  });

  test('says how many areas have no executions, with the right plural', async () => {
    mocks.listAreas.mockResolvedValue([
      { id: VENTAS, name: 'Ventas', isActive: true },
      { id: OPERACIONES, name: 'Operaciones', isActive: true },
      { id: SIN_DATOS, name: 'Logística', isActive: true },
    ]);
    render(<MetricsPanel />);
    await procedureCard();

    expect(
      await screen.findByText('1 área no tiene ejecuciones en este período y no se muestra.'),
    ).toBeInTheDocument();
  });

  test('a chosen area without executions shows the empty feather box', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    mocks.getProcedureMetrics.mockResolvedValue(EMPTY_METRICS);
    render(<MetricsPanel />);

    expect(await screen.findByText('Sin ejecuciones en Ventas')).toBeInTheDocument();
    expect(
      screen.getByText('No hay procedimientos ejecutados en este período. Probá con otras fechas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Detalle por área' })).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole('heading', { name: 'Tiempo por procedimiento' }),
    ).not.toBeInTheDocument();
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
  test('go last, in "Documentos y asistente", documents first', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.at(-1)).toBe('Documentos y asistente');
    const section = screen.getByRole('region', { name: 'Documentos y asistente' });
    const cards = within(section)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(cards).toEqual(['Documentos', 'Asistente']);
  });

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
