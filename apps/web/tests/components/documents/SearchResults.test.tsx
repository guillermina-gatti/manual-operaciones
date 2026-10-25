import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DocumentSearchResponse, DocumentSearchResult, SearchFragment } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { SearchResults } from '@/components/documents/SearchResults';

const mocks = vi.hoisted(() => ({
  searchDocuments: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  searchDocuments: mocks.searchDocuments,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
  usersDirectory: { getNames: mocks.getNames, listOwnerCandidates: vi.fn() },
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const SERGIO = '0b000000-0000-4000-8000-000000000002';
const USER_ID = '0b000000-0000-4000-8000-000000000003';

const FRAGMENT: SearchFragment = {
  parts: [
    { text: 'se hace el ', match: false },
    { text: 'cierre', match: true },
    { text: ' de ', match: false },
    { text: 'caja', match: true },
  ],
  pageNumber: 4,
};

function result(n: number, fragment: SearchFragment | null = null): DocumentSearchResult {
  return {
    id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
    title: `Documento ${n}`,
    description: null,
    status: 'ACTIVE',
    areaIds: [VENTAS],
    ownerId: SERGIO,
    reviewDate: '2027-03-01',
    createdById: SERGIO,
    createdAt: '2026-10-23T15:00:00.000Z',
    archivedAt: null,
    currentVersion: {
      id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
      versionNumber: 1,
      originalFileName: `documento-${n}.pdf`,
      mimeType: 'application/pdf',
      processingStatus: 'READY',
    },
    fragment,
  };
}

const response = (
  data: DocumentSearchResult[],
  total = data.length,
  page = 1,
): DocumentSearchResponse => ({ data, total, page, limit: 20 });

function renderResults(query = 'caja', page = 1) {
  return render(<SearchResults query={query} page={page} userId={USER_ID} isAdmin={false} />);
}

const cardTitles = async () =>
  (await screen.findAllByRole('article')).map(
    (card) => within(card).getAllByRole('link')[0].textContent,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchDocuments.mockResolvedValue(response([result(1, FRAGMENT)]));
  mocks.listAreas.mockResolvedValue([{ id: VENTAS, name: 'Ventas' }]);
  mocks.getNames.mockResolvedValue({ [SERGIO]: 'Sergio Supervisor de Ventas' });
});

describe('SearchResults (spec 004, F4, F5)', () => {
  test('mientras espera muestra "Buscando…"', () => {
    mocks.searchDocuments.mockReturnValue(new Promise(() => {}));

    renderResults();

    expect(screen.getByRole('status')).toHaveTextContent('Buscando…');
  });

  test('pide la búsqueda con el texto y la página', async () => {
    renderResults('cierre de caja', 2);

    await screen.findAllByRole('article');
    expect(mocks.searchDocuments).toHaveBeenCalledWith('cierre de caja', 2, expect.any(AbortSignal));
  });

  test('E1: la tarjeta trae el fragmento resaltado y "Página 4"', async () => {
    renderResults('cierre de caja');

    const [card] = await screen.findAllByRole('article');
    expect(within(card).getByText('Documento 1')).toBeInTheDocument();
    expect([...card.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'cierre',
      'caja',
    ]);
    expect(within(card).getByText('Página 4')).toBeInTheDocument();
  });

  test('E2: un resultado por título no tiene fragmento ni página', async () => {
    mocks.searchDocuments.mockResolvedValue(response([result(1)]));

    renderResults('facturación');

    const [card] = await screen.findAllByRole('article');
    expect(card.querySelector('mark')).toBeNull();
    expect(within(card).queryByText(/Página/)).not.toBeInTheDocument();
  });

  test('R9: muestra los resultados en el orden de la API', async () => {
    mocks.searchDocuments.mockResolvedValue(response([result(3), result(1), result(2)]));

    renderResults();

    expect(await cardTitles()).toEqual(['Documento 3', 'Documento 1', 'Documento 2']);
  });

  test('anuncia cuántos resultados hay para el texto', async () => {
    mocks.searchDocuments.mockResolvedValue(response([result(1), result(2), result(3)]));

    renderResults('caja');

    const summary = await screen.findByText('3 resultados para «caja»');
    expect(summary).toHaveAttribute('aria-live', 'polite');
  });

  test('con un solo resultado dice "1 resultado"', async () => {
    renderResults('caja');

    expect(await screen.findByText('1 resultado para «caja»')).toBeInTheDocument();
  });

  test('E11 y F5: sin resultados, el mensaje con el texto y "Borrar búsqueda"', async () => {
    mocks.searchDocuments.mockResolvedValue(response([]));

    renderResults('xyzxyz');

    expect(
      await screen.findByText('No encontramos documentos para «xyzxyz»'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Borrar búsqueda' })).toHaveAttribute(
      'href',
      '/documentos',
    );
  });

  test('R11: el texto buscado se muestra como texto, no como HTML', async () => {
    mocks.searchDocuments.mockResolvedValue(response([]));

    const { container } = renderResults('<b>caja</b>');

    expect(
      await screen.findByText('No encontramos documentos para «<b>caja</b>»'),
    ).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  test('error 503: mensaje y "Reintentar", que vuelve a pedir', async () => {
    mocks.searchDocuments.mockRejectedValueOnce(new ApiError(503));

    renderResults();

    expect(
      await screen.findByText('El servicio no está disponible. Probá de nuevo en unos minutos.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByRole('article')).toHaveLength(1);
    expect(mocks.searchDocuments).toHaveBeenCalledTimes(2);
  });

  test('una página que no existe ofrece volver a la primera página de la búsqueda', async () => {
    mocks.searchDocuments.mockResolvedValue(response([], 3, 9));

    renderResults('caja', 9);

    expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la primera página' })).toHaveAttribute(
      'href',
      '/documentos?q=caja',
    );
  });

  test('R10: con más de 20 resultados, la paginación conserva la búsqueda', async () => {
    mocks.searchDocuments.mockResolvedValue(
      response(Array.from({ length: 20 }, (_, i) => result(i + 1)), 45),
    );

    renderResults('caja');

    await screen.findAllByRole('article');
    expect(screen.getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/documentos?q=caja&pagina=2',
    );
  });
});
