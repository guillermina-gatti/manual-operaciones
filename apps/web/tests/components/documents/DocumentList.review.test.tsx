// Spec 005 (T20; F2): el acceso a "Por revisar" en Documentos, con y sin búsqueda. Aparte de
// DocumentList.test.tsx y DocumentList.search.test.tsx, para no cambiar sus mocks.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentList } from '@/components/documents/DocumentList';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  searchDocuments: vi.fn(),
  listPendingReview: vi.fn(),
  useSession: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listDocuments: mocks.listDocuments,
  searchDocuments: mocks.searchDocuments,
  listPendingReview: mocks.listPendingReview,
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
  useRouter: () => ({ push: vi.fn() }),
}));

const EMPLOYEE: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};
const empty = { data: [], total: 0, page: 1, limit: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(EMPLOYEE);
  mocks.listDocuments.mockResolvedValue(empty);
  mocks.searchDocuments.mockResolvedValue(empty);
  mocks.listPendingReview.mockResolvedValue({ ...empty, total: 2, limit: 1, isReviewer: true });
});

describe('acceso a "Por revisar" en Documentos (F2)', () => {
  test('en el listado, para una responsable', async () => {
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: 'Por revisar: 2 documentos' })).toBeInTheDocument();
  });

  test('también con una búsqueda activa', async () => {
    mocks.searchParams = new URLSearchParams('q=caja');
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: 'Por revisar: 2 documentos' })).toBeInTheDocument();
    expect(mocks.searchDocuments).toHaveBeenCalled();
  });

  test('E5: quien no es responsable de nada no lo ve', async () => {
    mocks.listPendingReview.mockResolvedValue({ ...empty, limit: 1, isReviewer: false });
    render(<DocumentList />);

    await screen.findByText('Todavía no hay documentos en tus áreas');
    expect(screen.queryByRole('link', { name: /Por revisar/ })).not.toBeInTheDocument();
  });
});
