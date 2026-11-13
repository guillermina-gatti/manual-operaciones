import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MetricsSummary } from '@/components/metrics/MetricsSummary';
import type { ProceduresMetricsResponse } from '@/lib/api';
import { metricsResponse } from '../../support/metrics';

type Totals = ProceduresMetricsResponse['totals'];
const TOTALS: Totals = {
  started: 27,
  completed: 25,
  inProgress: 1,
  abandoned: 1,
  completionRate: 25 / 27,
  avgCompletionMs: 1_290_000,
};

const renderSummary = (
  totals: Partial<Totals> = {},
  { areaName = 'Todas las áreas', areaChosen = false } = {},
) =>
  render(
    <MetricsSummary
      metrics={metricsResponse({ totals: { ...TOTALS, ...totals } })}
      areaName={areaName}
      areaChosen={areaChosen}
    />,
  );

const hero = () => screen.getByRole('region', { name: 'Resumen general' });
const datum = (label: RegExp) =>
  within(hero())
    .getAllByRole('term')
    .find((term) => label.test(term.textContent ?? ''))!.nextElementSibling!.textContent;
const segments = () =>
  [...screen.getByTestId('outcome-bar').children].map((part) => ({
    part: part.getAttribute('data-part'),
    width: (part as HTMLElement).style.width,
  }));
const legend = () =>
  within(screen.getByRole('list', { name: 'Ejecuciones del período' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('the panel', () => {
  test('a region named "Resumen general", with the area in its heading and the orange mark', () => {
    renderSummary({}, { areaName: 'Ventas' });

    const heading = within(hero()).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Resumen general · Ventas');
    expect(heading.querySelector('[aria-hidden="true"]')).toHaveClass('w-1', 'bg-naranja');
    expect(hero()).toHaveClass('bg-bosque', 'rounded-3xl');
  });

  test('the ring: completed of the executions, as an image with its name', () => {
    renderSummary();

    expect(screen.getByRole('img', { name: '92,6 % completadas' })).toBeInTheDocument();
  });

  test('the headline, in plural', () => {
    renderSummary();

    expect(
      screen.getByText('Se completaron 25 de las 27 ejecuciones del período'),
    ).toBeInTheDocument();
  });

  test('the headline, in singular', () => {
    renderSummary({ started: 1, completed: 1, inProgress: 0, abandoned: 0 });
    expect(screen.getByText('Se completó 1 de 1 ejecución del período')).toBeInTheDocument();
  });

  test('the headline with one completed of several, and none of one', () => {
    const { unmount } = renderSummary({ started: 3, completed: 1, inProgress: 1, abandoned: 1 });
    expect(screen.getByText('Se completó 1 de las 3 ejecuciones del período')).toBeInTheDocument();
    unmount();

    renderSummary({ started: 1, completed: 0, inProgress: 1, abandoned: 0 });
    expect(screen.getByText('Se completaron 0 de 1 ejecución del período')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0,0 % completadas' })).toBeInTheDocument();
  });

  test('without executions: the empty state, without ring, bar or data', () => {
    renderSummary({ started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null });

    expect(within(hero()).getByText('No hay ejecuciones en este período.')).toBeInTheDocument();
    expect(within(hero()).getByText('Probá con otras fechas u otra área.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-bar')).not.toBeInTheDocument();
    expect(within(hero()).queryAllByRole('term')).toHaveLength(0);
  });

  test('a chosen area without executions names it', () => {
    renderSummary(
      { started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null },
      { areaName: 'Ventas', areaChosen: true },
    );

    expect(within(hero()).getByText('Sin ejecuciones en Ventas')).toBeInTheDocument();
    expect(
      within(hero()).getByText(
        'No hay procedimientos ejecutados en este período. Probá con otras fechas.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the bar and its legend', () => {
  test('one part per outcome, of its share of the executions', () => {
    renderSummary({ started: 4, completed: 2, inProgress: 1, abandoned: 1 });

    expect(segments()).toEqual([
      { part: 'completed', width: '50%' },
      { part: 'inProgress', width: '25%' },
      { part: 'abandoned', width: '25%' },
    ]);
    expect(screen.getByTestId('outcome-bar')).toHaveAttribute('aria-hidden', 'true');
  });

  test('green, blue and white at 55 %', () => {
    renderSummary();

    const fills = [...screen.getByTestId('outcome-bar').children].map((part) => part.className);
    expect(fills[0]).toContain('bg-[#7FD1A5]');
    expect(fills[1]).toContain('bg-[#6CA8FF]');
    expect(fills[2]).toContain('bg-blanco/55');
  });

  test('a part with 0 is not drawn, but the legend still says 0', () => {
    renderSummary({ started: 3, completed: 3, inProgress: 0, abandoned: 0 });

    expect(segments()).toEqual([{ part: 'completed', width: '100%' }]);
    expect(legend()).toEqual(['3 completadas', '0 en curso', '0 abandonadas']);
  });

  test('the legend in words, singular and plural', () => {
    renderSummary({ started: 4, completed: 1, inProgress: 2, abandoned: 1 });

    expect(legend()).toEqual(['1 completada', '2 en curso', '1 abandonada']);
  });
});

describe('the data', () => {
  test('executions, abandoned with their share, and the average time', () => {
    renderSummary();

    expect(datum(/^Ejecuciones$/)).toBe('27');
    expect(datum(/^Abandonadas$/)).toBe('1(3,7 % del total)');
    expect(datum(/^Tiempo medio/)).toBe('21 min 30 s');
    expect(within(hero()).getByText(/^Tiempo medio/)).toHaveTextContent(
      'Tiempo medio por ejecución completada',
    );
  });

  test('none abandoned: "(0,0 % del total)"; without completed ones, a dash', () => {
    renderSummary({ completed: 0, inProgress: 27, abandoned: 0, avgCompletionMs: null });

    expect(datum(/^Abandonadas$/)).toBe('0(0,0 % del total)');
    expect(datum(/^Tiempo medio/)).toBe('—');
  });

  test('the note stays under the panel', () => {
    renderSummary();

    expect(
      screen.getByText(
        'En curso: con avance en las últimas 24 h. Abandonadas: sin avanzar hace más de 24 h.',
      ),
    ).toBeInTheDocument();
  });
});
