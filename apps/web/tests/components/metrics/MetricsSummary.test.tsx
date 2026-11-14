import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MetricsSummary } from '@/components/metrics/MetricsSummary';
import type { PreviousTotals } from '@/components/metrics/MetricsSummary';
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

describe('against the period before', () => {
  const PERIOD = { from: '2026-10-19', to: '2026-10-31' };
  const renderWith = (previous: PreviousTotals | null) =>
    render(
      <MetricsSummary
        metrics={metricsResponse({ totals: TOTALS })}
        areaName="Todas las áreas"
        areaChosen={false}
        previous={previous}
      />,
    );
  const changes = () =>
    screen.getAllByTestId('change').map((change) => ({
      direction: change.getAttribute('data-direction'),
      // The words of the desktop; the phone has its short ones.
      words: change.querySelector('.max-lg\\:hidden')!.textContent,
      short: change.querySelector('.lg\\:hidden')!.textContent,
      worse: within(change).queryByTestId('worse-dot') !== null,
    }));

  test('each number says how it changed, with an arrow and words, never only color', () => {
    renderWith({
      status: 'success',
      period: PERIOD,
      totals: { started: 24, completed: 23, inProgress: 0, abandoned: 1, avgCompletionMs: 1_050_000 },
    });

    // The % completed under the headline; then executions, abandoned and the time.
    expect(changes()).toEqual([
      // 95,8 % → 92,6 %.
      { direction: 'down', words: '3,2 puntos de completadas menos', short: '3,2 puntos de completadas menos', worse: false },
      { direction: 'up', words: '3 más que el período anterior', short: '3 más', worse: false },
      { direction: 'same', words: 'igual', short: 'igual', worse: false },
      { direction: 'up', words: '4 min más lento', short: '4 min más lento', worse: true },
    ]);
    // The arrow is drawn, but hidden from a screen reader: the words say it.
    const [, executions] = screen.getAllByTestId('change');
    expect(executions).toHaveTextContent('▲');
    expect(within(executions).getByText(/▲/)).toHaveAttribute('aria-hidden', 'true');
    // 13 px in the light green of the panel, never red or green.
    expect(executions).toHaveClass('text-[13px]', 'text-[#C9DED3]');
    // The line under the panel names the period, in 12 px, and describes every change.
    const line = screen.getByTestId('compared-with');
    expect(line).toHaveTextContent('Comparado con 19 oct – 31 oct');
    expect(line).toHaveClass('text-xs');
    for (const change of screen.getAllByTestId('change')) {
      expect(change).toHaveAttribute('aria-describedby', line.id);
    }
  });

  test('the period before without executions: says so, with no numbers to compare', () => {
    renderWith({
      status: 'success',
      period: PERIOD,
      totals: { started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null },
    });

    expect(screen.queryAllByTestId('change')).toHaveLength(0);
    expect(screen.getByTestId('compared-with')).toHaveTextContent(
      'Sin ejecuciones en el período anterior (19 oct – 31 oct)',
    );
    expect(hero()).not.toHaveTextContent(/%.*del período anterior|Infinity|NaN/);
  });

  test('while it comes, empty lines keep the place of the changes', () => {
    renderWith({ status: 'loading', period: PERIOD });

    expect(screen.getAllByTestId('change-placeholder')).toHaveLength(4);
    for (const line of screen.getAllByTestId('change-placeholder')) {
      expect(line).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getByTestId('compared-with')).toHaveTextContent('Comparado con 19 oct – 31 oct');
  });

  test('if it failed, the panel stays, with a quiet line', () => {
    renderWith({ status: 'error', period: PERIOD });

    expect(screen.queryAllByTestId('change')).toHaveLength(0);
    expect(screen.queryAllByTestId('change-placeholder')).toHaveLength(0);
    expect(datum(/^Ejecuciones/)).toBe('27');
    expect(screen.getByTestId('compared-with')).toHaveTextContent(
      'No se pudo comparar con el período anterior',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('without dates there is no period before: nothing compared, no line', () => {
    renderWith(null);

    expect(screen.queryAllByTestId('change')).toHaveLength(0);
    expect(screen.queryByTestId('compared-with')).not.toBeInTheDocument();
  });
});
