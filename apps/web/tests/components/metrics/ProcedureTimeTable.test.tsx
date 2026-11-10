import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ProcedureTimeTable } from '@/components/metrics/ProcedureTimeTable';
import { CIERRE_DE_CAJA, OPERACIONES, VENTAS, metricsResponse } from '../../support/metrics';

const AREA_NAMES = new Map([
  [VENTAS, 'Ventas'],
  [OPERACIONES, 'Operaciones (inactiva)'],
]);
const UNKNOWN = '5d2f6a10-8c3e-4f3a-9c2b-4f3a9c2b81de';

const table = () => screen.getByRole('table', { name: 'Tiempo por procedimiento' });
const rowTexts = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      [within(row).getByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) =>
        cell.textContent?.replace(/\s/g, ' '),
      ),
    );

describe('ProcedureTimeTable', () => {
  test('one row per procedure, slowest first, with its areas, extremes and slowest step', () => {
    render(
      <ProcedureTimeTable procedures={metricsResponse().procedures} areaNames={AREA_NAMES} />,
    );

    expect(screen.getByRole('heading', { name: 'Tiempo por procedimiento' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cuánto tarda una ejecución completa, de inicio a fin. Ordenado de mayor a menor tiempo medio.',
      ),
    ).toBeInTheDocument();
    expect(rowTexts()).toEqual([
      ['Cierre de cajaVentas', '2', '12 min', '10 min', '14 min', 'Comparar con el reporte · 3 min 20 s'],
      [
        'Recepción de mercaderíaOperaciones (inactiva)',
        '1',
        '5 min',
        '5 min',
        '5 min',
        'Revisar el remito · 3 min',
      ],
    ]);
  });

  test('the columns, with the fastest and the slowest execution', () => {
    render(
      <ProcedureTimeTable procedures={metricsResponse().procedures} areaNames={AREA_NAMES} />,
    );

    const headers = within(table())
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Procedimiento',
      'Completadas',
      'Tiempo medio total',
      'Más rápida',
      'Más lenta',
      'Paso que más tarda',
    ]);
  });

  test('a procedure that is not a sample one shows a distinguishable name, never its id', () => {
    const [cierre] = metricsResponse().procedures;
    render(
      <ProcedureTimeTable
        procedures={[{ ...cierre, procedureId: UNKNOWN }]}
        areaNames={AREA_NAMES}
      />,
    );

    expect(within(table()).getByRole('rowheader')).toHaveTextContent('Procedimiento 2B81DE');
    expect(document.body.textContent).not.toContain(UNKNOWN);
    expect(document.body.textContent).not.toContain(CIERRE_DE_CAJA);
  });

  test('without completed executions the times and the step are "—"', () => {
    const [cierre] = metricsResponse().procedures;
    render(
      <ProcedureTimeTable
        procedures={[
          {
            ...cierre,
            completed: 0,
            avgCompletionMs: null,
            minCompletionMs: null,
            maxCompletionMs: null,
            versions: [{ ...cierre.versions[0], steps: [] }],
          },
        ]}
        areaNames={AREA_NAMES}
      />,
    );

    expect(rowTexts()).toEqual([['Cierre de cajaVentas', '0', '—', '—', '—', '—']]);
  });

  test('without procedures says there are no executions', () => {
    render(<ProcedureTimeTable procedures={[]} areaNames={AREA_NAMES} />);

    expect(screen.getByText('No hay ejecuciones en este período.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
