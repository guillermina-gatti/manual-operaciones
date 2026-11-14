import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ReviewDocumentsLists } from '@/components/metrics/ReviewDocumentsLists';
import type { ApiResource, DocumentSummary } from '@/lib/api';
import { reviewDocument } from '../../support/review-documents';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const TODAY = '2026-11-13';

const success = (data: DocumentSummary[]): ApiResource<DocumentSummary[]> => ({
  status: 'success',
  data,
  error: null,
  reload: vi.fn(),
});

const renderLists = (
  state: ApiResource<DocumentSummary[]>,
  { areaId = null as string | null, onlyOwn = false } = {},
) => render(<ReviewDocumentsLists state={state} areaId={areaId} today={TODAY} onlyOwn={onlyOwn} />);

const list = (name: RegExp) => screen.getByRole('region', { name });
const items = (name: RegExp) =>
  within(list(name))
    .queryAllByRole('listitem')
    .filter((item) => item.closest('ul')!.hidden === false)
    .map((item) => within(item).getByRole('link').textContent);

// Eight due soon, from the 14th on, and two overdue.
const MANY = [
  ...Array.from({ length: 8 }, (_, i) =>
    reviewDocument(i + 1, `Documento ${i + 1}`, [VENTAS], `2026-11-${String(14 + i)}`, 'DUE_SOON'),
  ),
  reviewDocument(20, 'Manual de caja', [VENTAS], '2026-11-08', 'OVERDUE'),
  reviewDocument(21, 'Plan de evacuación', [OPERACIONES], '2026-11-12', 'OVERDUE'),
];

describe('Vencen pronto and Vencidos', () => {
  test('each list with its count in the title, its documents, area, date and link', () => {
    renderLists(success(MANY));

    expect(within(list(/^Vencidos/)).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Vencidos (2)',
    );
    expect(within(list(/^Vencen pronto/)).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Vencen pronto (8)',
    );
    expect(items(/^Vencidos/)).toEqual(['Manual de caja', 'Plan de evacuación']);
    const [first] = within(list(/^Vencidos/)).getAllByRole('listitem');
    expect(within(first).getByRole('link')).toHaveAttribute(
      'href',
      '/documentos/1d000000-0000-4000-8000-000000000020',
    );
    expect(first).toHaveTextContent('Ventas');
    expect(within(first).getByText('venció hace 5 días')).toHaveAttribute('dateTime', '2026-11-08');
    expect(list(/^Vencen pronto/)).toHaveTextContent('vence el 14 nov 2026');
  });

  test('more than five: the five most urgent, and "Ver todos (N)" opens the rest in place', async () => {
    const user = userEvent.setup();
    renderLists(success(MANY));

    expect(items(/^Vencen pronto/)).toEqual([
      'Documento 1',
      'Documento 2',
      'Documento 3',
      'Documento 4',
      'Documento 5',
    ]);
    const more = within(list(/^Vencen pronto/)).getByRole('button', { name: 'Ver todos (8)' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await user.click(more);
    expect(items(/^Vencen pronto/)).toHaveLength(8);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveTextContent('Ver solo los 5 más urgentes');
    // Two of them: no button.
    expect(within(list(/^Vencidos/)).queryByRole('button')).not.toBeInTheDocument();
  });

  test('with 0, a positive "Ninguno por ahora" in each', () => {
    renderLists(success([]));

    expect(list(/^Vencidos/)).toHaveTextContent('Vencidos (0)Ninguno por ahora');
    expect(list(/^Vencen pronto/)).toHaveTextContent('Ninguno por ahora');
  });

  test('the area of the panel', () => {
    renderLists(success(MANY), { areaId: OPERACIONES });

    expect(items(/^Vencidos/)).toEqual(['Plan de evacuación']);
    expect(list(/^Vencen pronto/)).toHaveTextContent('Ninguno por ahora');
  });

  test('loading and error, each list on its own; the error retries', async () => {
    const user = userEvent.setup();
    const { unmount } = renderLists({ status: 'loading', data: undefined, error: null, reload: vi.fn() });
    expect(screen.getAllByRole('status')).toHaveLength(2);
    unmount();

    const reload = vi.fn();
    renderLists({ status: 'error', data: undefined, error: new Error('down'), reload });
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    await user.click(within(list(/^Vencidos/)).getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalled();
  });

  test('not ADMIN: says the lists have only their documents', () => {
    renderLists(success(MANY), { onlyOwn: true });

    expect(
      screen.getByText('En estas listas están solo los documentos de los que sos responsable.'),
    ).toBeInTheDocument();
  });
});
