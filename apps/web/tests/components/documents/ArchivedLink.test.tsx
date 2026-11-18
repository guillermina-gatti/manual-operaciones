// Spec 003 (R15): el acceso a "Archivados", con la cantidad.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ArchivedLink } from '@/components/documents/ArchivedLink';
import { ApiError } from '@/lib/api';

const mocks = vi.hoisted(() => ({ listArchivedDocuments: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listArchivedDocuments: mocks.listArchivedDocuments,
}));

const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const counts = (total: number) => ({ data: [], total, page: 1, limit: 1 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ArchivedLink (R15)', () => {
  test('"Archivados (2)", con su nombre accesible y el enlace', async () => {
    mocks.listArchivedDocuments.mockResolvedValue(counts(2));
    render(<ArchivedLink userId={ADMIN_ID} />);

    const link = await screen.findByRole('link', { name: 'Archivados: 2 documentos' });
    expect(link).toHaveTextContent('Archivados (2)');
    expect(link).toHaveAttribute('href', '/documentos/archivados');
  });

  test('pide solo la cantidad: página 1 con limit=1', async () => {
    mocks.listArchivedDocuments.mockResolvedValue(counts(1));
    render(<ArchivedLink userId={ADMIN_ID} />);

    expect(await screen.findByRole('link', { name: 'Archivados: 1 documento' })).toHaveTextContent(
      'Archivados (1)',
    );
    expect(mocks.listArchivedDocuments).toHaveBeenCalledWith(1, 1, expect.any(AbortSignal));
  });

  test('sin archivados, "Archivados (0)"', async () => {
    mocks.listArchivedDocuments.mockResolvedValue(counts(0));
    render(<ArchivedLink userId={ADMIN_ID} />);

    expect(await screen.findByRole('link', { name: 'Archivados: ningún documento' })).toHaveTextContent(
      'Archivados (0)',
    );
  });

  test('mientras carga, nada', () => {
    mocks.listArchivedDocuments.mockReturnValue(new Promise(() => undefined));
    render(<ArchivedLink userId={ADMIN_ID} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('si falla, "Archivados" sin número', async () => {
    mocks.listArchivedDocuments.mockRejectedValue(new ApiError(503, ['Service Unavailable']));
    render(<ArchivedLink userId={ADMIN_ID} />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Archivados' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Archivados' })).toHaveTextContent(/^Archivados$/);
  });
});
