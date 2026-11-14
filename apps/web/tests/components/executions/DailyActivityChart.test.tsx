import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DailyActivityChart,
  DailyActivityChartView,
} from '@/components/executions/DailyActivityChart';
import { ApiError } from '@/lib/api';
import type { ApiResource, MyDailyActivityResponse } from '@/lib/api';
import { dailyDays, myDailyResponse, procedure } from '../../support/my-daily';

const mocks = vi.hoisted(() => ({
  getMyDailyActivity: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getMyDailyActivity: mocks.getMyDailyActivity,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const TODAY = '2026-11-13';

// Three procedures on Tuesday 3 Nov, one on Monday 2 and two of the first on Friday 13.
const FEW = dailyDays(TODAY, {
  '2026-11-02': [procedure(1, 1, 'Hola1')],
  '2026-11-03': [procedure(1, 1, 'Hola1'), procedure(2, 1, 'Hola2'), procedure(3, 1, 'ejemplo2')],
  '2026-11-13': [procedure(1, 2, 'Hola1')],
});

const success = (days = FEW): ApiResource<MyDailyActivityResponse> => ({
  status: 'success',
  data: myDailyResponse({ windowTo: TODAY, days }),
  error: null,
  reload: vi.fn(),
});

const card = () => screen.getByRole('region', { name: 'Actividad diaria' });
const chart = () => screen.getByTestId('daily-chart');
const column = (date: string) => chart().querySelector<SVGGElement>(`g[data-day="${date}"]`)!;
const segments = (date: string) => [...column(date).querySelectorAll<SVGPathElement>('path[data-segment]')];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({
    user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena', role: 'EMPLOYEE' },
    status: 'ready',
  });
});

describe('the card', () => {
  test('title, the real window in the subtitle and the table button', () => {
    render(<DailyActivityChartView state={success()} />);

    expect(within(card()).getByRole('heading', { level: 2, name: 'Actividad diaria' })).toBeInTheDocument();
    expect(
      within(card()).getByText(
        'Ejecuciones completadas por día, apiladas por procedimiento. Últimos 21 días (24 oct – 13 nov); no cambia con las fechas del filtro.',
      ),
    ).toBeInTheDocument();
    const toggle = within(card()).getByRole('button', { name: 'Ver como tabla' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveClass('min-h-10', 'border-bosque');
  });
});

describe('bars and segments', () => {
  test('a column for each of the 21 days, also the empty weekends', () => {
    render(<DailyActivityChartView state={success()} />);

    expect(chart().querySelectorAll('g[data-day]')).toHaveLength(21);
    expect(segments('2026-11-07')).toHaveLength(0); // Saturday
    expect(column('2026-11-03').dataset.total).toBe('3');
  });

  test('stacked in the order of the series, 2 px apart, only the top one rounded', () => {
    render(<DailyActivityChartView state={success()} />);

    const tuesday = segments('2026-11-03');
    expect(tuesday.map((s) => s.getAttribute('fill'))).toEqual([
      'var(--color-naranja)', // Hola1, the most completed in the window
      'var(--color-bosque)', // ejemplo2 (a tie with Hola2, by name)
      '#EDA100', // Hola2
    ]);
    // No stroke around the segments.
    expect(tuesday.every((s) => !s.getAttribute('stroke'))).toBe(true);
    // Only the last path has the curves of the rounded top.
    expect(tuesday.map((s) => s.getAttribute('d')!.includes('Q'))).toEqual([false, false, true]);
    // The gap: the bottom of a segment is 2 units above the top of the one below.
    const top = (d: string) => Number(/V([\d.]+)/.exec(d)![1]);
    const bottom = (d: string) => Number(/^M[\d.]+,([\d.]+)/.exec(d)![1]);
    expect(top(tuesday[0].getAttribute('d')!) - bottom(tuesday[1].getAttribute('d')!)).toBeCloseTo(2);
  });

  test('a whole y axis from 0 to at least 4, with its grid', () => {
    render(<DailyActivityChartView state={success()} />);

    expect([...chart().querySelectorAll('[data-y-tick]')].map((t) => t.textContent)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(chart().querySelectorAll('line[data-grid]')[0]).toHaveAttribute('stroke', '#E6E8E4');
  });

  test('the x labels: every 2 days on a computer, every 3 on a phone', () => {
    render(<DailyActivityChartView state={success()} />);

    const labels = [...chart().querySelectorAll<SVGTextElement>('[data-x-label]')];
    expect(labels[0]).toHaveTextContent('24 oct');
    const onComputer = labels.filter((l) => !l.classList.contains('md:hidden'));
    const onPhone = labels.filter((l) => !l.classList.contains('max-md:hidden'));
    expect(onComputer).toHaveLength(11);
    expect(onPhone).toHaveLength(7);
  });
});

describe('legend, box and table', () => {
  test('the legend: a square of color and the name in text color, and the note', () => {
    render(<DailyActivityChartView state={success()} />);

    const legend = within(card()).getByRole('list', { name: 'Procedimientos del gráfico' });
    const items = within(legend).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(['Hola1', 'ejemplo2', 'Hola2']);
    expect(items[0]).toHaveClass('text-[#2C4B41]');
    expect(items[0].querySelector('[data-legend-swatch]')).toHaveStyle({
      backgroundColor: 'var(--color-naranja)',
    });
    expect(
      within(card()).getByText('Los días sin barra no tuvieron ejecuciones completadas.'),
    ).toBeInTheDocument();
  });

  test('many procedures: four colors and "Otros"', () => {
    const days = dailyDays(TODAY, {
      '2026-11-10': Array.from({ length: 8 }, (_, i) => procedure(i + 1, i + 1)),
    });
    render(<DailyActivityChartView state={success(days)} />);

    const legend = within(card()).getByRole('list', { name: 'Procedimientos del gráfico' });
    expect(within(legend).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'Procedimiento 8',
      'Procedimiento 7',
      'Procedimiento 6',
      'Procedimiento 5',
      'Otros 4 procedimientos',
    ]);
    expect(segments('2026-11-10').at(-1)).toHaveAttribute('fill', '#9A6A45');
  });

  test('the box on hover: the whole day and a row per procedure', async () => {
    const user = userEvent.setup();
    render(<DailyActivityChartView state={success()} />);

    await user.hover(chart().querySelector('[data-focus-zone="2026-11-03"]')!);
    const box = screen.getByRole('tooltip');
    expect(within(box).getByText('Martes 3 nov · 3 completadas')).toBeInTheDocument();
    expect(within(box).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'ejemplo21',
      'Hola11',
      'Hola21',
    ]);
  });

  test('the box with the keyboard: each day with data is focusable, and Escape closes it', async () => {
    const user = userEvent.setup();
    render(<DailyActivityChartView state={success()} />);

    await user.tab(); // the table button
    await user.tab();
    const monday = screen.getByRole('img', { name: 'lunes 2 de noviembre: 1 completada — Hola1 1' });
    expect(monday).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Lunes 2 nov · 1 completada');
    await user.tab();
    expect(
      screen.getByRole('img', {
        name: 'martes 3 de noviembre: 3 completadas — ejemplo2 1, Hola1 1, Hola2 1',
      }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // Only the days with data: three of them.
    expect(chart().querySelectorAll('[tabindex="0"]')).toHaveLength(3);
  });

  test('the table: the same numbers, a row per day, a column per procedure and the total', async () => {
    const user = userEvent.setup();
    render(<DailyActivityChartView state={success()} />);

    const toggle = screen.getByRole('button', { name: 'Ver como tabla' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('daily-chart')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Ejecuciones completadas por día y por procedimiento' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Día',
      'Hola1',
      'ejemplo2',
      'Hola2',
      'Total',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(22);
    const tuesday = within(table).getByRole('rowheader', { name: 'Martes 3 nov' }).closest('tr')!;
    expect(within(tuesday).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '1', '1', '3']);
    // The legend stays.
    expect(within(card()).getByRole('list', { name: 'Procedimientos del gráfico' })).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByTestId('daily-chart')).toBeInTheDocument();
  });
});

describe('states', () => {
  test('without completed ones in 21 days: no chart, the message and the button', () => {
    render(<DailyActivityChartView state={success(dailyDays(TODAY))} />);

    expect(screen.queryByTestId('daily-chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver como tabla' })).not.toBeInTheDocument();
    expect(
      within(card()).getByText('Todavía no completaste ejecuciones en los últimos 21 días.'),
    ).toBeInTheDocument();
    expect(within(card()).getByRole('link', { name: 'Elegir un procedimiento' })).toHaveAttribute(
      'href',
      '/ejecuciones',
    );
  });

  test('loading: its own skeleton', () => {
    mocks.getMyDailyActivity.mockReturnValue(new Promise(() => {}));
    render(<DailyActivityChart areaId={null} />);

    expect(within(card()).getByRole('status')).toHaveTextContent('Cargando tu actividad diaria…');
  });

  test('asks with the area of the filters, and an error can be retried', async () => {
    const user = userEvent.setup();
    mocks.getMyDailyActivity
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce(myDailyResponse({ windowTo: TODAY, days: FEW }));
    render(<DailyActivityChart areaId={VENTAS} />);

    expect(await within(card()).findByRole('alert')).toHaveTextContent(
      'No se pudo cargar tu actividad diaria.',
    );
    await user.click(within(card()).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByTestId('daily-chart')).toBeInTheDocument());
    expect(mocks.getMyDailyActivity).toHaveBeenCalledWith(VENTAS, expect.any(AbortSignal));
    expect(mocks.getMyDailyActivity).toHaveBeenCalledTimes(2);
  });
});

describe('the phone', () => {
  test('only the drawing scrolls sideways, with a minimum width', () => {
    render(<DailyActivityChartView state={success()} />);

    const frame = chart().parentElement!;
    expect(frame).toHaveClass('min-w-[560px]');
    expect(frame.parentElement).toHaveClass('overflow-x-auto');
    // The axis text grows with the drawing scaled down, to stay at 12 px.
    expect(chart().querySelector('[data-y-tick]')).toHaveClass('text-[12px]', 'max-md:text-[24px]');
    // The legend wraps in several lines.
    expect(within(card()).getByRole('list', { name: 'Procedimientos del gráfico' })).toHaveClass(
      'flex-wrap',
    );
  });
});
