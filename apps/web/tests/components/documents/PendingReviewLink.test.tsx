import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PendingReviewLink } from '@/components/documents/PendingReviewLink';
import { ApiError } from '@/lib/api';
import type { PendingReviewResponse } from '@/lib/api';

// Spec 005 (T20; F2, D18, D19): el acceso a "Por revisar", con la cantidad.
const mocks = vi.hoisted(() => ({ listPendingReview: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listPendingReview: mocks.listPendingReview,
}));

const USER_ID = '0b000000-0000-4000-8000-000000000003';
const counts = (total: number, isReviewer: boolean): PendingReviewResponse => ({
  data: [],
  total,
  page: 1,
  limit: 1,
  isReviewer,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PendingReviewLink (F2)', () => {
  test('revisor con 3 pendientes → "Por revisar (3)", con su nombre accesible y el enlace', async () => {
    mocks.listPendingReview.mockResolvedValue(counts(3, true));
    render(<PendingReviewLink userId={USER_ID} isAdmin={false} />);

    const link = await screen.findByRole('link', { name: 'Por revisar: 3 documentos' });
    expect(link).toHaveTextContent('Por revisar (3)');
    expect(link).toHaveAttribute('href', '/documentos/por-revisar');
  });

  test('pide solo la cantidad: página 1 con limit=1 (D18)', async () => {
    mocks.listPendingReview.mockResolvedValue(counts(1, true));
    render(<PendingReviewLink userId={USER_ID} isAdmin={false} />);

    await screen.findByRole('link', { name: 'Por revisar: 1 documento' });
    expect(mocks.listPendingReview).toHaveBeenCalledWith(1, 1, expect.any(AbortSignal));
  });

  test('E13: revisor sin pendientes → "Por revisar (0)" (D19)', async () => {
    mocks.listPendingReview.mockResolvedValue(counts(0, true));
    render(<PendingReviewLink userId={USER_ID} isAdmin={false} />);

    expect(
      await screen.findByRole('link', { name: 'Por revisar: ningún documento' }),
    ).toHaveTextContent('Por revisar (0)');
  });

  test('E5: quien no es responsable de nada no lo ve', async () => {
    mocks.listPendingReview.mockResolvedValue(counts(0, false));
    render(<PendingReviewLink userId={USER_ID} isAdmin={false} />);

    await waitFor(() => expect(mocks.listPendingReview).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('mientras carga no muestra nada', () => {
    mocks.listPendingReview.mockReturnValue(new Promise(() => {}));
    render(<PendingReviewLink userId={USER_ID} isAdmin />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('si falla, el ADMIN ve el enlace sin número', async () => {
    mocks.listPendingReview.mockRejectedValue(new ApiError(503));
    render(<PendingReviewLink userId={USER_ID} isAdmin />);

    const link = await screen.findByRole('link', { name: 'Por revisar' });
    expect(link).toHaveTextContent(/^Por revisar$/);
  });

  test('si falla, los demás no ven nada (no se sabe si son responsables)', async () => {
    mocks.listPendingReview.mockRejectedValue(new ApiError(503));
    render(<PendingReviewLink userId={USER_ID} isAdmin={false} />);

    await waitFor(() => expect(mocks.listPendingReview).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
