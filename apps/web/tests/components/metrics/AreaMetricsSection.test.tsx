import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { AreaMetricsSection } from '@/components/metrics/AreaMetricsSection';
import type { ProcedureMetricsResponse } from '@/lib/api';
import type { Area } from '@/lib/directory';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const DEPOSITO = '0a000000-0000-4000-8000-000000000003';
const LOGISTICA = '0a000000-0000-4000-8000-000000000004';
const CALIDAD = '0a000000-0000-4000-8000-000000000005';
const AREAS: Area[] = [
  { id: VENTAS, name: 'Ventas', isActive: true },
  { id: DEPOSITO, name: 'Depósito', isActive: true },
  { id: LOGISTICA, name: 'Logística', isActive: true },
  { id: CALIDAD, name: 'Calidad', isActive: true },
];

let next = 0;
const procedure = (
  areaId: string,
  title: string,
  [started, completed, inProgress, abandoned]: [number, number, number, number],
  avgCompletionMs: number | null,
): ProcedureMetricsResponse => {
  next += 1;
  const id = String(next).padStart(12, '0');
  return {
    procedureId: `1a000000-0000-4000-8000-${id}`,
    title,
    areaIds: [areaId],
    started,
    completed,
    inProgress,
    abandoned,
    completionRate: started === 0 ? null : completed / started,
    avgCompletionMs,
    minCompletionMs: avgCompletionMs,
    maxCompletionMs: avgCompletionMs,
    versions: [
      {
        procedureVersionId: `1b000000-0000-4000-8000-${id}`,
        started,
        completed,
        inProgress,
        abandoned,
        avgCompletionMs,
        steps: [
          {
            stepId: `1c000000-0000-4000-8000-${id}`,
            order: 1,
            title: 'Único paso',
            reached: started,
            finished: completed,
            avgDurationMs: avgCompletionMs,
            abandoned,
            abandonRate: started === 0 ? null : abandoned / started,
          },
        ],
      },
    ],
  };
};

// Ventas: 14 executions, 8 completed (6 of 10 min and 2 of 20 min: 12 min 30 s on average), 4 in
// progress and 2 abandoned. Depósito: none completed. Logística: one procedure of 1 h 10 min.
// Calidad: a procedure without executions.
const PROCEDURES = [
  procedure(VENTAS, 'Cierre de caja', [10, 6, 3, 1], 600_000),
  procedure(VENTAS, 'Apertura del local', [4, 2, 1, 1], 1_200_000),
  procedure(DEPOSITO, 'Inventario mensual', [3, 0, 2, 1], null),
  procedure(LOGISTICA, 'Despacho', [5, 5, 0, 0], 4_200_000),
  procedure(CALIDAD, 'Auditoría', [0, 0, 0, 0], null),
];

const renderSection = (procedures = PROCEDURES, areaId: string | null = null) =>
  render(
    <AreaMetricsSection
      procedures={procedures}
      areas={AREAS}
      areaId={areaId}
      viewerAreaIds={null}
    />,
  );

const card = (name: string) => screen.getByRole('region', { name });
const summary = (name: string) =>
  within(card(name)).getByRole('group', { name: 'Resumen del área' });
const datums = (name: string) => within(summary(name)).getAllByTestId('area-summary-datum');
// Each datum as "label: value", in the order of the screen.
const data = (name: string) =>
  datums(name).map(
    (datum) =>
      `${datum.querySelector('dt')!.textContent}: ${datum
        .querySelector('dd')!
        .textContent!.replace(/\s+/g, ' ')}`,
  );
const parts = (name: string) =>
  [...within(summary(name)).getByTestId('outcome-bar').children].map((part) => ({
    part: part.getAttribute('data-part'),
    width: (part as HTMLElement).style.width,
  }));

