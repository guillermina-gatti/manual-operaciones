import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DocumentMetricsCard } from '@/components/metrics/DocumentMetricsCard';
import { ApiError } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import type { DocumentMetrics } from '@/lib/metrics';
import type { PanelFilters } from '@/lib/metrics/filters';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const FILTERS: PanelFilters = { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' };
const DOCUMENTS: DocumentMetrics = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
  totals: { active: 1284, upToDate: 1200, dueSoon: 80, overdue: 4, processingFailed: 2, uploaded: 9 },
};

const success = (data: DocumentMetrics | null): ApiResource<DocumentMetrics | null> => ({
  status: 'success',
  data,
  error: null,
  reload: vi.fn(),
});
const failure = (error: unknown, reload = vi.fn()): ApiResource<DocumentMetrics | null> => ({
  status: 'error',
  data: undefined,
  error,
  reload,
});

const card = () => screen.getByRole('region', { name: 'Documentos' });
const tiles = () => [...card().querySelectorAll('dl > div')] as HTMLElement[];
const tile = (label: string) =>
  within(card()).getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
const value = (label: string) => within(card()).getByText(label, { selector: 'dt' }).nextSibling;

describe('DocumentMetricsCard', () => {
  test('shows the loading state while the metrics arrive', () => {
    render(
      <DocumentMetricsCard
        filters={FILTERS}
        state={{ status: 'loading', data: undefined, error: null, reload: vi.fn() }}
      />,
    );

    expect(screen.getByText('Cargando las métricas de documentos…')).toBeInTheDocument();
  });

  test('six tiles: the current state and the documents uploaded in the period', () => {
    render(<DocumentMetricsCard filters={FILTERS} state={success(DOCUMENTS)} />);

    expect(within(card()).getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Activos',
      'Al día',
      'Vencen pronto',
      'Vencidos',
      'Con error de procesamiento',
      'Cargados en el período',
    ]);
    expect(value('Activos')).toHaveTextContent('1.284');
    expect(value('Al día')).toHaveTextContent('1.200');
    expect(value('Vencen pronto')).toHaveTextContent('80');
    expect(value('Vencidos')).toHaveTextContent('4');
    expect(value('Con error de procesamiento')).toHaveTextContent(/^2/);
    // Under the uploaded ones, the dates they count.
    expect(value('Cargados en el período')).toHaveTextContent('91 oct – 27 oct');
  });

  test('a grid of 6 columns, 3 on a tablet and 2 on a phone', () => {
    render(<DocumentMetricsCard filters={FILTERS} state={success(DOCUMENTS)} />);

    expect(card().querySelector('dl')).toHaveClass(
      'grid-cols-2',
      'sm:grid-cols-3',
      'lg:grid-cols-6',
    );
    expect(tiles()).toHaveLength(6);
  });

  test('each tile with the stripe of its state, the same colors as /documentos', () => {
    render(<DocumentMetricsCard filters={FILTERS} state={success(DOCUMENTS)} />);

    const stripe = (label: string) => tile(label).querySelector('[data-testid="tile-stripe"]');
    expect(stripe('Activos')).toHaveClass('bg-bosque');
    expect(stripe('Al día')).toHaveClass('bg-exito');
    expect(stripe('Vencen pronto')).toHaveClass('bg-naranja');
    expect(stripe('Vencidos')).toHaveClass('bg-peligro');
    expect(stripe('Con error de procesamiento')).toHaveClass('bg-peligro');
    expect(stripe('Cargados en el período')).toHaveClass('bg-bosque');
    expect(stripe('Activos')).toHaveAttribute('aria-hidden', 'true');
  });

  test('with processing errors, "Revisar" and no link; without them, no tag', () => {
    const { unmount } = render(<DocumentMetricsCard filters={FILTERS} state={success(DOCUMENTS)} />);
    expect(within(tile('Con error de procesamiento')).getByText('Revisar')).toBeInTheDocument();
    expect(within(card()).queryByRole('link')).not.toBeInTheDocument();
    unmount();

    render(
      <DocumentMetricsCard
        filters={FILTERS}
        state={success({ ...DOCUMENTS, totals: { ...DOCUMENTS.totals, processingFailed: 0 } })}
      />,
    );
    expect(within(card()).queryByText('Revisar')).not.toBeInTheDocument();
  });

  test('says the totals are the current state and the dates only change «Cargados»', () => {
    render(<DocumentMetricsCard filters={FILTERS} state={success(DOCUMENTS)} />);

    expect(
      within(card()).getByText(
        'Muestra el estado actual de los documentos activos. Las fechas solo cambian «Cargados en el período».',
      ),
    ).toBeInTheDocument();
  });

  test('zeros are shown as 0, never as "—"', () => {
    const zeros: DocumentMetrics = {
      ...DOCUMENTS,
      totals: { active: 0, upToDate: 0, dueSoon: 0, overdue: 0, processingFailed: 0, uploaded: 0 },
    };
    render(<DocumentMetricsCard filters={FILTERS} state={success(zeros)} />);

    const values = within(card()).getAllByRole('definition').map((dd) => dd.textContent);
    expect(values).toEqual(['0', '0', '0', '0', '0', '01 oct – 27 oct']);
    expect(card().textContent).not.toContain('—');
  });

  test('without metrics says they are not available, without numbers', () => {
    render(<DocumentMetricsCard filters={FILTERS} state={success(null)} />);

    expect(within(card()).getByText('Todavía no disponible.')).toBeInTheDocument();
    expect(within(card()).queryByRole('definition')).not.toBeInTheDocument();
  });

  describe('errors, like the procedures ones', () => {
    test('401: the session is not valid, without retry', () => {
      render(<DocumentMetricsCard filters={FILTERS} state={failure(new ApiError(401))} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(
        'Tu sesión no es válida. Volvé a ingresar.',
      );
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    });

    test('403: only admins and supervisors, without retry', () => {
      render(<DocumentMetricsCard filters={FILTERS} state={failure(new ApiError(403))} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(
        'Solo los administradores y los supervisores pueden ver las métricas.',
      );
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    });

    test('404: an area of someone else offers to see all of theirs', () => {
      render(<DocumentMetricsCard filters={FILTERS} state={failure(new ApiError(404))} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(
        'No tenés acceso a las métricas de esa área.',
      );
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ver todas mis áreas' })).toHaveAttribute(
        'href',
        '/metricas?desde=2026-10-01&hasta=2026-10-27',
      );
    });

    test('503: the service is down, and retrying asks again', async () => {
      const user = userEvent.setup();
      const reload = vi.fn();
      render(<DocumentMetricsCard filters={FILTERS} state={failure(new ApiError(503), reload)} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(/El servicio no está disponible/);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
