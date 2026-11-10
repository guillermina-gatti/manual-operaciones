// Vistas del listado: Lista (por defecto) y Tarjetas, elegidas con ?vista= (selector con aria-pressed).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DocumentListResponse, DocumentSearchResponse, DocumentSummary } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentListSkeleton } from '@/components/documents/DocumentListSkeleton';
import { referencesOf } from '../../support/documents';

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  searchDocuments: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listDocuments: mocks.listDocuments,
  searchDocuments: mocks.searchDocuments,
  // Los accesos de Por revisar y Alertas no son parte de esta prueba.
  listPendingReview: vi.fn(() => new Promise(() => {})),
  listConflictAlerts: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const SERGIO = '0b000000-0000-4000-8000-000000000002';

const EMPLOYEE: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};

const DOC: DocumentSummary = {
  id: '11111111-1111-4111-8111-000000000001',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [VENTAS, OPERACIONES],
  ownerId: SERGIO,
  ...referencesOf(SERGIO, [VENTAS, OPERACIONES]),
  reviewDate: '2027-03-01',
  createdById: SERGIO,
  createdAt: '2026-10-01T15:00:00.000Z',
  currentVersion: {
    id: '22222222-2222-4222-8222-000000000001',
    versionNumber: 3,
    originalFileName: 'manual-de-caja.pdf',
    mimeType: 'application/pdf',
    processingStatus: 'READY',
    createdAt: '2026-10-23T15:00:00.000Z',
  },
};

const page = (data: DocumentSummary[], total = data.length): DocumentListResponse => ({
  data,
  total,
  page: 1,
  limit: 20,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(EMPLOYEE);
  mocks.listDocuments.mockResolvedValue(page([DOC]));
});

const switcher = () => screen.getByRole('group', { name: 'Vista' });

