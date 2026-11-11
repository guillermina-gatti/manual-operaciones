import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DocumentListResponse, DocumentSummary } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { DocumentList } from '@/components/documents/DocumentList';
import { areaRef, personRef, referencesOf } from '../../support/documents';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  searchParams: new URLSearchParams(),
  realAuthEnabled: true,
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listDocuments: mocks.listDocuments,
}));

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  return {
    ...actual,
    useSession: mocks.useSession,
    get REAL_AUTH_ENABLED() {
      return mocks.realAuthEnabled;
    },
  };
});

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
const COMPRAS = '0a000000-0000-4000-8000-000000000003';

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
    ...referencesOf(SERGIO, [VENTAS]),
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
  mocks.realAuthEnabled = true;
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

  test('desde la vista Tarjetas, lleva la vista a la carga (plan 002, D9)', async () => {
    mocks.useSession.mockReturnValue(ADMIN);
    mocks.searchParams = new URLSearchParams('vista=tarjetas');
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: 'Cargar documento' })).toHaveAttribute(
      'href',
      '/documentos/nuevo?vista=tarjetas',
    );
  });
});

// Spec 009 (F1, D11): el acceso al asistente, mientras el menú no tenga el enlace.
describe('acceso al asistente (spec 009, E16)', () => {
  test.each([
    ['un EMPLOYEE', EMPLOYEE],
    ['un ADMIN', ADMIN],
  ])('%s ve "Preguntale al asistente", con enlace a /asistente', async (_who, session) => {
    mocks.useSession.mockReturnValue(session);
    render(<DocumentList />);

    expect(await screen.findByRole('link', { name: 'Preguntale al asistente' })).toHaveAttribute(
      'href',
      '/asistente',
    );
  });

  test('sin sesión no aparece', async () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<DocumentList />);

    await screen.findByText('Necesitás iniciar sesión para ver los documentos.');
    expect(screen.queryByRole('link', { name: 'Preguntale al asistente' })).not.toBeInTheDocument();
  });
});

describe('listado (F7)', () => {
  test('E8: muestra exactamente las tarjetas de la respuesta y en el mismo orden', async () => {
    mocks.listDocuments.mockResolvedValue(page([doc(3), doc(1), doc(2)]));
    render(<DocumentList />);

    expect(await cardTitles()).toEqual(['Documento 3', 'Documento 1', 'Documento 2']);
  });

  test('spec 008, E1 y E9: los nombres salen de la respuesta, sin pedir el catálogo ni getNames', async () => {
    render(<DocumentList />);

    const card = (await screen.findAllByRole('article'))[0];
    expect(within(card).getByText('Ventas')).toBeInTheDocument();
    expect(within(card).getByText('Sergio Supervisor de Ventas')).toBeInTheDocument();
    expect(mocks.getNames).not.toHaveBeenCalled();
    expect(mocks.listAreas).not.toHaveBeenCalled();
  });

  test('spec 008, E3 y E4: responsable y área inactivos, con la palabra', async () => {
    mocks.listDocuments.mockResolvedValue(
      page([
        {
          ...doc(1),
          areaIds: [VENTAS, COMPRAS],
          areas: [areaRef(VENTAS), { id: COMPRAS, name: 'Compras', isActive: false }],
          owner: personRef(SERGIO, false),
        },
      ]),
    );
    render(<DocumentList />);

    const card = (await screen.findAllByRole('article'))[0];
    // Un chip por área: el área inactiva lleva la palabra en su propio chip.
    expect(within(card).getByText('Ventas')).toBeInTheDocument();
    expect(within(card).getByText('Compras (inactiva)')).toBeInTheDocument();
    expect(within(card).getByText('Sergio Supervisor de Ventas (inactivo)')).toBeInTheDocument();
  });

  test('spec 008, E10: sin nombre en la respuesta, "—"', async () => {
    mocks.listDocuments.mockResolvedValue(
      page([
        {
          ...doc(1),
          owner: { id: SERGIO, name: null, isActive: false },
          areas: [{ id: VENTAS, name: null, isActive: false }],
        },
      ]),
    );
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
  test('sin usuario no pide nada y ofrece iniciar sesión', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<DocumentList />);

    expect(
      screen.getByText('Necesitás iniciar sesión para ver los documentos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  test('sin usuario con autenticación simulada muestra "Elegí un usuario de prueba" y no pide nada', () => {
    mocks.realAuthEnabled = false;
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
