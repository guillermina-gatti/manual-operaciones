import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DocumentSearchResult } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { DocumentList } from '@/components/documents/DocumentList';

// Spec 004 (T15; F1, F2, F3, F6; D11). Aparte de DocumentList.test.tsx, para no cambiar sus mocks.
const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  searchDocuments: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listDocuments: mocks.listDocuments,
  searchDocuments: mocks.searchDocuments,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
  usersDirectory: { getNames: mocks.getNames, listOwnerCandidates: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ push: mocks.push }),
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const SERGIO = '0b000000-0000-4000-8000-000000000002';

const session = (role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'): SessionState => ({
  user: { id: `0b000000-0000-4000-8000-00000000000${role.length}`, name: role, role },
  status: 'ready',
});

const RESULT: DocumentSearchResult = {
  id: '11111111-1111-4111-8111-000000000001',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [VENTAS],
  ownerId: SERGIO,
  reviewDate: '2027-03-01',
  createdById: SERGIO,
  createdAt: '2026-10-23T15:00:00.000Z',
  archivedAt: null,
  currentVersion: {
    id: '22222222-2222-4222-8222-000000000001',
    versionNumber: 1,
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    processingStatus: 'READY',
  },
  fragment: { parts: [{ text: 'caja', match: true }], pageNumber: null },
};

const box = () => screen.getByRole('searchbox', { name: 'Buscar documentos' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(session('EMPLOYEE'));
  mocks.listDocuments.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
  mocks.searchDocuments.mockResolvedValue({ data: [RESULT], total: 1, page: 1, limit: 20 });
  mocks.listAreas.mockResolvedValue([{ id: VENTAS, name: 'Ventas' }]);
  mocks.getNames.mockResolvedValue({ [SERGIO]: 'Sergio Supervisor de Ventas' });
});

describe('DocumentList con búsqueda (spec 004)', () => {
  test('con ?q=caja busca y no pide el listado', async () => {
    mocks.searchParams = new URLSearchParams('q=caja');

    render(<DocumentList />);

    expect(await screen.findByText('Manual de caja')).toBeInTheDocument();
    expect(mocks.searchDocuments).toHaveBeenCalledWith('caja', 1, expect.any(AbortSignal));
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  test('F3: con ?q=caja&pagina=2 pide la página 2 de la búsqueda', async () => {
    mocks.searchParams = new URLSearchParams('q=caja&pagina=2');

    render(<DocumentList />);

    await screen.findByText('Manual de caja');
    expect(mocks.searchDocuments).toHaveBeenCalledWith('caja', 2, expect.any(AbortSignal));
  });

  test('E13: al montarse de nuevo con ?q=caja (recargar), vuelve a pedir la misma búsqueda', async () => {
    mocks.searchParams = new URLSearchParams('q=caja');
    const { unmount } = render(<DocumentList />);
    await screen.findByText('Manual de caja');
    unmount();

    render(<DocumentList />);

    expect(await screen.findByText('Manual de caja')).toBeInTheDocument();
    expect(mocks.searchDocuments).toHaveBeenCalledTimes(2);
    expect(box()).toHaveValue('caja');
  });

  test('F2: con ?q=ca no busca, avisa en la caja y muestra el listado', async () => {
    mocks.searchParams = new URLSearchParams('q=ca');

    render(<DocumentList />);

    expect(screen.getByRole('alert')).toHaveTextContent('al menos 3 caracteres');
    expect(await screen.findByText('Todavía no hay documentos en tus áreas')).toBeInTheDocument();
    expect(mocks.searchDocuments).not.toHaveBeenCalled();
    expect(mocks.listDocuments).toHaveBeenCalled();
  });

  test('sin q, el listado de siempre y la caja vacía', async () => {
    render(<DocumentList />);

    expect(await screen.findByText('Todavía no hay documentos en tus áreas')).toBeInTheDocument();
    expect(box()).toHaveValue('');
    expect(mocks.searchDocuments).not.toHaveBeenCalled();
  });

  test.each(['EMPLOYEE', 'SUPERVISOR', 'ADMIN'] as const)('F1: %s ve la caja', (role) => {
    mocks.useSession.mockReturnValue(session(role));

    render(<DocumentList />);

    expect(box()).toBeInTheDocument();
  });

  test('con una búsqueda, solo el ADMIN ve "Cargar documento"', async () => {
    mocks.searchParams = new URLSearchParams('q=caja');
    mocks.useSession.mockReturnValue(session('ADMIN'));
    const { unmount } = render(<DocumentList />);
    expect(await screen.findByRole('link', { name: 'Cargar documento' })).toBeInTheDocument();
    unmount();

    mocks.useSession.mockReturnValue(session('EMPLOYEE'));
    render(<DocumentList />);
    await screen.findByText('Manual de caja');
    expect(screen.queryByRole('link', { name: 'Cargar documento' })).not.toBeInTheDocument();
  });

  test('al cambiar q en la dirección (atrás o adelante), la caja muestra el valor nuevo', async () => {
    mocks.searchParams = new URLSearchParams('q=caja');
    const { rerender } = render(<DocumentList />);
    expect(box()).toHaveValue('caja');

    mocks.searchParams = new URLSearchParams('q=stock');
    rerender(<DocumentList />);

    expect(box()).toHaveValue('stock');
    await screen.findByText('Manual de caja');
    expect(mocks.searchDocuments).toHaveBeenLastCalledWith('stock', 1, expect.any(AbortSignal));
  });
});
