import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentDetail } from '@/components/documents/DocumentDetail';
import type { DocumentResponse, ProcessingStatus } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getDownloadUrl: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getDocument: mocks.getDocument,
  getDownloadUrl: mocks.getDownloadUrl,
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
  useParams: () => mocks.params,
}));

const ID = '11111111-1111-4111-8111-111111111111';
const VENTAS = '0a000000-0000-4000-8000-000000000001';
const SERGIO = '0b000000-0000-4000-8000-000000000002';

const ADMIN: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000001', name: 'Ana Administradora', role: 'ADMIN' },
  status: 'ready',
};
const EMPLOYEE: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};

function documentWith(changes: Partial<DocumentResponse> = {}, processingStatus: ProcessingStatus = 'PENDING'): DocumentResponse {
  return {
    id: ID,
    title: 'Manual de caja',
    description: 'Cómo abrir y cerrar la caja',
    status: 'ACTIVE',
    areaIds: [VENTAS],
    ownerId: SERGIO,
    reviewDate: '2027-03-01',
    createdById: ADMIN.user!.id,
    createdAt: '2026-10-23T15:00:00.000Z',
    currentVersion: {
      id: '22222222-2222-4222-8222-222222222222',
      versionNumber: 1,
      status: 'CURRENT',
      originalFileName: 'manual-de-caja.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2 * 1024 * 1024,
      processingStatus,
      createdAt: '2026-10-23T15:00:00.000Z',
    },
    ...changes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: ID };
  mocks.useSession.mockReturnValue(ADMIN);
  mocks.getDocument.mockResolvedValue(documentWith());
  mocks.listAreas.mockResolvedValue([{ id: VENTAS, name: 'Ventas' }]);
  mocks.getNames.mockResolvedValue({ [SERGIO]: 'Sergio Supervisor de Ventas' });
});

const heading = () => screen.findByRole('heading', { level: 1, name: 'Manual de caja' });

describe('datos del documento', () => {
  test('muestra título, descripción, áreas, responsable, fechas, archivo y tamaño', async () => {
    render(<DocumentDetail />);

    await heading();
    expect(screen.getByText('Cómo abrir y cerrar la caja')).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByText('Sergio Supervisor de Ventas')).toBeInTheDocument();
    expect(screen.getByText('01/03/2027')).toBeInTheDocument();
    expect(screen.getByText('23/10/2026, 12:00')).toBeInTheDocument();
    expect(screen.getByText('manual-de-caja.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(mocks.getDocument).toHaveBeenCalledWith(ID, expect.any(AbortSignal));
  });

  test('tiene el botón "Descargar", pero no pide el enlace al cargarse (F8)', async () => {
    render(<DocumentDetail />);

    await heading();
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeInTheDocument();
    expect(mocks.getDownloadUrl).not.toHaveBeenCalled();
  });

  test('sin descripción no muestra un párrafo vacío', async () => {
    mocks.getDocument.mockResolvedValue(documentWith({ description: null }));
    render(<DocumentDetail />);

    await heading();
    expect(screen.queryByText('Cómo abrir y cerrar la caja')).not.toBeInTheDocument();
  });
});

describe('estado del procesamiento (F6)', () => {
  test('E1: el ADMIN ve "Pendiente"', async () => {
    render(<DocumentDetail />);

    await heading();
    expect(screen.getByText('Procesamiento')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  test.each([
    ['PENDING', 'Pendiente'],
    ['PROCESSING', 'Procesando'],
    ['READY', 'Listo'],
    ['FAILED', 'Con error'],
  ] as const)('%s se muestra como "%s"', async (status, text) => {
    mocks.getDocument.mockResolvedValue(documentWith({}, status));
    render(<DocumentDetail />);

    await heading();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('E9: un EMPLOYEE no ve el estado del procesamiento', async () => {
    mocks.useSession.mockReturnValue(EMPLOYEE);
    render(<DocumentDetail />);

    await heading();
    expect(screen.queryByText('Procesamiento')).not.toBeInTheDocument();
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
  });

  test('"Archivado" solo lo ve el ADMIN', async () => {
    mocks.getDocument.mockResolvedValue(documentWith({ status: 'ARCHIVED' }));
    render(<DocumentDetail />);

    await heading();
    expect(screen.getByText('Archivado')).toBeInTheDocument();
  });
});

describe('documento inexistente o ajeno (F9)', () => {
  test('E12: con 404, "No se encontró el documento", sin "Reintentar"', async () => {
    mocks.getDocument.mockRejectedValue(new ApiError(404, ['Not Found']));
    render(<DocumentDetail />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el documento.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  test('con un id que no es UUID, el mismo mensaje y sin llamar a la API', () => {
    mocks.params = { id: 'abc' };
    render(<DocumentDetail />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se encontró el documento.');
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });
});

describe('estados (spec sección 7)', () => {
  test('cargando mientras la respuesta no llega', () => {
    mocks.getDocument.mockReturnValue(new Promise(() => {}));
    render(<DocumentDetail />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  test('con 503, el mensaje y "Reintentar" vuelve a pedir', async () => {
    const user = userEvent.setup();
    mocks.getDocument.mockRejectedValueOnce(new ApiError(503));
    render(<DocumentDetail />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await heading();
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
  });

  test('sin usuario no pide nada y muestra "Elegí un usuario de prueba"', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<DocumentDetail />);

    expect(screen.getByText('Elegí un usuario de prueba')).toBeInTheDocument();
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });
});
