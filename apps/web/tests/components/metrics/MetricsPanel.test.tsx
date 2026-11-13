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
  getAssistant: vi.fn(),
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
    getAssistant: mocks.getAssistant,
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
  mocks.getAssistant.mockResolvedValue({
    filters: { areaId: null, from: '2026-09-28', to: '2026-10-27' },
    totals: {
      questions: 9,
      answered: 5,
      noInfo: 2,
      conflict: 1,
      aiUnavailable: 1,
      smallTalk: 3,
      latencyP50Ms: 2400,
      latencyP95Ms: null,
      inputTokens: 9000,
      outputTokens: 1500,
      feedback: { useful: 4, notUseful: 1 },
    },
  });
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
  screen.getByRole('heading', { name: /^Resumen general/ }).parentElement!;
// A datum of the summary panel: the value (dd) next to its label (dt).
const datum = (label: RegExp) =>
  within(screen.getByRole('region', { name: 'Resumen general' }))
    .getAllByRole('term')
    .find((term) => label.test(term.textContent ?? ''))!.nextElementSibling!.textContent;
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
// What a cell says without the words only the card shows on a phone.
const shown = (element: HTMLElement) => {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.lg\\:hidden').forEach((label) => label.remove());
  return spaces(copy.textContent);
};
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
    mocks.getProcedureMetrics.mockResolvedValue(
      metricsResponse({ areaIds: [VENTAS], areaSummary: [{ areaId: VENTAS, procedures: 1 }] }),
    );
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
      areaSummary: [{ areaId: VENTAS, procedures: 1 }],
    });
    render(<MetricsPanel />);

    await procedureCard();
    await areasLoaded('2 áreas');
    expect(await optionTexts(user)).toContain('Operaciones · Sin datos');
  });

  test('with an area chosen, every area keeps its count from the summary', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    const metrics = metricsResponse();
    mocks.getProcedureMetrics.mockResolvedValue({
      ...metrics,
      procedures: metrics.procedures.filter((procedure) => procedure.areaIds.includes(VENTAS)),
      areaSummary: [
        { areaId: VENTAS, procedures: 1 },
        { areaId: OPERACIONES, procedures: 3 },
      ],
    });
    render(<MetricsPanel />);

    await procedureCard();
    await waitFor(() => expect(areaButton()).toHaveTextContent('Ventas'));
    expect(await optionTexts(user)).toEqual([
      'Todas las áreas · 2 áreas',
      'Ventas · 1 procedimiento',
      'Operaciones · 3 procedimientos',
    ]);
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

    expect(screen.getByRole('img', { name: '60,0 % completadas' })).toBeInTheDocument();
    expect(screen.getByText('Se completaron 3 de las 5 ejecuciones del período')).toBeInTheDocument();
    expect(datum(/^Ejecuciones$/)).toBe('5');
    expect(datum(/^Abandonadas$/)).toBe('1(20,0 % del total)');
    // totals.avgCompletionMs: (12 min × 2 + 5 min × 1) ÷ 3 completed.
    expect(datum(/^Tiempo medio/)).toBe('9 min 40 s');
    expect(
      screen.getByText(/^En curso: con avance en las últimas 24 h\. Abandonadas: sin avanzar/),
    ).toBeInTheDocument();
  });

  test('a procedure with a title from the API shows it instead of the sample name', async () => {
    const answer = metricsResponse();
    mocks.getProcedureMetrics.mockResolvedValue({
      ...answer,
      procedures: answer.procedures.map((p, i) => (i === 0 ? { ...p, title: 'Arqueo de caja' } : p)),
    });
    render(<MetricsPanel />);

    expect(await screen.findByRole('article', { name: 'Arqueo de caja' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Tiempo por procedimiento' });
    expect(within(table).getAllByRole('rowheader')[0]).toHaveTextContent('Arqueo de caja');
  });

  test('the average time of the summary is the one of the totals, not one computed here', async () => {
    const answer = metricsResponse();
    mocks.getProcedureMetrics.mockResolvedValue({
      ...answer,
      totals: { ...answer.totals, avgCompletionMs: 123000 },
    });
    render(<MetricsPanel />);
    await procedureCard();

    expect(datum(/^Tiempo medio/)).toBe('2 min 3 s');
  });

  test('the distribution is told in words by the legend; the bar is decorative', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const legend = within(screen.getByRole('list', { name: 'Ejecuciones del período' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(legend).toEqual(['3 completadas', '1 en curso', '1 abandonada']);
    expect(screen.getByTestId('outcome-bar')).toHaveAttribute('aria-hidden', 'true');
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
    expect(datum(/^Ejecuciones$/)).toBe('5');
    expect(datum(/^Tiempo medio/)).toBe('9 min 40 s');
    expect(areaCard('Operaciones')).toHaveTextContent('2 procedimientos · 5 ejecuciones');
  });

  test('below the summary, the time per procedure, slowest first', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const table = screen.getByRole('table', { name: 'Tiempo por procedimiento' });
    const names = within(table)
      .getAllByRole('rowheader')
      .map((header) => header.querySelector('span')?.textContent);
    // Every section title of the tab carries the orange mark.
    for (const name of ['Tiempo por procedimiento', 'Detalle por área']) {
      expect(
        screen.getByRole('heading', { level: 2, name }).querySelector('.bg-naranja'),
      ).toBeInTheDocument();
    }
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

  test('each procedure is a row that says its executions, with a bar of the completed', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    const row = within(card).getByRole('button', { name: /^Cierre de caja/ });
    expect(spaces(row.textContent)).toBe(
      'Cierre de caja4 ejecuciones2 completadas (50,0 %)1 en curso1 abandonada',
    );
    const bar = within(row).getByTestId('completed-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('50%');
    // More than 0 abandoned: bold, the alert color and a dot, not only color.
    expect(within(row).getByText('1 abandonada')).toHaveClass('font-bold', 'text-durazno-texto');
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
    const cells = within(second).getAllByRole('cell').map(shown);
    expect(cells).toEqual(['2', '4', '2', '1 (25,0%)', '3 min 20 s53% del total']);
    // Every data column to the left, as in "Tiempo por procedimiento".
    for (const cell of within(second).getAllByRole('cell').slice(1)) {
      expect(cell).toHaveClass('text-left', 'tabular-nums');
    }
    // The bar of the slowest step is orange, of its share of the total.
    const bar = within(second).getByTestId('step-time-bar').firstElementChild as HTMLElement;
    expect(bar).toHaveClass('bg-naranja');
    expect(bar.style.width).toBe(`${(200000 / 380000) * 100}%`);

    const first = within(table).getByRole('row', { name: /Contar el efectivo/ });
    expect(within(first).getByTestId('step-time-bar').firstElementChild).toHaveClass(
      'bg-[#1B9B5B]',
    );
    expect(within(first).getAllByRole('cell').map(shown)).toEqual([
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
    const cells = within(row).getAllByRole('cell').map(shown);
    expect(cells).toEqual(['3', '0', '0', '0', '—']);
  });

  test('"Procedimiento completo" shows the time of each version', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    // Cierre de caja has two versions in the period: each one with its own time.
    const table = within(card).getByRole('table', { name: 'Pasos de Cierre de caja' });
    const complete = within(table).getByRole('row', { name: /Procedimiento completo/ });
    expect(within(complete).getByRole('rowheader')).toHaveTextContent(
      'Procedimiento completo · de inicio a fin',
    );
    expect(complete).toHaveClass('border-bosque');
    expect(within(complete).getAllByRole('cell').map(shown)).toEqual([
      '',
      '3',
      '1',
      '1',
      '14 min',
    ]);
    const older = within(card).getByRole('table', {
      name: 'Versión anterior 1 de Cierre de caja',
      hidden: true,
    });
    const olderComplete = within(older).getByRole('row', {
      name: /Procedimiento completo/,
      hidden: true,
    });
    expect(within(olderComplete).getAllByRole('cell', { hidden: true }).at(-1)).toHaveTextContent(
      '10 min',
    );

    // Recepción de mercadería has one: its average time.
    const recepcion = screen.getByRole('table', { name: 'Pasos de Recepción de mercadería' });
    const row = within(recepcion).getByRole('row', { name: /Procedimiento completo/ });
    expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('5 min');
  });

  describe('the procedures of an area', () => {
    // Ventas with three procedures: Cierre de caja (4), Apertura (6) and Devolución (2).
    const threeInVentas = () => {
      const answer = metricsResponse();
      const [cierre] = answer.procedures;
      const copy = (id: string, title: string, started: number) => ({
        ...cierre,
        procedureId: id,
        title,
        started,
        versions: [{ ...cierre.versions[0], procedureVersionId: `${id.slice(0, -1)}9` }],
      });
      mocks.getProcedureMetrics.mockResolvedValue({
        ...answer,
        procedures: [
          ...answer.procedures,
          copy('1a000000-0000-4000-8000-000000000005', 'Apertura del local', 6),
          copy('1a000000-0000-4000-8000-000000000006', 'Devolución de un producto', 2),
        ],
      });
    };
    const row = (name: string) =>
      within(areaCard('Ventas')).getByRole('button', { name: new RegExp(`^${name}`) });
    const openRows = () =>
      within(areaCard('Ventas'))
        .queryAllByRole('button', { expanded: true })
        .filter((button) => button.closest('article'))
        .map((button) => button.closest('article')!.getAttribute('aria-labelledby'))
        .map((id) => document.getElementById(id!)!.textContent);
    const leaf = () =>
      within(areaCard('Ventas')).getByRole('button', {
        name: /resumen de todos los procedimientos de esta área$/,
      });

    test('the area: its name and counts, and the hint to open a procedure', async () => {
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

      expect(within(areaCard('Ventas')).getByRole('heading', { level: 3 })).toHaveTextContent(
        'Ventas',
      );
      expect(areaCard('Ventas')).toHaveTextContent('3 procedimientos · 12 ejecuciones');
      expect(
        within(areaCard('Ventas')).getByText('Procedimientos (tocá uno para abrirlo)'),
      ).toBeInTheDocument();
    });

    test('the one with most executions goes first and is the only one open', async () => {
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

      const names = within(areaCard('Ventas'))
        .getAllByRole('article')
        .map((article) => document.getElementById(article.getAttribute('aria-labelledby')!)!.textContent);
      expect(names).toEqual(['Apertura del local', 'Cierre de caja', 'Devolución de un producto']);
      expect(openRows()).toEqual(['Apertura del local']);
      // The closed ones keep their steps hidden.
      const closed = document.getElementById(row('Cierre de caja').getAttribute('aria-controls')!)!;
      expect(closed).not.toBeVisible();
    });

    test('opening one closes the other; opening it again closes it', async () => {
      const user = userEvent.setup();
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

      await user.click(row('Cierre de caja'));
      expect(openRows()).toEqual(['Cierre de caja']);
      const panel = document.getElementById(row('Cierre de caja').getAttribute('aria-controls')!)!;
      expect(within(panel).getByRole('table', { name: 'Pasos de Cierre de caja' })).toBeVisible();
      // Open: the orange stripe and the pale green background.
      expect(row('Cierre de caja').closest('article')).toHaveClass('border-naranja', 'bg-[#F3F8F5]');

      await user.click(row('Cierre de caja'));
      expect(openRows()).toEqual([]);
    });

    test('with the keyboard: Tab reaches the row and Enter or Space open it', async () => {
      const user = userEvent.setup();
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

      row('Cierre de caja').focus();
      await user.keyboard('{Enter}');
      expect(openRows()).toEqual(['Cierre de caja']);
      row('Devolución de un producto').focus();
      await user.keyboard(' ');
      expect(openRows()).toEqual(['Devolución de un producto']);
    });

    test('the leaf opens every procedure with the area summary, and closes them all', async () => {
      const user = userEvent.setup();
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

      expect(leaf()).toHaveAccessibleName(
        'Ver resumen de todos los procedimientos de esta área',
      );
      expect(leaf()).toHaveAttribute('aria-expanded', 'false');
      await user.click(leaf());

      expect(leaf()).toHaveAccessibleName(
        'Ocultar resumen de todos los procedimientos de esta área',
      );
      expect(leaf()).toHaveAttribute('aria-expanded', 'true');
      expect(openRows()).toEqual([
        'Apertura del local',
        'Cierre de caja',
        'Devolución de un producto',
      ]);
      // It controls every procedure and the area summary.
      const controlled = leaf().getAttribute('aria-controls')!.split(' ');
      expect(controlled).toHaveLength(4);
      const summary = document.getElementById(controlled.at(-1)!)!;
      expect(spaces(summary.textContent)).toContain('Completadas 6');

      await user.click(leaf());
      expect(leaf()).toHaveAttribute('aria-expanded', 'false');
      expect(openRows()).toEqual([]);
    });

    test('the leaf has a tooltip with its name, tied by aria-describedby', async () => {
      const user = userEvent.setup();
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());

      const tip = document.getElementById(leaf().getAttribute('aria-describedby')!)!;
      expect(tip).toHaveAttribute('role', 'tooltip');
      expect(tip).toHaveTextContent('Ver resumen de todos los procedimientos de esta área');
      // It shows on hover and on keyboard focus, not only with the mouse.
      expect(tip).toHaveClass('group-hover:visible', 'group-has-[:focus-visible]:visible');

      await user.click(leaf());
      expect(tip).toHaveTextContent('Ocultar resumen de todos los procedimientos de esta área');

      // Escape hides it.
      leaf().focus();
      await user.keyboard('{Escape}');
      expect(tip).toHaveClass('hidden');
    });
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

  test('a chosen area without executions says so in the summary panel', async () => {
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
  test('in the "Documentos y asistente" tab, documents first', async () => {
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);
    await screen.findByRole('region', { name: 'Documentos' });

    const panel = screen.getByRole('tabpanel', { name: 'Documentos y asistente' });
    const titles = within(panel)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(['Documentos', 'Asistente']);
  });

  test('the assistant card asks with the panel filters and shows the totals', async () => {
    mocks.searchParams = new URLSearchParams(
      `area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15&seccion=documentos`,
    );
    render(<MetricsPanel />);

    const card = await screen.findByRole('region', { name: 'Asistente' });
    const questions = await within(card).findByText('Preguntas', { selector: 'dt' });
    expect(questions.nextSibling).toHaveTextContent('9');
    expect(within(card).getByText('Saludos y ayuda', { selector: 'dt' }).nextSibling).toHaveTextContent(
      '3',
    );
    expect(within(card).getByText('p95', { selector: 'dt' }).nextSibling).toHaveTextContent('—');
    expect(
      within(card).getByText('El filtro por área usa las áreas actuales de quien preguntó.'),
    ).toBeInTheDocument();
    expect(mocks.getAssistant).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-15' },
      expect.any(AbortSignal),
    );
  });

  test('the assistant card describes an error of its own, without hiding the documents', async () => {
    mocks.getAssistant.mockRejectedValue(new ApiError(503));
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);

    const card = await screen.findByRole('region', { name: 'Asistente' });
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      /El servicio no está disponible/,
    );
    const documents = screen.getByRole('region', { name: 'Documentos' });
    expect(await within(documents).findByText('Activos', { selector: 'dt' })).toBeInTheDocument();
  });

  test('without a session the assistant is not asked for', async () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);

    await waitFor(() => expect(mocks.getDocuments).not.toHaveBeenCalled());
    expect(mocks.getAssistant).not.toHaveBeenCalled();
  });

  test('the documents card asks with the panel filters and shows the totals', async () => {
    mocks.searchParams = new URLSearchParams(
      `area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15&seccion=documentos`,
    );
    render(<MetricsPanel />);

    const card = await screen.findByRole('region', { name: 'Documentos' });
    const active = await within(card).findByText('Activos', { selector: 'dt' });
    expect(active.nextSibling).toHaveTextContent('12');
    expect(within(card).getByText('1 oct – 15 oct')).toBeInTheDocument();
    expect(mocks.getDocuments).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-15' },
      expect.any(AbortSignal),
    );
  });
});

describe('the tabs', () => {
  const tablist = () => screen.getByRole('tablist', { name: 'Secciones de las métricas' });
  const tab = (name: string) => within(tablist()).getByRole('tab', { name });

  test('two tabs; without the parameter, "Procedimientos" is open', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    expect(within(tablist()).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Procedimientos',
      'Documentos y asistente',
    ]);
    expect(tab('Procedimientos')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Documentos y asistente')).toHaveAttribute('aria-selected', 'false');
    // Only the open tab is in the Tab order.
    expect(tab('Procedimientos')).toHaveAttribute('tabindex', '0');
    expect(tab('Documentos y asistente')).toHaveAttribute('tabindex', '-1');
  });

  test('the panel is named by its tab and the open tab controls it', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const panel = screen.getByRole('tabpanel', { name: 'Procedimientos' });
    expect(tab('Procedimientos')).toHaveAttribute('aria-controls', panel.id);
  });

  test('"Procedimientos": summary, time and areas; documents and assistant are not asked for', async () => {
    render(<MetricsPanel />);
    await procedureCard();

    const panel = screen.getByRole('tabpanel', { name: 'Procedimientos' });
    const headings = within(panel)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Resumen general · Todas las áreas',
      'Tiempo por procedimiento',
      'Detalle por área',
    ]);
    expect(screen.queryByRole('region', { name: 'Documentos' })).not.toBeInTheDocument();
    expect(mocks.getDocuments).not.toHaveBeenCalled();
    expect(mocks.getAssistant).not.toHaveBeenCalled();
  });

  test('"Documentos y asistente": only its cards, never the procedures', async () => {
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);

    const panel = screen.getByRole('tabpanel', { name: 'Documentos y asistente' });
    await within(panel).findByRole('region', { name: 'Documentos' });
    expect(within(panel).getByRole('region', { name: 'Asistente' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resumen general' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Detalle por área' })).not.toBeInTheDocument();
    expect(tab('Documentos y asistente')).toHaveAttribute('aria-selected', 'true');
  });

  test('the filters stay above the tabs in both', async () => {
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);

    const form = screen.getByRole('form', { name: 'Filtros' });
    expect(form.compareDocumentPosition(tablist()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('each tab is a link with the filters of the address and its ?seccion=', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15`);
    render(<MetricsPanel />);
    await procedureCard();

    expect(tab('Documentos y asistente')).toHaveAttribute(
      'href',
      `/metricas?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15&seccion=documentos`,
    );
    expect(tab('Procedimientos')).toHaveAttribute(
      'href',
      `/metricas?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15&seccion=procedimientos`,
    );
  });

  test('the arrows move to the other tab and open it; Home and End too', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await procedureCard();

    tab('Procedimientos').focus();
    await user.keyboard('{ArrowRight}');
    expect(tab('Documentos y asistente')).toHaveFocus();
    expect(mocks.push).toHaveBeenLastCalledWith(
      '/metricas?desde=2026-10-01&hasta=2026-10-27&seccion=documentos',
      { scroll: false },
    );

    tab('Procedimientos').focus();
    await user.keyboard('{ArrowLeft}');
    expect(tab('Documentos y asistente')).toHaveFocus();
    tab('Procedimientos').focus();
    await user.keyboard('{End}');
    expect(mocks.push).toHaveBeenCalledTimes(3);
    await user.keyboard('{Home}');
    // Already open: nothing to do.
    expect(mocks.push).toHaveBeenCalledTimes(3);
  });

  test('a value that does not exist opens "Procedimientos"', async () => {
    mocks.searchParams = new URLSearchParams('seccion=otra');
    render(<MetricsPanel />);
    await procedureCard();

    expect(tab('Procedimientos')).toHaveAttribute('aria-selected', 'true');
  });

  test('applying or clearing the filters keeps ?seccion=', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('desde=2026-10-01&hasta=2026-10-15&seccion=documentos');
    render(<MetricsPanel />);
    await areasLoaded('2 áreas');

    await chooseArea(user, 'Ventas');
    expect(mocks.push).toHaveBeenLastCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15&seccion=documentos`,
    );
    // The quick period goes with the area chosen in the selector.
    await user.click(quickPeriod('Hoy'));
    expect(mocks.push).toHaveBeenLastCalledWith(
      `/metricas?area=${VENTAS}&desde=2026-10-27&hasta=2026-10-27&seccion=documentos`,
    );
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/metricas?seccion=documentos');
  });

  test('without ?seccion=, the filters write nothing of it', async () => {
    const user = userEvent.setup();
    render(<MetricsPanel />);
    await procedureCard();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/metricas');
  });

  test('"Ver todas mis áreas" keeps the tab', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&seccion=documentos`);
    mocks.getDocuments.mockRejectedValue(new ApiError(404, ['No se encontró el área']));
    render(<MetricsPanel />);

    const documents = await screen.findByRole('region', { name: 'Documentos' });
    expect(
      await within(documents).findByRole('link', { name: 'Ver todas mis áreas' }),
    ).toHaveAttribute('href', '/metricas?desde=2026-10-01&hasta=2026-10-27&seccion=documentos');
  });
});

test('the procedure id is never shown', async () => {
  render(<MetricsPanel />);
  await procedureCard();

  expect(document.body.textContent).not.toContain(CIERRE_DE_CAJA);
});
