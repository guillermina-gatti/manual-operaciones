// Spec 003 (R15): la lista "Archivados", solo para el ADMIN.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ArchivedList } from '@/components/documents/ArchivedList';
import { ApiError } from '@/lib/api';
import type { DocumentListResponse, DocumentSummary } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { referencesOf } from '../../support/documents';

const mocks = vi.hoisted(() => ({
  listArchivedDocuments: vi.fn(),
  useSession: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listArchivedDocuments: mocks.listArchivedDocuments,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: vi.fn().mockResolvedValue([]) },
  usersDirectory: { getNames: vi.fn().mockResolvedValue({}), listOwnerCandidates: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const ADMIN: SessionState = {
  user: { id: ADMIN_ID, name: 'Ana Admin', role: 'ADMIN' },
  status: 'ready',
};

function doc(n: number): DocumentSummary {
  return {
    id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
    title: `Archivado ${n}`,
    description: null,
    status: 'ARCHIVED',
    areaIds: [VENTAS],
    ownerId: ADMIN_ID,
    ...referencesOf(ADMIN_ID, [VENTAS]),
    reviewDate: '2027-01-15',
    createdById: ADMIN_ID,
    createdAt: '2026-10-23T15:00:00.000Z',
    currentVersion: {
      id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
      versionNumber: 1,
      originalFileName: `archivado-${n}.pdf`,
      mimeType: 'application/pdf',
      processingStatus: 'READY',
    },
  };
}

const response = (data: DocumentSummary[], total = data.length, page = 1): DocumentListResponse => ({
  data,
  total,
  page,
  limit: 20,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(ADMIN);
});

describe('ArchivedList (R15)', () => {
  test('las tarjetas en el orden de la API, marcadas como "Archivado"', async () => {
    mocks.listArchivedDocuments.mockResolvedValue(response([doc(1), doc(2)]));
    render(<ArchivedList />);

    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual([
      'Archivado 1',
      'Archivado 2',
    ]);
    expect(within(cards[0]).getByText('Archivado')).toBeInTheDocument();
    expect(mocks.listArchivedDocuments).toHaveBeenCalledWith(1, 20, expect.any(AbortSignal));
  });

  test('sin archivados, el estado vacío', async () => {
    mocks.listArchivedDocuments.mockResolvedValue(response([]));
    render(<ArchivedList />);

    expect(await screen.findByText('No hay documentos archivados')).toBeInTheDocument();
  });

  test('pide la página de ?pagina= y muestra la paginación con más de 20', async () => {
    mocks.searchParams = new URLSearchParams('pagina=2');
    mocks.listArchivedDocuments.mockResolvedValue(response([doc(21)], 21, 2));
    render(<ArchivedList />);

    await screen.findAllByRole('article');
    expect(mocks.listArchivedDocuments).toHaveBeenCalledWith(2, 20, expect.any(AbortSignal));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  test('una página que no existe ofrece volver a la primera', async () => {
    mocks.searchParams = new URLSearchParams('pagina=9');
    mocks.listArchivedDocuments.mockResolvedValue(response([], 3, 9));
    render(<ArchivedList />);

    expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la primera página' })).toHaveAttribute(
      'href',
      '/documentos/archivados',
    );
  });

  test('si la API falla, el error con "Reintentar"', async () => {
    mocks.listArchivedDocuments.mockRejectedValue(new ApiError(503, ['Service Unavailable']));
    render(<ArchivedList />);

    expect(await screen.findByRole('button', { name: /Reintentar|Probar de nuevo/ })).toBeInTheDocument();
  });
});