describe('the area summary in the area header', () => {
  test('the four data of the whole area, with its label, between the name and the strip', () => {
    renderSection();

    const group = summary('Ventas');
    expect(within(group).getByText('Resumen del área')).toHaveClass(
      'text-xs',
      'uppercase',
      'font-bold',
    );
    expect(data('Ventas')).toEqual([
      'completadas: 8(57,1 %)',
      'en curso: 4',
      'abandonadas: 2',
      'Tiempo medio: 12 min 30 s',
    ]);
    // Under the name and its counts, over the strip of the procedures.
    const header = card('Ventas').querySelector('header')!;
    const strip = within(card('Ventas')).getByText('Procedimientos · tocá uno para abrirlo');
    expect(header.compareDocumentPosition(group)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(group.compareDocumentPosition(strip)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(group).toHaveClass('bg-blanco', 'px-6', 'pb-5');
  });

  test('the number in bold 22 px with its label of 13 px in the soft color under it', () => {
    renderSection();

    const [completed] = datums('Ventas');
    expect(completed.querySelector('dd')).toHaveClass('text-[22px]', 'font-bold');
    expect(completed.querySelector('dt')).toHaveClass('text-[13px]', 'text-texto-suave');
    // The label goes first for a screen reader and is drawn under the number.
    expect(completed).toHaveClass('flex-col-reverse');
    expect(within(completed).getByText('(57,1 %)')).toHaveClass('text-[13px]', 'text-texto-suave');
  });

  test('the time with the smallest unit that fits: hours and minutes', () => {
    renderSection();

    expect(data('Logística')).toEqual([
      'completadas: 5(100,0 %)',
      'en curso: 0',
      'abandonadas: 0',
      'Tiempo medio: 1 h 10 min',
    ]);
  });

  test('without completed executions: "—" and "Sin completadas todavía"', () => {
    renderSection();

    expect(data('Depósito')).toEqual([
      'completadas: 0(0,0 %)',
      'en curso: 2',
      'abandonada: 1',
      'Sin completadas todavía: —',
    ]);
  });

  test('more than 0 abandoned: the alert color, a dot and the words, never only color', () => {
    renderSection();

    const abandoned = datums('Ventas')[2];
    // The words say it: "abandonadas" and its number (the label first in the DOM).
    expect(abandoned).toHaveTextContent(/^abandonadas2$/);
    expect(abandoned.querySelector('dd')).toHaveClass('text-durazno-texto');
    expect(abandoned.querySelector('dt')).toHaveClass('text-durazno-texto');
    expect(within(abandoned).getByTestId('abandoned-dot')).toHaveAttribute('aria-hidden', 'true');

    // With 0, the usual: no dot and no alert color.
    const none = datums('Logística')[2];
    expect(within(none).queryByTestId('abandoned-dot')).not.toBeInTheDocument();
    expect(none.querySelector('dd')).not.toHaveClass('text-durazno-texto');
  });

  test('the bar: completed, in progress and abandoned of their share, decorative', () => {
    renderSection();

    const bar = within(summary('Ventas')).getByTestId('outcome-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar).toHaveClass('h-2', 'rounded-[4px]', 'w-full');
    expect(parts('Ventas')).toEqual([
      { part: 'completed', width: `${(8 / 14) * 100}%` },
      { part: 'inProgress', width: `${(4 / 14) * 100}%` },
      { part: 'abandoned', width: `${(2 / 14) * 100}%` },
    ]);
    const fills = [...bar.children].map((part) => part.className);
    expect(fills[0]).toContain('bg-[#1B9B5B]');
    expect(fills[1]).toContain('bg-azul-borrador');
    expect(fills[2]).toContain('bg-[#B4C0CC]');
  });

  test('a part in 0 is not drawn, and without executions there is no bar', () => {
    renderSection();

    expect(parts('Depósito').map(({ part }) => part)).toEqual(['inProgress', 'abandoned']);
    expect(parts('Logística').map(({ part }) => part)).toEqual(['completed']);
    expect(within(summary('Calidad')).queryByTestId('outcome-bar')).not.toBeInTheDocument();
    // Nor a percent of nothing.
    expect(data('Calidad')[0]).toBe('completadas: 0');
  });

  test('on a phone the four data go 2 × 2, in a row of four from lg', () => {
    renderSection();

    const list = within(summary('Ventas')).getByTestId('area-summary-data');
    expect(list).toHaveClass('grid', 'grid-cols-2', 'lg:grid-cols-4');
    // The thin line goes before the second of each row on the phone and before every one but the
    // first from lg; min-w-0 so nothing pushes the page sideways.
    for (const datum of datums('Ventas')) {
      expect(datum).toHaveClass('min-w-0', 'max-lg:even:border-l', 'lg:first:border-l-0');
      expect(datum.className).toContain('border-[#EEF0EC]');
    }
  });

  test('with the filter on an area of one procedure, the summary still shows', () => {
    renderSection(PROCEDURES, LOGISTICA);

    expect(within(card('Logística')).getAllByRole('article')).toHaveLength(1);
    expect(data('Logística')[3]).toBe('Tiempo medio: 1 h 10 min');
  });

  test('the leaf still opens and closes every procedure, and the summary stays', async () => {
    const user = userEvent.setup();
    renderSection();

    const leaf = within(card('Ventas')).getByRole('button', {
      name: 'Ver resumen de todos los procedimientos de esta área',
    });
    const expanded = () =>
      within(card('Ventas'))
        .getAllByRole('article')
        .map((article) => within(article).getAllByRole('button')[0].getAttribute('aria-expanded'));

    expect(expanded()).toEqual(['true', 'false']);
    await user.click(leaf);
    expect(expanded()).toEqual(['true', 'true']);
    expect(leaf).toHaveAttribute('aria-expanded', 'true');
    expect(leaf).toHaveAccessibleName('Ocultar el resumen de todos los procedimientos de esta área');
    expect(summary('Ventas')).toBeVisible();

    await user.click(leaf);
    expect(expanded()).toEqual(['false', 'false']);
    expect(leaf).toHaveAttribute('aria-expanded', 'false');
    expect(summary('Ventas')).toBeVisible();
  });
});
