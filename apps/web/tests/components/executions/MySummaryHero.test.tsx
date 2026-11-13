import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MySummaryHero } from '@/components/executions/MySummaryHero';
import type { MyMetricsTotals } from '@/lib/api';

const TOTALS: MyMetricsTotals = {
  started: 27,
  completed: 25,
  inProgress: 1,
  abandoned: 1,
  avgCompletionMs: 1_290_000,
};

const renderHero = (totals: Partial<MyMetricsTotals> = {}) =>
  render(
    <MySummaryHero
      totals={{ ...TOTALS, ...totals }}
      staleAfterHours={24}
      from="2026-11-01"
      to="2026-11-13"
    />,
  );

const hero = () => screen.getByRole('region', { name: 'Tu resumen' });
const datum = (label: RegExp) => {
  const dt = within(hero())
    .getAllByRole('term')
    .find((term) => label.test(term.textContent ?? ''));
  return dt!.nextElementSibling!.textContent;
};
const segments = () =>
  [...screen.getByTestId('outcome-bar').children].map((part) => ({
    part: part.getAttribute('data-part'),
    width: (part as HTMLElement).style.width,
  }));

describe('the panel', () => {
  test('a region named "Tu resumen", with the short period in its heading', () => {
    renderHero();

    expect(hero()).toBeInTheDocument();
    expect(within(hero()).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Tu resumen · 1 nov – 13 nov',
    );
  });

  test('the ring: completed of started, as an image with its name', () => {
    renderHero();

    expect(screen.getByRole('img', { name: '92,6 % completadas' })).toBeInTheDocument();
  });

  test('the headline, in plural', () => {
    renderHero();

    expect(
      screen.getByText('Terminaste 25 de los 27 recorridos que empezaste'),
    ).toBeInTheDocument();
  });

  test('the headline, in singular', () => {
    renderHero({ started: 1, completed: 0, inProgress: 1, abandoned: 0 });

    expect(screen.getByText('Terminaste 0 de 1 recorrido que empezaste')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0,0 % completadas' })).toBeInTheDocument();
  });

  test('nothing started: the empty state, without ring, bar or data', () => {
    renderHero({ started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null });

    expect(within(hero()).getByText('No empezaste procedimientos en este período.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-bar')).not.toBeInTheDocument();
    expect(within(hero()).queryAllByRole('term')).toHaveLength(0);
  });

  test('the bar: one part per outcome, of its share of the started', () => {
    renderHero({ started: 4, completed: 2, inProgress: 1, abandoned: 1 });

    expect(segments()).toEqual([
      { part: 'completed', width: '50%' },
      { part: 'inProgress', width: '25%' },
      { part: 'stale', width: '25%' },
    ]);
  });

  test('a part with 0 is not drawn', () => {
    renderHero({ started: 3, completed: 3, inProgress: 0, abandoned: 0 });

    expect(segments()).toEqual([{ part: 'completed', width: '100%' }]);
  });

  test('the legend says each outcome in words, singular and plural', () => {
    renderHero({ started: 4, completed: 1, inProgress: 2, abandoned: 1 });

    const items = within(screen.getByRole('list', { name: 'Tus ejecuciones del período' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      '1 completada',
      '2 en curso',
      // "hace más de 24 h" only for screen readers.
      '1 sin avanzar hace más de 24 h',
    ]);
  });

  test('the data: started, in progress (phone), without progress (desktop) and the average', () => {
    renderHero();

    expect(datum(/^Empezadas$/)).toBe('27');
    expect(datum(/^En curso$/)).toBe('1');
    expect(datum(/Sin avanzar hace más de 24 h/)).toBe('1');
    expect(datum(/^Tiempo medio/)).toBe('21 min 30 s');
  });

  test('the time keeps its units; without completed ones, a dash', () => {
    renderHero({ completed: 0, avgCompletionMs: null });

    expect(datum(/^Tiempo medio/)).toBe('—');
  });

  test('never says "abandonadas"', () => {
    const { container } = renderHero();

    expect(container.textContent).not.toMatch(/abandon/i);
  });
});
