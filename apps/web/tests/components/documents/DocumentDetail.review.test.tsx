// Los avisos de vencimiento en el detalle (spec 005, T17 y T19). Van aparte de DocumentDetail.test.tsx
// (plan 002) y de DocumentDetail.lifecycle.test.tsx (spec 003), para no cambiar sus mocks.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentDetail } from '@/components/documents/DocumentDetail';
import type { DocumentResponse } from '@/lib/api';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getDownloadUrl: vi.fn(),
  listVersions: vi.fn(),
  markReviewed: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  listOwnerCandidates: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getDocument: mocks.getDocument,
  getDownloadUrl: mocks.getDownloadUrl,
  listVersions: mocks.listVersions,
  markReviewed: mocks.markReviewed,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
  usersDirectory: { getNames: mocks.getNames, listOwnerCandidates: mocks.listOwnerCandidates },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

const ID = '11111111-1111-4111-8111-111111111111';

const session = (user: (typeof FIXTURE_USERS)[keyof typeof FIXTURE_USERS]): SessionState => ({
  user: { id: user.id, name: user.name, role: user.role },
  status: 'ready',
});

// Un documento de Ventas, vencido, cuya responsable es la EMPLOYEE de Ventas.
const OVERDUE: DocumentResponse = {
  id: ID,
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.empleadoVentas.id,
  reviewDate: '2026-11-04',
  createdById: FIXTURE_USERS.admin.id,
  createdAt: '2026-10-20T15:00:00.000Z',
  archivedAt: null,
  review: { status: 'OVERDUE', lastReviewedAt: null, lastReviewedById: null },
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    status: 'CURRENT',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    processingStatus: 'READY',
    createdAt: '2026-10-20T15:00:00.000Z',
  },
};
// Revisado por la responsable el 30/10/2026 a las 22:30 de Buenos Aires (31/10 en UTC).
const REVIEWED: DocumentResponse = {
  ...OVERDUE,
  reviewDate: '2027-05-09',
  review: {
    status: 'UP_TO_DATE',
    lastReviewedAt: '2026-10-31T01:30:00.000Z',
    lastReviewedById: FIXTURE_USERS.empleadoVentas.id,
  },
};
// Lo que recibe quien no es ADMIN ni responsable: sin review (R4).
const WITHOUT_REVIEW: DocumentResponse = { ...OVERDUE };
delete WITHOUT_REVIEW.review;

const areas = createFakeAreasDirectory({ delayMs: 0 });
const users = createFakeUsersDirectory({ delayMs: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue(session(FIXTURE_USERS.admin));
  mocks.getDocument.mockResolvedValue(OVERDUE);
  mocks.listAreas.mockImplementation(() => areas.listAreas());
  mocks.getNames.mockImplementation((ids: string[]) => users.getNames(ids));
  mocks.listVersions.mockResolvedValue({ data: [] });
});

const heading = () => screen.findByRole('heading', { level: 1, name: 'Manual de caja' });

// El valor (dd) que acompaña a una etiqueta (dt) del detalle.
function valueOf(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.nextElementSibling as HTMLElement;
}