describe('selector de vista', () => {
  test('sin ?vista= está elegida la Lista (aria-pressed)', async () => {
    render(<DocumentList />);
    await screen.findAllByRole('article');

    expect(within(switcher()).getByRole('button', { name: 'Lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(switcher()).getByRole('button', { name: 'Tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('?vista=tarjetas marca Tarjetas; un valor inválido vuelve a Lista', async () => {
    mocks.searchParams = new URLSearchParams('vista=tarjetas');
    const { unmount } = render(<DocumentList />);
    await screen.findAllByRole('article');
    expect(within(switcher()).getByRole('button', { name: 'Tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    unmount();

    mocks.searchParams = new URLSearchParams('vista=xyz');
    render(<DocumentList />);
    await screen.findAllByRole('article');
    expect(within(switcher()).getByRole('button', { name: 'Lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('pasar a Tarjetas conserva la búsqueda y la página, y vuelve a Lista sin el parámetro', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('pagina=2');
    mocks.listDocuments.mockResolvedValue({ ...page([DOC], 45), page: 2 });
    const { unmount } = render(<DocumentList />);
    await screen.findAllByRole('article');

    await user.click(within(switcher()).getByRole('button', { name: 'Tarjetas' }));
    expect(mocks.replace).toHaveBeenCalledWith('/documentos?pagina=2&vista=tarjetas', {
      scroll: false,
    });
    unmount();

    mocks.searchParams = new URLSearchParams('pagina=2&vista=tarjetas');
    render(<DocumentList />);
    await screen.findAllByRole('article');
    await user.click(within(switcher()).getByRole('button', { name: 'Lista' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/documentos?pagina=2', { scroll: false });
  });

  test('tocar la vista que ya está elegida no navega', async () => {
    const user = userEvent.setup();
    render(<DocumentList />);
    await screen.findAllByRole('article');

    await user.click(within(switcher()).getByRole('button', { name: 'Lista' }));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  test('con Tarjetas, la paginación conserva la vista', async () => {
    mocks.searchParams = new URLSearchParams('vista=tarjetas');
    mocks.listDocuments.mockResolvedValue(page([DOC], 45));
    render(<DocumentList />);

    const pages = await screen.findByRole('navigation', { name: 'Páginas' });
    expect(within(pages).getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/documentos?vista=tarjetas&pagina=2',
    );
  });
});

describe('vista Lista', () => {
  test('una fila con nombre, áreas, responsable, fecha de revisión y "actualizado"', async () => {
    render(<DocumentList />);

    const [row] = await screen.findAllByRole('article');
    expect(within(row).getByRole('heading', { level: 2, name: 'Manual de caja' })).toBeInTheDocument();
    expect(within(row).getAllByRole('link')).toHaveLength(1);
    // La Lista es la vista por defecto: el detalle no necesita ?vista= para volver a ella.
    expect(within(row).getByRole('link')).toHaveAttribute('href', `/documentos/${DOC.id}`);
    expect(within(row).getByText('Ventas')).toBeInTheDocument();
    expect(within(row).getByText('Operaciones')).toBeInTheDocument();
    expect(within(row).getByText('Sergio Supervisor de Ventas')).toBeInTheDocument();
    expect(within(row).getByText('01/03/2027')).toBeInTheDocument();
    expect(within(row).getByText('Archivo PDF')).toBeInTheDocument();
    // "Actualizado": la fecha de la versión vigente, con la fecha completa en title.
    const time = row.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-10-23T15:00:00.000Z');
    expect(time).toHaveAttribute('title', '23/10/2026, 12:00');
  });
});

describe('vista Tarjetas', () => {
  test('una tarjeta con versión, "Actualizado … · área +1" y responsable', async () => {
    mocks.searchParams = new URLSearchParams('vista=tarjetas');
    render(<DocumentList />);

    const [tile] = await screen.findAllByRole('article');
    expect(within(tile).getByRole('heading', { level: 2, name: 'Manual de caja' })).toBeInTheDocument();
    expect(within(tile).getAllByRole('link')).toHaveLength(1);
    // Lleva la vista al detalle, para que la ruta ("Documentos › …") vuelva a las Tarjetas.
    expect(within(tile).getByRole('link')).toHaveAttribute(
      'href',
      `/documentos/${DOC.id}?vista=tarjetas`,
    );
    expect(within(tile).getByText('v3')).toBeInTheDocument();
    expect(within(tile).getByText('Versión 3')).toHaveClass('sr-only');
    expect(within(tile).getByText('Ventas +1')).toHaveAttribute('title', 'Ventas, Operaciones');
    expect(within(tile).getByText(/^Responsable: Sergio Supervisor de Ventas$/)).toBeInTheDocument();
    expect(tile.querySelector('time')).toHaveAttribute('dateTime', '2026-10-23T15:00:00.000Z');
  });

  test('sin la fecha de la versión (datos anteriores), usa la carga del documento', async () => {
    mocks.searchParams = new URLSearchParams('vista=tarjetas');
    const version = { ...DOC.currentVersion };
    delete version.createdAt;
    mocks.listDocuments.mockResolvedValue(page([{ ...DOC, currentVersion: version }]));
    render(<DocumentList />);

    const [tile] = await screen.findAllByRole('article');
    expect(tile.querySelector('time')).toHaveAttribute('dateTime', DOC.createdAt);
  });
});

describe('resultados de búsqueda en cada vista', () => {
  const results: DocumentSearchResponse = {
    data: [
      {
        ...DOC,
        fragment: { parts: [{ text: 'el cierre de ', match: false }, { text: 'caja', match: true }], pageNumber: 4 },
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };

  test.each([['lista'], ['tarjetas']])('%s: el fragmento resaltado y la página', async (vista) => {
    mocks.searchParams = new URLSearchParams(`q=caja&vista=${vista}`);
    mocks.searchDocuments.mockResolvedValue(results);
    render(<DocumentList />);

    const [item] = await screen.findAllByRole('article');
    expect([...item.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['caja']);
    expect(within(item).getByText('Página 4')).toBeInTheDocument();
    expect(within(item).getAllByRole('link')).toHaveLength(1);
  });
});

describe('esqueleto según la vista', () => {
  test('list: filas; tile: hojas; card (por defecto): la tarjeta de siempre', () => {
    const { container, rerender } = render(<DocumentListSkeleton variant="list" />);
    expect(container.querySelectorAll('li')).toHaveLength(6);
    expect(container.querySelector('.divide-y')).not.toBeNull();

    rerender(<DocumentListSkeleton variant="tile" />);
    expect(container.querySelector('.h-16.w-14')).not.toBeNull();

    rerender(<DocumentListSkeleton />);
    expect(container.querySelector('.divide-y')).toBeNull();
    expect(container.querySelector('.h-16.w-14')).toBeNull();
  });

  test('mientras carga, el listado muestra el esqueleto de la vista activa', () => {
    mocks.listDocuments.mockReturnValue(new Promise(() => {}));
    mocks.searchParams = new URLSearchParams('vista=tarjetas');
    const { container, unmount } = render(<DocumentList />);
    expect(container.querySelector('.h-16.w-14')).not.toBeNull();
    unmount();

    mocks.searchParams = new URLSearchParams();
    const list = render(<DocumentList />);
    expect(list.container.querySelector('.divide-y')).not.toBeNull();
  });
});
