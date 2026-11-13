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
import { reviewDocument } from '../../support/review-documents';

// Each test mounts the whole panel (summary, time table, area cards and their steps tables) and
// looks things up by role and accessible name, which is slow in jsdom. Alone a test takes under
// a second, but with the whole suite running in parallel the first full mount went over the
// default 5 s once. Only this file gets more time; the global vitest config is not changed.
vi.setConfig({ testTimeout: 15_000 });

const mocks = vi.hoisted(() => ({
  getProcedureMetrics: vi.fn(),
  listPendingReview: vi.fn(),
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
  listPendingReview: mocks.listPendingReview,
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
  mocks.listPendingReview.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, isReviewer: true });
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
    // The bar of the general summary; each area card has its own below.
    const summary = screen.getByRole('list', { name: 'Ejecuciones del período' }).closest('section')!;
    expect(within(summary).getByTestId('outcome-bar')).toHaveAttribute('aria-hidden', 'true');
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
    // More than 0 abandoned: bold, an alert color and a dot, not only color. Open, on bosque, the
    // light peach.
    expect(within(row).getByTestId('abandoned-alert')).toHaveClass('font-bold', 'text-[#FFD2BC]');
    // The numbers in bold 16 px.
    expect(within(row).getByText('4')).toHaveClass('text-base', 'font-bold');
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
    expect(cells).toEqual(['2', '4', '2', '1 (25,0%)', '3 min 20 s· 53 % del total']);
    // Every data cell of the table shares the same alignment, footer included.
    const dataCells = within(table)
      .getAllByRole('row')
      .slice(1)
      .flatMap((tableRow) => within(tableRow).getAllByRole('cell').slice(1));
    expect(dataCells.length).toBeGreaterThan(0);
    for (const cell of dataCells) {
      expect(cell).toHaveClass('text-left', 'tabular-nums');
      expect(cell).not.toHaveClass('text-right');
    }
    // The step number in a 30 px light green circle; the tag of the slowest step.
    expect(within(second).getByText('2', { selector: 'span' })).toHaveClass(
      'size-[30px]',
      'bg-chip-area',
    );
    expect(within(second).getByText('Mayor tiempo')).toHaveClass(
      'bg-[#FDEBE2]',
      'text-[#8A3410]',
      'whitespace-nowrap',
    );
    // The bar of the slowest step is orange, of its share of the total.
    const bar = within(second).getByTestId('step-time-bar').firstElementChild as HTMLElement;
    expect(bar).toHaveClass('bg-naranja');
    expect(bar.style.width).toBe(`${(200000 / 380000) * 100}%`);
    // The table in its 14 px frame; the whole procedure under a bosque line, on pale green.
    expect(table.parentElement).toHaveClass('rounded-[14px]', 'border-[#DDE3DE]');
    expect(within(table).getByRole('row', { name: /Procedimiento completo/ })).toHaveClass(
      'border-t-2',
      'border-bosque',
      'bg-[#F3F8F5]',
    );

    const first = within(table).getByRole('row', { name: /Contar el efectivo/ });
    expect(within(first).getByTestId('step-time-bar').firstElementChild).toHaveClass(
      'bg-[#1B9B5B]',
    );
    expect(within(first).getAllByRole('cell').map(shown)).toEqual([
      '1',
      '4',
      '4',
      '0',
      '3 min· 47 % del total',
    ]);
  });

  test('a step card on a phone: "Llegaron: N" and the others, under the description', async () => {
    render(<MetricsPanel />);
    const card = await procedureCard();

    const table = within(card).getByRole('table', { name: 'Pasos de Cierre de caja' });
    const step = within(table).getByRole('row', { name: /Contar el efectivo/ });
    expect(step).toHaveClass('max-lg:grid');
    const labels = within(step)
      .getAllByRole('cell')
      .map((cell) => cell.querySelector('.lg\\:hidden')?.textContent);
    expect(labels).toEqual([undefined, 'Llegaron: ', 'Terminaron: ', 'Abandonaron: ', undefined]);
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
    const ventas = async () => {
      threeInVentas();
      render(<MetricsPanel />);
      await waitFor(() => expect(areaCard('Ventas')).toBeInTheDocument());
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
    const VER = 'Ver resumen de todos los procedimientos de esta área';
    const OCULTAR = 'Ocultar el resumen de todos los procedimientos de esta área';

    test('a flat white card: its name, its counts and the strip over the procedures', async () => {
      await ventas();

      const card = areaCard('Ventas');
      expect(card).toHaveClass('rounded-3xl', 'border-[#DDE3DE]', 'bg-blanco', 'overflow-hidden');
      expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Ventas');
      expect(card).toHaveTextContent('3 procedimientos · 12 ejecuciones');
      const strip = within(card).getByText('Procedimientos · tocá uno para abrirlo');
      expect(strip).toHaveClass('bg-[#E6EFE9]', 'uppercase', 'text-xs', 'font-bold');
    });

    test('no gradient and no orange border in the head or in the open row', async () => {
      await ventas();

      const card = areaCard('Ventas');
      const header = card.querySelector('header')!;
      const openArticle = row('Apertura del local').closest('article')!;
      for (const element of [card, header, openArticle, row('Apertura del local')]) {
        expect(element.className).not.toMatch(/gradient|linear|from-\[|border-naranja|border-l-/);
      }
      expect(card.innerHTML).not.toMatch(/bg-linear|bg-gradient|border-naranja/);
    });

    test('by default only the one with most executions is open, and it goes first', async () => {
      await ventas();

      const names = within(areaCard('Ventas'))
        .getAllByRole('article')
        .map(
          (article) =>
            document.getElementById(article.getAttribute('aria-labelledby')!)!.textContent,
        );
      expect(names).toEqual(['Apertura del local', 'Cierre de caja', 'Devolución de un producto']);
      expect(openRows()).toEqual(['Apertura del local']);
      const closed = document.getElementById(row('Cierre de caja').getAttribute('aria-controls')!)!;
      expect(closed).not.toBeVisible();
    });

    test('the open row is solid bosque with white text; the closed ones are not', async () => {
      await ventas();

      expect(row('Apertura del local')).toHaveClass('bg-bosque', 'text-blanco');
      expect(within(row('Apertura del local')).getByTestId('chevron')).toHaveClass(
        'bg-blanco/18',
      );
      expect(
        within(row('Apertura del local')).getByTestId('completed-bar').firstElementChild,
      ).toHaveClass('bg-[#7FD1A5]');
      for (const name of ['Cierre de caja', 'Devolución de un producto']) {
        expect(row(name)).not.toHaveClass('bg-bosque');
        expect(row(name)).toHaveClass('bg-blanco', 'hover:bg-[#F3F8F5]');
        expect(within(row(name)).getByTestId('chevron')).toHaveClass('border-[#DDE3DE]');
      }
      // Closed, an abandoned one goes in the alert color of the team.
      expect(within(row('Cierre de caja')).getByTestId('abandoned-alert')).toHaveClass(
        'text-durazno-texto',
      );
    });

    test('several can be open at once; clicking keeps the focus on the row', async () => {
      const user = userEvent.setup();
      await ventas();

      await user.click(row('Cierre de caja'));
      expect(openRows()).toEqual(['Apertura del local', 'Cierre de caja']);
      expect(row('Cierre de caja')).toHaveFocus();
      const panel = document.getElementById(row('Cierre de caja').getAttribute('aria-controls')!)!;
      expect(within(panel).getByRole('table', { name: 'Pasos de Cierre de caja' })).toBeVisible();

      await user.click(row('Cierre de caja'));
      expect(openRows()).toEqual(['Apertura del local']);
      expect(row('Cierre de caja')).toHaveFocus();
    });

    test('with the keyboard: Tab goes through the leaf and the rows; Enter and Space toggle', async () => {
      const user = userEvent.setup();
      await ventas();

      leaf().focus();
      await user.tab();
      expect(row('Apertura del local')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(openRows()).toEqual([]);
      await user.tab();
      expect(row('Cierre de caja')).toHaveFocus();
      await user.keyboard(' ');
      expect(openRows()).toEqual(['Cierre de caja']);
    });

    test('the leaf opens and closes them all, with aria-expanded and its name', async () => {
      const user = userEvent.setup();
      await ventas();

      expect(leaf()).toHaveAccessibleName(VER);
      expect(leaf()).toHaveAttribute('aria-expanded', 'false');
      expect(leaf()).toHaveClass('size-[46px]', 'border-bosque');
      expect(leaf().getAttribute('aria-controls')!.split(' ')).toHaveLength(3);

      await user.click(leaf());
      expect(openRows()).toEqual([
        'Apertura del local',
        'Cierre de caja',
        'Devolución de un producto',
      ]);
      expect(leaf()).toHaveAccessibleName(OCULTAR);
      expect(leaf()).toHaveAttribute('aria-expanded', 'true');

      await user.click(leaf());
      expect(openRows()).toEqual([]);
      expect(leaf()).toHaveAttribute('aria-expanded', 'false');
    });

    test('opening every row by hand also marks the leaf as expanded', async () => {
      const user = userEvent.setup();
      await ventas();

      await user.click(row('Cierre de caja'));
      await user.click(row('Devolución de un producto'));
      expect(leaf()).toHaveAttribute('aria-expanded', 'true');
      expect(leaf()).toHaveAccessibleName(OCULTAR);
    });

    test('the leaf has a tooltip with its name, tied by aria-describedby', async () => {
      const user = userEvent.setup();
      await ventas();

      const tip = document.getElementById(leaf().getAttribute('aria-describedby')!)!;
      expect(tip).toHaveAttribute('role', 'tooltip');
      expect(tip).toHaveTextContent(VER);
      // Bosque with white 13 px text, under the button and aligned to its right.
      expect(tip).toHaveClass('bg-bosque', 'text-blanco', 'text-[13px]', 'right-0', 'top-full');
      // It shows on hover and on keyboard focus, not only with the mouse.
      expect(tip).toHaveClass('group-hover:visible', 'group-has-[:focus-visible]:visible');

      await user.click(leaf());
      expect(tip).toHaveTextContent(OCULTAR);

      // Escape hides it.
      leaf().focus();
      await user.keyboard('{Escape}');
      expect(tip).toHaveClass('hidden');
    });

    test('on a phone the row stacks: the name and the chevron on top, the data below', async () => {
      await ventas();

      const button = row('Cierre de caja');
      expect(button).toHaveClass('grid-cols-[minmax(0,1fr)_36px]');
      expect(button.className).toContain(
        'lg:grid-cols-[minmax(0,1fr)_120px_230px_100px_130px_36px]',
      );
      expect(within(button).getByTestId('chevron')).toHaveClass('col-start-2', 'row-start-1');
      expect(within(button).getByText('Cierre de caja')).toHaveClass('col-start-1', 'row-start-1');
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
    // The period in view, twice; the period before, asked apart, once.
    const asked = mocks.getProcedureMetrics.mock.calls.map(([filters]) => filters.from);
    expect(asked.filter((from) => from === '2026-10-01')).toHaveLength(2);
    expect(asked.filter((from) => from === '2026-09-04')).toHaveLength(1);
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

describe('the period before', () => {
  const PREVIOUS = { ...metricsResponse().totals, started: 3, completed: 2, abandoned: 0 };

  test('asks for the period of the same length right before, with the same area', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-14&hasta=2026-10-27`);
    mocks.getProcedureMetrics.mockImplementation(async (filters: { from: string }) =>
      filters.from === '2026-09-30'
        ? metricsResponse({ totals: PREVIOUS })
        : metricsResponse(),
    );
    render(<MetricsPanel />);

    await waitFor(() =>
      expect(screen.getByTestId('compared-with')).toHaveTextContent(
        'Comparado con 30 sep – 13 oct',
      ),
    );
    expect(mocks.getProcedureMetrics).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-09-30', to: '2026-10-13' },
      expect.anything(),
    );
    expect(screen.getAllByTestId('change').length).toBeGreaterThan(0);
  });

  test('if it fails, the summary shows the same, without comparing', async () => {
    mocks.getProcedureMetrics.mockImplementation(async (filters: { from: string }) => {
      if (filters.from !== '2026-10-01') throw new ApiError(503);
      return metricsResponse();
    });
    render(<MetricsPanel />);

    await waitFor(() =>
      expect(screen.getByTestId('compared-with')).toHaveTextContent(
        'No se pudo comparar con el período anterior',
      ),
    );
    expect(datum(/^Ejecuciones/)).toBe('5');
    expect(screen.queryAllByTestId('change')).toHaveLength(0);
  });

  test('the documents tab does not ask for it', async () => {
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);

    await waitFor(() => expect(mocks.getDocuments).toHaveBeenCalled());
    expect(mocks.getProcedureMetrics).toHaveBeenCalledTimes(1);
  });
});

describe('the documents to review', () => {
  test('under the tiles, from "Por revisar", with the area of the panel', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&seccion=documentos`);
    mocks.listPendingReview.mockResolvedValue({
      data: [
        reviewDocument(1, 'Manual de caja', [VENTAS], '2026-10-20', 'OVERDUE'),
        reviewDocument(2, 'Plan de evacuación', [OPERACIONES], '2026-10-25', 'OVERDUE'),
        reviewDocument(3, 'Apertura del local', [VENTAS], '2026-11-02', 'DUE_SOON'),
      ],
      total: 3,
      page: 1,
      limit: 100,
      isReviewer: true,
    });
    render(<MetricsPanel />);

    const documents = await screen.findByRole('region', { name: 'Documentos' });
    const overdue = await within(documents).findByRole('region', { name: /^Vencidos/ });
    // Today is 27/10/2026 in Buenos Aires.
    expect(overdue).toHaveTextContent('Vencidos (1)');
    expect(overdue).toHaveTextContent('Manual de caja');
    expect(overdue).toHaveTextContent('venció hace 7 días');
    expect(overdue).not.toHaveTextContent('Plan de evacuación');
    expect(within(documents).getByRole('region', { name: /^Vencen pronto/ })).toHaveTextContent(
      'vence el 2 nov 2026',
    );
    expect(mocks.listPendingReview).toHaveBeenCalledWith(1, 100, expect.anything());
    // An ADMIN sees every document: no note.
    expect(screen.queryByText(/solo los documentos de los que sos responsable/)).not.toBeInTheDocument();
  });

  test('asks every page until it has them all', async () => {
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    mocks.listPendingReview.mockImplementation(async (page: number) => ({
      data: [reviewDocument(page, `Documento ${page}`, [VENTAS], '2026-10-20', 'OVERDUE')],
      total: 2,
      page,
      limit: 100,
      isReviewer: true,
    }));
    render(<MetricsPanel />);

    const overdue = await screen.findByRole('region', { name: /^Vencidos/ });
    await waitFor(() => expect(overdue).toHaveTextContent('Vencidos (2)'));
    expect(mocks.listPendingReview).toHaveBeenCalledTimes(2);
  });

  test('a SUPERVISOR is told the lists have only their documents', async () => {
    mocks.useSession.mockReturnValue(SERGIO);
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    render(<MetricsPanel />);

    expect(
      await screen.findByText('En estas listas están solo los documentos de los que sos responsable.'),
    ).toBeInTheDocument();
  });

  test('the procedures tab does not ask for them', async () => {
    render(<MetricsPanel />);

    await procedureCard();
    expect(mocks.listPendingReview).not.toHaveBeenCalled();
  });
});

describe('Exportar CSV', () => {
  const exportButton = () => screen.getByRole('button', { name: 'Exportar CSV' });

  // The file the browser would download: its name and its text.
  function catchDownload() {
    const files: { name: string; blob: Blob }[] = [];
    let last: Blob | null = null;
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = (blob: Blob) => {
      last = blob;
      return 'blob:metricas';
    };
    URL.revokeObjectURL = () => {};
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        files.push({ name: this.download, blob: last! });
      });
    return {
      files,
      restore() {
        click.mockRestore();
        URL.createObjectURL = original.create;
        URL.revokeObjectURL = original.revoke;
      },
    };
  }

  test('next to the tabs, disabled with its reason while the numbers load', async () => {
    mocks.getProcedureMetrics.mockReturnValue(new Promise(() => {}));
    render(<MetricsPanel />);

    const tablist = screen.getByRole('tablist');
    expect(tablist.parentElement).toContainElement(exportButton());
    expect(exportButton()).toHaveAttribute('aria-disabled', 'true');
    expect(exportButton()).toHaveAccessibleDescription('Esperá a que carguen los datos.');
  });

  test('without executions there is nothing to export', async () => {
    mocks.getProcedureMetrics.mockResolvedValue(EMPTY_METRICS);
    render(<MetricsPanel />);

    await waitFor(() =>
      expect(exportButton()).toHaveAccessibleDescription(
        'No hay datos para exportar con estos filtros.',
      ),
    );
  });

  test('procedures: one row per procedure, with the filters in the name and the context', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-14&hasta=2026-10-27`);
    const download = catchDownload();
    try {
      render(<MetricsPanel />);
      await procedureCard();
      await waitFor(() => expect(exportButton()).not.toHaveAttribute('aria-disabled'));

      await user.click(exportButton());
      expect(download.files).toHaveLength(1);
      const [file] = download.files;
      expect(file.name).toBe('metricas-procedimientos_2026-10-14_2026-10-27.csv');
      // UTF-8 with its BOM (Blob.text() drops it when decoding).
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = await file.blob.text();
      expect(text.replace(/^\uFEFF/, '').split('\r\n').slice(0, 3)).toEqual([
        'Área;Ventas',
        'Desde;2026-10-14',
        'Hasta;2026-10-27',
      ]);
      expect(text).toContain('procedimiento;area;ejecuciones');
      expect(text).toContain('Cierre de caja;Ventas;');
      expect(await screen.findByText('Archivo descargado')).toBeInTheDocument();
    } finally {
      download.restore();
    }
  });

  test('documents and assistant: the counts and the numbers of the assistant', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('seccion=documentos');
    const download = catchDownload();
    try {
      render(<MetricsPanel />);
      await screen.findByRole('region', { name: 'Asistente' });
      await waitFor(() => expect(exportButton()).not.toHaveAttribute('aria-disabled'));

      await user.click(exportButton());
      const [file] = download.files;
      expect(file.name).toBe('metricas-documentos-y-asistente_2026-10-01_2026-10-27.csv');
      const text = await file.blob.text();
      expect(text).toContain('Documentos;Activos;12;');
      expect(text).toContain('Asistente;Preguntas;9;');
      // The documents and the assistant were asked for once: the button uses the same answers.
      expect(mocks.getDocuments).toHaveBeenCalledTimes(1);
      expect(mocks.getAssistant).toHaveBeenCalledTimes(1);
    } finally {
      download.restore();
    }
  });
});
