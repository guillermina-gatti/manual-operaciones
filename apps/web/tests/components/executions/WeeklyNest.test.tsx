import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WeeklyNest, WeeklyNestView, nestLayerFill } from '@/components/executions/WeeklyNest';
import { ApiError } from '@/lib/api';
import type { ApiResource, MyDailyActivityResponse } from '@/lib/api';
import { myDailyResponse } from '../../support/my-daily';

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

const reload = vi.fn();
const success = (data: MyDailyActivityResponse): ApiResource<MyDailyActivityResponse> => ({
  status: 'success',
  data,
  error: null,
  reload,
});

// Thursday 12 November.
const THURSDAY = '2026-11-12';

function renderNest(week: Partial<MyDailyActivityResponse['week']>, today = THURSDAY) {
  return render(<WeeklyNestView state={success(myDailyResponse({ week }))} today={today} />);
}

const nest = () => screen.getByRole('region', { name: /Tu nido de esta semana/ });
const layers = (container: HTMLElement) =>
  [...container.querySelectorAll<SVGRectElement>('rect[data-layer]')];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({
    user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena', role: 'EMPLOYEE' },
    status: 'ready',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('three days with progress', () => {
  test('the label with the week, the title, the text and "Se reinicia el lunes"', () => {
    renderNest({});

    expect(screen.getByRole('heading', { name: 'Tu nido de esta semana · 9 – 13 NOV' })).toBeInTheDocument();
    expect(within(nest()).getByText('3 de 5 días con avance')).toBeInTheDocument();
    expect(
      within(nest()).getByText(
        'Completaste 4 procedimientos esta semana. Cada día con avance suma una franja a tu nido.',
      ),
    ).toBeInTheDocument();
    expect(within(nest()).getByText('Se reinicia el lunes')).toBeInTheDocument();
    expect(within(nest()).queryByRole('link')).not.toBeInTheDocument();
  });

  test('singular: one procedure', () => {
    renderNest({ activeDays: ['2026-11-09'], completedCount: 1 });

    expect(within(nest()).getByText('1 de 5 días con avance')).toBeInTheDocument();
    expect(within(nest()).getByText(/Completaste 1 procedimiento esta semana\./)).toBeInTheDocument();
  });

  test('the nest: as many filled layers as days, the last one orange, no stroke between them', () => {
    const { container } = renderNest({});

    const all = layers(container);
    expect(all).toHaveLength(5);
    expect(all.filter((layer) => layer.dataset.filled === 'true')).toHaveLength(3);
    expect(all[2].style.fill).toBe('var(--color-naranja)');
    expect(all[0].style.fill).not.toBe('var(--color-naranja)');
    expect(all[3].style.fill).toBe('rgb(241, 227, 213)'); // #F1E3D5, empty
    // One piece: no lines and no stroke on the layers; only the outline of the dome.
    expect(container.querySelectorAll('svg line')).toHaveLength(0);
    expect(all.every((layer) => !layer.getAttribute('stroke'))).toBe(true);
    expect(container.querySelectorAll('svg [stroke]')).toHaveLength(1);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // The layers of the mockup, from the bottom up.
    expect(all.map((layer) => layer.getAttribute('y'))).toEqual(['52.8', '41.6', '30.4', '19.2', '8']);
  });

  test('the fill moves for at most 400 ms, and not with reduced motion', () => {
    const { container } = renderNest({});

    expect(layers(container)[0]).toHaveClass('duration-300', 'motion-reduce:transition-none');
  });
});

describe('zero and five days', () => {
  test('0: about to start, with the button to choose a procedure', () => {
    const { container } = renderNest({ activeDays: [], completedCount: 0 });

    expect(within(nest()).getByText('Tu nido de esta semana está por empezar')).toBeInTheDocument();
    expect(
      within(nest()).getByText('Completá un procedimiento hoy y sumás la primera franja.'),
    ).toBeInTheDocument();
    const start = within(nest()).getByRole('link', { name: 'Elegir un procedimiento' });
    expect(start).toHaveAttribute('href', '/ejecuciones');
    expect(start).toHaveClass('min-h-11', 'bg-bosque');
    expect(layers(container).filter((layer) => layer.dataset.filled === 'true')).toHaveLength(0);
    expect(within(nest()).queryByText('Se reinicia el lunes')).not.toBeInTheDocument();
  });

  test('5: complete, with "✓ Semana completa"', () => {
    const { container } = renderNest(
      {
        activeDays: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
        completedCount: 7,
      },
      '2026-11-13',
    );

    expect(within(nest()).getByText('Nido completo')).toBeInTheDocument();
    expect(
      within(nest()).getByText('Hiciste avance los 5 días de la semana. Buen trabajo.'),
    ).toBeInTheDocument();
    expect(within(nest()).getByText('Semana completa')).toBeInTheDocument();
    const all = layers(container);
    expect(all.every((layer) => layer.dataset.filled === 'true')).toBe(true);
    expect(all[4].style.fill).toBe('var(--color-naranja)');
    expect(all.slice(0, 4).every((layer) => layer.style.fill !== 'var(--color-naranja)')).toBe(true);
  });

  test('the colors of the layers, from the bottom up', () => {
    expect([0, 1, 2, 3, 4].map((i) => nestLayerFill(i, 5))).toEqual([
      '#9A6A45',
      '#B07C54',
      '#C48A5E',
      '#D39A6F',
      'var(--color-naranja)',
    ]);
    expect(nestLayerFill(0, 1)).toBe('var(--color-naranja)');
    expect(nestLayerFill(1, 1)).toBe('#F1E3D5');
  });
});

describe('the days', () => {
  test('an accessible list: each day with its words, today marked', () => {
    renderNest({ activeDays: ['2026-11-09', '2026-11-11'] });

    const list = within(nest()).getByRole('list', { name: 'Días de la semana' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.sr-only')?.textContent)).toEqual([
      'Lunes: con avance',
      'Martes: sin avance',
      'Miércoles: con avance',
      'Jueves, hoy: sin avance todavía',
      'Viernes: sin avance',
    ]);
    // Not by color only: the visible name, "· hoy" in bold, and a check on the filled ones.
    expect(within(items[3]).getByText('Jue · hoy')).toHaveClass('font-bold');
    expect(items[3].querySelector('span')).toHaveClass('border-naranja');
    expect(items[0].querySelector('span svg')).not.toBeNull();
    expect(items[1].querySelector('span')).toHaveClass('border-dashed');
  });

  test.each([
    ['Saturday', '2026-11-14'],
    ['Sunday', '2026-11-15'],
  ])('on %s no day is today', (_name, today) => {
    renderNest({}, today);

    const items = within(nest()).getAllByRole('listitem');
    expect(items.every((item) => item.dataset.today === 'false')).toBe(true);
    expect(within(nest()).queryByText(/· hoy/)).not.toBeInTheDocument();
  });
});

describe('the phone', () => {
  test('a smaller nest and smaller days, the same element reorganized', () => {
    const { container } = renderNest({});

    expect(container.querySelector('svg')).toHaveClass('w-[112px]', 'md:w-[200px]');
    const circle = within(nest()).getAllByRole('listitem')[0].querySelector('span');
    expect(circle).toHaveClass('size-[30px]', 'md:size-[34px]');
    // Two columns on the phone (nest | title), three from md.
    expect(nest()).toHaveClass('grid-cols-[auto_minmax(0,1fr)]', 'md:grid-cols-[auto_minmax(0,1fr)_auto]');
  });
});

describe('loading and error', () => {
  test('a skeleton of the same card while it loads', () => {
    mocks.getMyDailyActivity.mockReturnValue(new Promise(() => {}));
    render(<WeeklyNest />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando tu nido de esta semana…');
    expect(screen.getByTestId('weekly-nest-loading')).toBeInTheDocument();
  });

  test('asks without an area, and an error can be retried without hiding anything else', async () => {
    const user = userEvent.setup();
    mocks.getMyDailyActivity
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce(myDailyResponse());
    render(
      <>
        <WeeklyNest />
        <p>El resto de la página</p>
      </>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar tu nido de esta semana.',
    );
    expect(screen.getByText('El resto de la página')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(nest()).toBeInTheDocument());
    expect(mocks.getMyDailyActivity).toHaveBeenCalledTimes(2);
    expect(mocks.getMyDailyActivity).toHaveBeenCalledWith(null, expect.any(AbortSignal));
  });

  test('without a session it asks nothing', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<WeeklyNest />);

    expect(mocks.getMyDailyActivity).not.toHaveBeenCalled();
  });
});
