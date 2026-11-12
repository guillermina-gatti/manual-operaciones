// Spec 011 (T12; F5, D11): el acceso a "Alertas" en Documentos, solo para el ADMIN. Aparte de los otros
// tests de DocumentList, para no cambiar sus mocks.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentList } from '@/components/documents/DocumentList';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  listPendingReview: vi.fn(),
  listConflictAlerts: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listDocuments: mocks.listDocuments,
  listPendingReview: mocks.listPendingReview,
  listConflictAlerts: mocks.listConflictAlerts,
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
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

const session = (role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'): SessionState => ({
  user: { id: `user-${role}`, name: `Usuario ${role}`, role },
  status: 'ready',
});
const empty = { data: [], total: 0, page: 1, limit: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listDocuments.mockResolvedValue(empty);
  mocks.listPendingReview.mockResolvedValue({ ...empty, limit: 1, isReviewer: true });
  mocks.listConflictAlerts.mockResolvedValue({ data: [], total: 3, openTotal: 3, page: 1, limit: 1 });
});

describe('acceso a "Alertas" en Documentos (F5)', () => {
  test('E11: el ADMIN lo ve, junto a "Por revisar"', async () => {
    mocks.useSession.mockReturnValue(session('ADMIN'));
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: 'Alertas: 3 abiertas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Por revisar/ })).toBeInTheDocument();
  });

  test.each(['SUPERVISOR', 'EMPLOYEE'] as const)('E12: %s no lo ve ni lo pide', async (role) => {
    mocks.useSession.mockReturnValue(session(role));
    render(<DocumentList />);

    await screen.findByRole('link', { name: /Por revisar/ });
    expect(screen.queryByRole('link', { name: /Alertas/ })).not.toBeInTheDocument();
    expect(mocks.listConflictAlerts).not.toHaveBeenCalled();
  });
});
