import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DocumentListResponse, DocumentSummary } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { DocumentList } from '@/components/documents/DocumentList';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listDocuments: mocks.listDocuments,
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
  useRouter: () => ({ push: vi.fn() }),
}));

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

function doc(n: number, title = `Documento ${n}`): DocumentSummary {
  return {
    id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
    title,
    description: null,
    status: 'ACTIVE',
    areaIds: [VENTAS],
    ownerId: SERGIO,
    reviewDate: '2027-03-01',
    createdById: ADMIN.user!.id,
    createdAt: '2026-10-23T15:00:00.000Z',
    currentVersion: {
      id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
      versionNumber: 1,
      originalFileName: `documento-${n}.pdf`,
      mimeType: 'application/pdf',
      processingStatus: 'PENDING',
    },
  };
}

const page = (data: DocumentSummary[], total = data.length, pageNumber = 1): DocumentListResponse => ({
  data,
  total,
  page: pageNumber,
  limit: 20,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(EMPLOYEE);
  mocks.listDocuments.mockResolvedValue(page([doc(1)]));
  mocks.listAreas.mockResolvedValue([{ id: VENTAS, name: 'Ventas' }]);
  mocks.getNames.mockResolvedValue({ [SERGIO]: 'Sergio Supervisor de Ventas' });
});

const cardTitles = async () =>
  (await screen.findAllByRole('article')).map(
    (card) => within(card).getByRole('link').textContent,
  );

describe('botón "Cargar documento" (F1)', () => {
  test('E2: un EMPLOYEE no lo ve', async () => {
    render(<DocumentList />);

    await screen.findAllByRole('article');
    expect(screen.queryByRole('link', { name: 'Cargar documento' })).not.toBeInTheDocument();
  });

  test('un ADMIN lo ve, con enlace a /documentos/nuevo', async () => {
    mocks.useSession.mockReturnValue(ADMIN);
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: 'Cargar documento' })).toHaveAttribute(
      'href',
      '/documentos/nuevo',
    );
  });
});

describe('listado (F7)', () => {
  test('E8: muestra exactamente las tarjetas de la respuesta y en el mismo orden', async () => {
    mocks.listDocuments.mockResolvedValue(page([doc(3), doc(1), doc(2)]));
    render(<DocumentList />);

    expect(await cardTitles()).toEqual(['Documento 3', 'Documento 1', 'Documento 2']);
  });

  test('cada tarjeta muestra los nombres de las áreas y del responsable', async () => {
    render(<DocumentList />);

    const card = (await screen.findAllByRole('article'))[0];
    expect(within(card).getByText('Ventas')).toBeInTheDocument();
    expect(within(card).getByText('Sergio Supervisor de Ventas')).toBeInTheDocument();
    expect(mocks.getNames).toHaveBeenCalledWith([SERGIO]);
  });

  test('si fallan los nombres, las tarjetas igual se muestran con "—"', async () => {
    mocks.getNames.mockRejectedValue(new Error('sin directorio'));
    mocks.listAreas.mockRejectedValue(new Error('sin directorio'));
    render(<DocumentList />);

    const card = (await screen.findAllByRole('article'))[0];
    expect(within(card).getAllByText('—')).toHaveLength(2);
  });

  test('un título largo con tildes conserva el texto completo en title', async () => {
    const title = 'Instrucción de operación para la recepción y verificación de mercadería en depósito';
    mocks.listDocuments.mockResolvedValue(page([doc(1, title)]));
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: title })).toHaveAttribute('title', title);
  });

  test('con más de 20 documentos muestra la paginación', async () => {
    mocks.listDocuments.mockResolvedValue(page([doc(1)], 45));
    render(<DocumentList />);

    expect(await screen.findByRole('navigation', { name: 'Páginas' })).toBeInTheDocument();
  });
});

describe('página (?pagina=)', () => {
  test('sin ?pagina= pide la página 1', async () => {
    render(<DocumentList />);

    await screen.findAllByRole('article');
    expect(mocks.listDocuments).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  test('?pagina=2 pide page=2', async () => {
    mocks.searchParams = new URLSearchParams('pagina=2');
    mocks.listDocuments.mockResolvedValue(page([doc(21)], 45, 2));
    render(<DocumentList />);

    await screen.findAllByRole('article');
    expect(mocks.listDocuments).toHaveBeenCalledWith(2, expect.any(AbortSignal));
  });

  test('?pagina=abc pide la página 1', async () => {
    mocks.searchParams = new URLSearchParams('pagina=abc');
    render(<DocumentList />);

    await screen.findAllByRole('article');
    expect(mocks.listDocuments).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  test('una página mayor que el total muestra "Esta página no existe" con enlace a la primera', async () => {
    mocks.searchParams = new URLSearchParams('pagina=9');
    mocks.listDocuments.mockResolvedValue(page([], 45, 9));
    render(<DocumentList />);

    expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la primera página' })).toHaveAttribute(
      'href',
      '/documentos',
    );
  });
});

describe('estados (spec sección 7)', () => {
  test('cargando mientras la respuesta no llega', () => {
    mocks.listDocuments.mockReturnValue(new Promise(() => {}));
    render(<DocumentList />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  test('E10: lista vacía para un EMPLOYEE, sin botón de carga', async () => {
    mocks.listDocuments.mockResolvedValue(page([]));
    render(<DocumentList />);

    expect(await screen.findByText('Todavía no hay documentos en tus áreas')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Cargar/ })).not.toBeInTheDocument();
  });

  test('lista vacía para el ADMIN: el botón para cargar el primero', async () => {
    mocks.useSession.mockReturnValue(ADMIN);
    mocks.listDocuments.mockResolvedValue(page([]));
    render(<DocumentList />);

    expect(await screen.findByText('Todavía no hay documentos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cargar el primer documento' })).toHaveAttribute(
      'href',
      '/documentos/nuevo',
    );
  });

  test('con 503, el mensaje y "Reintentar" vuelve a pedir', async () => {
    const user = userEvent.setup();
    mocks.listDocuments.mockRejectedValueOnce(new ApiError(503));
    render(<DocumentList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await cardTitles()).toEqual(['Documento 1']);
    expect(mocks.listDocuments).toHaveBeenCalledTimes(2);
  });

  test('sin conexión, el mensaje y "Reintentar"', async () => {
    mocks.listDocuments.mockRejectedValue(new ApiError(0));
    render(<DocumentList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectarnos con el servidor.',
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('sesión', () => {
  test('sin usuario no pide nada y muestra "Elegí un usuario de prueba"', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<DocumentList />);

    expect(screen.getByText('Elegí un usuario de prueba')).toBeInTheDocument();
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  test('con la sesión desactivada (producción) no pide nada', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'disabled' });
    render(<DocumentList />);

    expect(screen.getByText('Tu sesión no es válida. Volvé a ingresar.')).toBeInTheDocument();
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  test('mientras se lee la sesión, cargando y sin pedir', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'loading' });
    render(<DocumentList />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });
});
