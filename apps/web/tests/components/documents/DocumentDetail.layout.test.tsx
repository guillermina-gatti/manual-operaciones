// Disposición del detalle: encabezado con la hoja del tipo, versión, "Actualizado" y áreas; el archivo
// como adjunto; la fecha de revisión en el panel "Revisión" (o en los datos si no hay panel).
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentDetail } from '@/components/documents/DocumentDetail';
import type { DocumentResponse } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import { referencesOf, reviewOf } from '../../support/documents';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  useSession: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getDocument: mocks.getDocument,
  listVersions: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
}));

const ID = '11111111-1111-4111-8111-111111111111';
const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const SERGIO = '0b000000-0000-4000-8000-000000000002';

const ADMIN: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000001', name: 'Ana Administradora', role: 'ADMIN' },
  status: 'ready',
};
const EMPLOYEE: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Empleada de Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};

const DOC: DocumentResponse = {
  id: ID,
  title: 'Manual de caja',
  description: 'Cómo abrir y cerrar la caja',
  status: 'ACTIVE',
  areaIds: [VENTAS, OPERACIONES],
  ownerId: SERGIO,
  ...referencesOf(SERGIO, [VENTAS, OPERACIONES]),
  reviewDate: '2027-03-01',
  createdById: SERGIO,
  createdAt: '2026-10-01T15:00:00.000Z',
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    versionNumber: 2,
    status: 'CURRENT',
    originalFileName: 'manual-de-caja.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2 * 1024 * 1024,
    processingStatus: 'READY',
    createdAt: '2026-10-23T15:00:00.000Z',
  },
};

const WITH_REVIEW: DocumentResponse = {
  ...DOC,
  review: reviewOf({ status: 'UP_TO_DATE', lastReviewedAt: null, lastReviewedById: null }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: ID };
  mocks.useSession.mockReturnValue(ADMIN);
  mocks.getDocument.mockResolvedValue(DOC);
});

const heading = () => screen.findByRole('heading', { level: 1, name: 'Manual de caja' });

describe('encabezado', () => {
  test('la hoja del tipo, la versión y "Actualizado" con la fecha de la versión vigente', async () => {
    render(<DocumentDetail />);
    const title = await heading();
    const header = title.closest('header')!;

    expect(header.querySelector('svg text')).toHaveTextContent('PDF');
    expect(within(header).getByText('v2')).toHaveAttribute('aria-hidden', 'true');
    expect(within(header).getByText('Versión vigente: 2')).toHaveClass('sr-only');
    expect(header.querySelector('time')).toHaveAttribute('dateTime', '2026-10-23T15:00:00.000Z');
    expect(within(header).getByRole('button', { name: 'Descargar' })).toBeInTheDocument();
  });

  test('las áreas van en el encabezado, una sola vez cada una', async () => {
    render(<DocumentDetail />);
    const header = (await heading()).closest('header')!;

    expect(within(header).getByText('Ventas')).toBeInTheDocument();
    expect(within(header).getByText('Operaciones')).toBeInTheDocument();
    expect(screen.getAllByText('Ventas')).toHaveLength(1);
    expect(screen.queryByText('Áreas', { selector: 'dt' })).not.toBeInTheDocument();
  });
});

describe('archivo como adjunto', () => {
  test('nombre completo en title y el tamaño al lado', async () => {
    render(<DocumentDetail />);
    await heading();

    expect(screen.getByText('manual-de-caja.pdf')).toHaveAttribute('title', 'manual-de-caja.pdf');
    expect(screen.getByText('manual-de-caja.pdf')).toHaveClass('truncate');
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.queryByText('Archivo', { selector: 'dt' })).not.toBeInTheDocument();
  });
});

describe('fecha de revisión', () => {
  test('con el panel "Revisión": la fecha y cuánto falta van en el panel, no en los datos', async () => {
    mocks.getDocument.mockResolvedValue(WITH_REVIEW);
    render(<DocumentDetail />);
    await heading();

    const panel = screen.getByRole('region', { name: 'Revisión' });
    expect(within(panel).getByText('01/03/2027')).toBeInTheDocument();
    expect(within(panel).getByText(/^(Faltan \d+ días|Falta 1 día|Vence hoy|Venció)/)).toBeInTheDocument();
    expect(screen.queryByText('Fecha de revisión', { selector: 'dt' })).not.toBeInTheDocument();
    expect(screen.getAllByText('01/03/2027')).toHaveLength(1);
  });

  test('sin panel (un empleado que no es responsable): la fecha sigue en los datos', async () => {
    mocks.useSession.mockReturnValue(EMPLOYEE);
    render(<DocumentDetail />);
    await heading();

    expect(screen.queryByRole('region', { name: 'Revisión' })).not.toBeInTheDocument();
    expect(screen.getByText('Fecha de revisión', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      '01/03/2027',
    );
  });
});

describe('procesamiento', () => {
  test('el ADMIN ve "Listo para el asistente"; el empleado, nada', async () => {
    const { unmount } = render(<DocumentDetail />);
    await heading();
    expect(screen.getByText('Listo para el asistente')).toBeInTheDocument();
    unmount();

    mocks.useSession.mockReturnValue(EMPLOYEE);
    render(<DocumentDetail />);
    await heading();
    expect(screen.queryByText('Listo para el asistente')).not.toBeInTheDocument();
  });
});
