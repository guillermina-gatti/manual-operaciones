import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MetricsFiltersForm } from '@/components/metrics/MetricsFiltersForm';
import { MetricTiles } from '@/components/metrics/MetricTiles';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const PATH = '/ejecuciones/mi-actividad';
const FILTERS = { areaId: null, from: '2026-10-01', to: '2026-10-27' };
const AREAS = [
  { value: '', label: 'Todas mis áreas' },
  { value: VENTAS, label: 'Ventas' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// The panel tests (MetricsPanel.test.tsx) cover the form on /metricas; these, its reuse.
describe('MetricsFiltersForm on another page', () => {
  const renderForm = () =>
    render(<MetricsFiltersForm filters={FILTERS} areas={AREAS} today="2026-10-27" path={PATH} />);

  test('"Aplicar" goes to that page', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(mocks.push).toHaveBeenCalledWith(`${PATH}?desde=2026-10-01&hasta=2026-10-27`);
  });

  test('an area and a quick period apply on that page', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /Área/ }));
    await user.click(screen.getByRole('option', { name: 'Ventas' }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      `${PATH}?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      `${PATH}?area=${VENTAS}&desde=2026-10-27&hasta=2026-10-27`,
    );
  });

  test('"Limpiar filtros" goes back to that page without filters', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(mocks.push).toHaveBeenCalledWith(PATH);
  });
});

describe('MetricTiles', () => {
  test('each tile is a term with its number and its line', () => {
    render(
      <MetricTiles
        tiles={[
          { label: 'Ejecuciones', icon: null, value: '12', hint: 'en el período elegido' },
          { label: 'Tiempo medio', icon: null, value: '3 min', hint: 'por ejecución', small: true },
        ]}
      />,
    );

    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    expect(terms).toEqual(['Ejecuciones', 'Tiempo medio']);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3 min')).toHaveClass('text-[28px]');
  });
});
