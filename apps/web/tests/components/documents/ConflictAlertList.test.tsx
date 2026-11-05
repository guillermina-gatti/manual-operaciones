// Spec 011 (T13; F6, F7, F9): la sección "Alertas", con las abiertas y las resueltas.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ConflictAlertList } from '@/components/documents/ConflictAlertList';
import { ApiError, PAGE_SIZE } from '@/lib/api';
import type { ConflictAlert, ConflictAlertPage } from '@/lib/api';

const mocks = vi.hoisted(() => ({
  listConflictAlerts: vi.fn(),
  resolveConflictAlert: vi.fn(),
  useSession: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listConflictAlerts: mocks.listConflictAlerts,
  resolveConflictAlert: mocks.resolveConflictAlert,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

const ALERT: ConflictAlert = {
  id: '0c000000-0000-4000-8000-000000000001',
  status: 'OPEN',
  documents: [
    {
      id: 'doc-compras',
      title: 'Manual de compras',
      status: 'ACTIVE',
      versionNumber: 2,
      section: 'Aprobaciones',
      isCurrentVersion: true,
    },
    {
      id: 'doc-gastos',
      title: 'Política de gastos',
      status: 'ACTIVE',
      versionNumber: 1,
      section: 'Sin sección',
      isCurrentVersion: true,
    },
  ],
  question: '¿Quién aprueba una compra de $800.000?',
  firstDetectedAt: '2026-11-05T13:00:00.000Z',
  lastDetectedAt: '2026-11-07T13:00:00.000Z',
  occurrences: 3,
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
};

const page = (data: ConflictAlert[], openTotal = data.length): ConflictAlertPage => ({
  data,
  total: data.length,
  openTotal,
  page: 1,
  limit: PAGE_SIZE,
});

const original = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue({
    user: { id: 'admin', name: 'Ana Administradora', role: 'ADMIN' },
    status: 'ready',
  });
  mocks.listConflictAlerts.mockResolvedValue(page([ALERT]));
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

afterEach(() => {
  HTMLDialogElement.prototype.showModal = original.showModal;
  HTMLDialogElement.prototype.close = original.close;
});

const card = async () => (await screen.findAllByRole('article'))[0];

describe('ConflictAlertList (F6, F7)', () => {
  test('E11: la tarjeta abierta, con los dos documentos, la pregunta y las fechas', async () => {
    render(<ConflictAlertList />);

    const alert = await card();
    expect(within(alert).getByRole('link', { name: 'Manual de compras' })).toHaveAttribute(
      'href',
      '/documentos/doc-compras',
    );
    expect(within(alert).getByRole('link', { name: 'Política de gastos' })).toHaveAttribute(
      'href',
      '/documentos/doc-gastos',
    );
    expect(within(alert).getByText('v2 · Aprobaciones')).toBeInTheDocument();
    expect(within(alert).getByText('v1 · Sin sección')).toBeInTheDocument();
    expect(within(alert).getByText('Pregunta que la disparó:')).toBeInTheDocument();
    expect(within(alert).getByText('«¿Quién aprueba una compra de $800.000?»')).toBeInTheDocument();
    expect(
      within(alert).getByText('Detectada el 05/11/2026 · Se detectó 3 veces · Última vez el 07/11/2026'),
    ).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Marcar como resuelta' })).toBeInTheDocument();
    expect(mocks.listConflictAlerts).toHaveBeenCalledWith('OPEN', 1, PAGE_SIZE, expect.any(AbortSignal));
  });

  test('detectada una sola vez, sin las repeticiones', async () => {
    mocks.listConflictAlerts.mockResolvedValue(page([{ ...ALERT, occurrences: 1 }]));
    render(<ConflictAlertList />);

    expect(within(await card()).getByText('Detectada el 05/11/2026')).toBeInTheDocument();
  });

  test('las píldoras: "Abiertas (n)" activa y "Resueltas" con el filtro en la URL', async () => {
    render(<ConflictAlertList />);

    const filters = await screen.findByRole('navigation', { name: 'Estado de las alertas' });
    const open = await within(filters).findByRole('link', { name: 'Abiertas (1)' });
    expect(open).toHaveAttribute('aria-current', 'page');
    expect(open).toHaveAttribute('href', '/documentos/alertas');
    const resolved = within(filters).getByRole('link', { name: 'Resueltas' });
    expect(resolved).toHaveAttribute('href', '/documentos/alertas?estado=resueltas');
    expect(resolved).not.toHaveAttribute('aria-current');
  });

  test('E15: "Archivado" y "Hay una versión nueva", con texto', async () => {
    mocks.listConflictAlerts.mockResolvedValue(
      page([
        {
          ...ALERT,
          documents: [
            { ...ALERT.documents[0], status: 'ARCHIVED' },
            { ...ALERT.documents[1], isCurrentVersion: false },
          ],
        },
      ]),
    );
    render(<ConflictAlertList />);

    const alert = await card();
    expect(within(alert).getByText('Archivado')).toBeInTheDocument();
    expect(within(alert).getByText('Hay una versión nueva')).toBeInTheDocument();
  });

  test('las resueltas: quién y cuándo, la nota, y sin el botón', async () => {
    mocks.searchParams = new URLSearchParams('estado=resueltas');
    mocks.listConflictAlerts.mockResolvedValue(
      page(
        [
          {
            ...ALERT,
            status: 'RESOLVED',
            resolvedAt: '2026-11-08T15:00:00.000Z',
            resolvedBy: { id: 'admin', name: 'Ana Administradora', isActive: false },
            resolutionNote: 'Corregida la política en la v2',
          },
        ],
        0,
      ),
    );
    render(<ConflictAlertList />);

    const alert = await card();
    expect(within(alert).getByText('Resuelta el 08/11/2026 por Ana Administradora (inactivo)')).toBeInTheDocument();
    expect(within(alert).getByText('Nota: Corregida la política en la v2')).toBeInTheDocument();
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.listConflictAlerts).toHaveBeenCalledWith('RESOLVED', 1, PAGE_SIZE, expect.any(AbortSignal));
    expect(screen.getByRole('link', { name: 'Resueltas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Abiertas (0)' })).toBeInTheDocument();
  });

  test.each([
    ['', 'No hay alertas abiertas. Cuando el asistente encuentre dos documentos que se contradicen, aparecen acá.'],
    ['estado=resueltas', 'Todavía no se resolvió ninguna alerta.'],
  ])('F9: sin alertas (%s)', async (query, message) => {
    mocks.searchParams = new URLSearchParams(query);
    mocks.listConflictAlerts.mockResolvedValue(page([], 0));
    render(<ConflictAlertList />);

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  test('un error sale con el mensaje de la web y "Reintentar"', async () => {
    mocks.listConflictAlerts.mockRejectedValue(new ApiError(503, ['Service Unavailable']));
    render(<ConflictAlertList />);

    expect(
      await screen.findByText('El servicio no está disponible. Probá de nuevo en unos minutos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  test('E13: al marcarla como resuelta, la lista se vuelve a pedir', async () => {
    mocks.resolveConflictAlert.mockResolvedValue({ ...ALERT, status: 'RESOLVED' });
    render(<ConflictAlertList />);
    const user = userEvent.setup();

    await user.click(within(await card()).getByRole('button', { name: 'Marcar como resuelta' }));
    mocks.listConflictAlerts.mockResolvedValue(page([], 0));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marcar como resuelta' }));

    expect(await screen.findByText(/No hay alertas abiertas/)).toBeInTheDocument();
    expect(mocks.listConflictAlerts).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('E14: si otra persona se adelantó, el aviso y la lista se vuelve a pedir', async () => {
    mocks.resolveConflictAlert.mockRejectedValue(new ApiError(409, ['La alerta ya está resuelta']));
    render(<ConflictAlertList />);
    const user = userEvent.setup();

    await user.click(within(await card()).getByRole('button', { name: 'Marcar como resuelta' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marcar como resuelta' }));

    expect(await screen.findByText('Otra persona ya la marcó como resuelta.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(mocks.listConflictAlerts).toHaveBeenCalledTimes(2));
  });
});