describe('etiqueta y última revisión (T17; F1, R11)', () => {
  test('E2: el ADMIN ve "Vencido" junto al título', async () => {
    render(<DocumentDetail />);

    const title = await heading();
    expect(title.parentElement).toHaveTextContent('Vencido');
  });

  test('E8: con una revisión, "Última revisión" muestra la fecha en Buenos Aires y quién la hizo', async () => {
    mocks.getDocument.mockResolvedValue(REVIEWED);
    render(<DocumentDetail />);
    await heading();

    expect(valueOf('Última revisión')).toHaveTextContent(
      '30/10/2026, por Elena Empleada de Ventas',
    );
    expect(screen.queryByText(/Vencido|Vence pronto/)).not.toBeInTheDocument();
  });

  test('nunca revisado: no aparece "Última revisión" (R11)', async () => {
    render(<DocumentDetail />);
    await heading();

    expect(screen.queryByText('Última revisión')).not.toBeInTheDocument();
  });

  test('E5: sin review, ni etiqueta ni "Última revisión"', async () => {
    mocks.useSession.mockReturnValue(session(FIXTURE_USERS.supervisorVentas));
    mocks.getDocument.mockResolvedValue({
      ...WITHOUT_REVIEW,
      reviewDate: '2026-11-04',
    });
    render(<DocumentDetail />);
    await heading();

    expect(screen.queryByText(/Vencido|Vence pronto/)).not.toBeInTheDocument();
    expect(screen.queryByText('Última revisión')).not.toBeInTheDocument();
  });

  test('pide el nombre del responsable y el del revisor en un solo pedido', async () => {
    mocks.getDocument.mockResolvedValue({
      ...REVIEWED,
      review: { ...REVIEWED.review!, lastReviewedById: FIXTURE_USERS.admin.id },
    });
    render(<DocumentDetail />);
    await heading();

    expect(mocks.getNames).toHaveBeenCalledWith([
      FIXTURE_USERS.empleadoVentas.id,
      FIXTURE_USERS.admin.id,
    ]);
    expect(valueOf('Última revisión')).toHaveTextContent('por Ana Administradora');
  });
});

describe('sección "Revisión" (T19; F4, R6, R9)', () => {
  const section = () => screen.queryByRole('region', { name: 'Revisión' });

  test('el ADMIN la ve, con el campo y el botón', async () => {
    render(<DocumentDetail />);
    await heading();

    expect(section()).toBeInTheDocument();
    expect(screen.getByLabelText('Próxima fecha de revisión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar como revisado' })).toBeInTheDocument();
  });

  test('la responsable EMPLOYEE la ve, sin la fila de acciones del ADMIN', async () => {
    mocks.useSession.mockReturnValue(session(FIXTURE_USERS.empleadoVentas));
    render(<DocumentDetail />);
    await heading();

    expect(section()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar áreas' })).not.toBeInTheDocument();
  });

  test('E5: sin review, no hay sección ni botón', async () => {
    mocks.useSession.mockReturnValue(session(FIXTURE_USERS.supervisorVentas));
    mocks.getDocument.mockResolvedValue(WITHOUT_REVIEW);
    render(<DocumentDetail />);
    await heading();

    expect(section()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como revisado' })).not.toBeInTheDocument();
  });

  test('E11: archivado (con review para el ADMIN) → sin la sección', async () => {
    mocks.getDocument.mockResolvedValue({
      ...OVERDUE,
      status: 'ARCHIVED',
      archivedAt: '2026-10-23T18:00:00.000Z',
      review: { status: null, lastReviewedAt: null, lastReviewedById: null },
    });
    render(<DocumentDetail />);
    await heading();

    expect(section()).not.toBeInTheDocument();
  });

  test('E8: después de marcar, "Revisión registrada" y el detalle se vuelve a pedir', async () => {
    mocks.useSession.mockReturnValue(session(FIXTURE_USERS.empleadoVentas));
    mocks.markReviewed.mockResolvedValue(REVIEWED);
    render(<DocumentDetail />);
    await heading();
    mocks.getDocument.mockResolvedValue(REVIEWED);

    fireEvent.change(screen.getByLabelText('Próxima fecha de revisión'), {
      target: { value: '2099-05-09' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como revisado' }));

    // Mientras se vuelve a pedir, el detalle muestra "cargando" (que también es un role="status").
    expect(await screen.findByText('Revisión registrada')).toHaveAttribute('role', 'status');
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(valueOf('Última revisión')).toHaveTextContent('por Elena Empleada de Ventas'),
    );
    expect(screen.queryByText('Vencido')).not.toBeInTheDocument();
  });

  test('el ADMIN con "Subir versión nueva" abierto sigue viendo la sección', async () => {
    render(<DocumentDetail />);
    await heading();

    await userEvent.click(screen.getByRole('button', { name: 'Subir versión nueva' }));

    expect(screen.getByRole('region', { name: 'Subir versión nueva' })).toBeInTheDocument();
    expect(section()).toBeInTheDocument();
  });
});
