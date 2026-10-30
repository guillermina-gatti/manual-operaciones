// Spec 005 (T22; F3, R5, D9): la lista "Por revisar".
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PendingReviewList } from '@/components/documents/PendingReviewList';
import { ApiError } from '@/lib/api';
import type { DocumentSummary, PendingReviewResponse, ReviewStatus } from '@/lib/api';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  listPendingReview: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listPendingReview: mocks.listPendingReview,
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
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const ELENA = '0b000000-0000-4000-8000-000000000003';
const EMPLOYEE: SessionState = {
  user: { id: ELENA, name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};

function doc(n: number, reviewDate: string, status: ReviewStatus): DocumentSummary {
  return {
    id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
    title: `Documento ${n}`,
    description: null,
    status: 'ACTIVE',
    areaIds: [VENTAS],
    ownerId: ELENA,
    reviewDate,
    createdById: ELENA,
    createdAt: '2026-10-23T15:00:00.000Z',
    review: { status, lastReviewedAt: null, lastReviewedById: null },
    currentVersion: {
      id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
      versionNumber: 1,
      originalFileName: `documento-${n}.pdf`,
      mimeType: 'application/pdf',
      processingStatus: 'READY',
    },
  };
}

const response = (data: DocumentSummary[], total = data.length, page = 1): PendingReviewResponse => ({
  data,
  total,
  page,
  limit: 20,
  isReviewer: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(EMPLOYEE);
  mocks.listAreas.mockResolvedValue([{ id: VENTAS, name: 'Ventas' }]);
  mocks.getNames.mockResolvedValue({ [ELENA]: 'Elena Empleada de Ventas' });
});

describe('PendingReviewList (F3)', () => {
  test('E6: las tarjetas en el orden de la API, con su etiqueta y la fecha de revisión', async () => {
    mocks.listPendingReview.mockResolvedValue(
      response([doc(1, '2026-11-04', 'OVERDUE'), doc(2, '2026-11-19', 'DUE_SOON')]),
    );
    render(<PendingReviewList />);

    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual([
      'Documento 1',
      'Documento 2',
    ]);
    expect(within(cards[0]).getByText('Vencido')).toBeInTheDocument();
    expect(within(cards[0]).getByText('04/11/2026')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Vence pronto')).toBeInTheDocument();
    expect(mocks.listPendingReview).toHaveBeenCalledWith(1, 20, expect.any(AbortSignal));
  });

  test('E13: sin pendientes → "No tenés documentos para revisar"', async () => {
    mocks.listPendingReview.mockResolvedValue(response([]));
    render(<PendingReviewList />);

    expect(await screen.findByText('No tenés documentos para revisar')).toBeInTheDocument();
  });

  test('?pagina=2 pide la página 2; con más de 20, la paginación apunta a "Por revisar"', async () => {
    mocks.searchParams = new URLSearchParams('pagina=2');
    mocks.listPendingReview.mockResolvedValue(
      response([doc(21, '2026-11-21', 'DUE_SOON')], 25, 2),
    );
    render(<PendingReviewList />);

    await screen.findAllByRole('article');
    expect(mocks.listPendingReview).toHaveBeenCalledWith(2, 20, expect.any(AbortSignal));
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/documentos/por-revisar',
    );
  });

  test('una página que no existe → "Esta página no existe" con enlace a la primera', async () => {
    mocks.searchParams = new URLSearchParams('pagina=9');
    mocks.listPendingReview.mockResolvedValue(response([], 3, 9));
    render(<PendingReviewList />);

    expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la primera página' })).toHaveAttribute(
      'href',
      '/documentos/por-revisar',
    );
  });

  test('503 → mensaje y "Reintentar", que vuelve a pedir', async () => {
    mocks.listPendingReview.mockRejectedValueOnce(new ApiError(503));
    mocks.listPendingReview.mockResolvedValueOnce(response([doc(1, '2026-11-04', 'OVERDUE')]));
    render(<PendingReviewList />);

    expect(
      await screen.findByText('El servicio no está disponible. Probá de nuevo en unos minutos.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByRole('article')).toHaveLength(1);
  });
});
