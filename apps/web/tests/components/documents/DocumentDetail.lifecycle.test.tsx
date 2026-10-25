// Las acciones del ciclo de vida en el detalle (spec 003, T24). Van aparte de DocumentDetail.test.tsx
// (plan 002), para no cambiar sus mocks: acá se simulan también las llamadas nuevas de lib/api.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentDetail } from '@/components/documents/DocumentDetail';
import type { DocumentResponse } from '@/lib/api';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getDownloadUrl: vi.fn(),
  changeAreas: vi.fn(),
  uploadVersion: vi.fn(),
  archiveDocument: vi.fn(),
  listVersions: vi.fn(),
  getVersionDownloadUrl: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getNames: vi.fn(),
  listOwnerCandidates: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getDocument: mocks.getDocument,
  getDownloadUrl: mocks.getDownloadUrl,
  changeAreas: mocks.changeAreas,
  uploadVersion: mocks.uploadVersion,
  archiveDocument: mocks.archiveDocument,
  listVersions: mocks.listVersions,
  getVersionDownloadUrl: mocks.getVersionDownloadUrl,
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

const ACTIVE: DocumentResponse = {
  id: ID,
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.admin.id,
  reviewDate: '2027-03-01',
  createdById: FIXTURE_USERS.admin.id,
  createdAt: '2026-10-20T15:00:00.000Z',
  archivedAt: null,
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
// Archivado el 23/10/2026 a las 15:00 de Buenos Aires.
const ARCHIVED: DocumentResponse = {
  ...ACTIVE,
  status: 'ARCHIVED',
  archivedAt: '2026-10-23T18:00:00.000Z',
};

const areas = createFakeAreasDirectory({ delayMs: 0 });
const users = createFakeUsersDirectory({ delayMs: 0 });
const original = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue(session(FIXTURE_USERS.admin));
  mocks.getDocument.mockResolvedValue(ACTIVE);
  mocks.listAreas.mockImplementation(() => areas.listAreas());
  mocks.getNames.mockImplementation((ids: string[]) => users.getNames(ids));
  mocks.listOwnerCandidates.mockImplementation((ids: string[]) => users.listOwnerCandidates(ids));
  mocks.listVersions.mockResolvedValue({ data: [] });
  // jsdom no implementa showModal() ni close() (ver ArchiveDialog.test.tsx).
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

const heading = () => screen.findByRole('heading', { level: 1, name: 'Manual de caja' });
const actionButton = (name: string) => screen.queryByRole('button', { name });
const ACTIONS = ['Cambiar áreas', 'Subir versión nueva', 'Archivar'];

describe('acciones del ciclo de vida en el detalle (spec 003; plan 003, 6.1)', () => {
  test('el ADMIN con un documento activo ve las tres acciones, la descarga y el historial', async () => {
    render(<DocumentDetail />);
    await heading();

    for (const name of ['Descargar', ...ACTIONS, 'Historial de versiones']) {
      expect(actionButton(name)).toBeInTheDocument();
    }
    // El historial empieza cerrado: no se pide nada de más.
    expect(mocks.listVersions).not.toHaveBeenCalled();
  });

  test('E9: con uno archivado, "Archivado desde…", sin acciones y con historial', async () => {
    mocks.getDocument.mockResolvedValue(ARCHIVED);
    render(<DocumentDetail />);
    await heading();

    expect(screen.getByText('Archivado desde 23/10/2026')).toBeInTheDocument();
    for (const name of ACTIONS) expect(actionButton(name)).not.toBeInTheDocument();
    expect(actionButton('Descargar')).toBeInTheDocument();
    expect(actionButton('Historial de versiones')).toBeInTheDocument();
  });

  test.each([
    ['EMPLOYEE', FIXTURE_USERS.empleadoVentas],
    ['SUPERVISOR', FIXTURE_USERS.supervisorVentas],
  ])('E8 y E12: un %s no ve acciones ni historial, y no se pide /versions', async (_role, user) => {
    mocks.useSession.mockReturnValue(session(user));
    render(<DocumentDetail />);
    await heading();

    for (const name of [...ACTIONS, 'Historial de versiones']) {
      expect(actionButton(name)).not.toBeInTheDocument();
    }
    expect(actionButton('Descargar')).toBeInTheDocument();
    expect(mocks.listVersions).not.toHaveBeenCalled();
  });

  test('los paneles se abren de a uno: abrir "Cambiar áreas" cierra "Subir versión nueva"', async () => {
    const user = userEvent.setup();
    render(<DocumentDetail />);
    await heading();

    await user.click(actionButton('Subir versión nueva')!);
    expect(actionButton('Subir versión nueva')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Subir versión' })).toBeInTheDocument();

    await user.click(actionButton('Cambiar áreas')!);
    expect(await screen.findByRole('button', { name: 'Guardar áreas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir versión' })).not.toBeInTheDocument();
    expect(actionButton('Subir versión nueva')).toHaveAttribute('aria-expanded', 'false');
    expect(actionButton('Cambiar áreas')).toHaveAttribute('aria-expanded', 'true');

    // Volver a tocar la misma acción cierra su panel.
    await user.click(actionButton('Cambiar áreas')!);
    expect(screen.queryByRole('button', { name: 'Guardar áreas' })).not.toBeInTheDocument();
  });

  test('E7: después de archivar, el detalle se vuelve a pedir y aparece "Documento archivado"', async () => {
    const user = userEvent.setup();
    mocks.archiveDocument.mockResolvedValue(ARCHIVED);
    render(<DocumentDetail />);
    await heading();
    mocks.getDocument.mockResolvedValue(ARCHIVED);

    await user.click(actionButton('Archivar')!);
    const dialog = screen.getByRole('dialog', { name: 'Archivar documento' });
    await user.click(within(dialog).getByRole('button', { name: 'Archivar' }));

    expect(await screen.findByText('Documento archivado')).toHaveAttribute('role', 'status');
    expect(mocks.archiveDocument).toHaveBeenCalledWith(ID);
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Archivado desde 23/10/2026')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    for (const name of ACTIONS) expect(actionButton(name)).not.toBeInTheDocument();
  });

  test('E11: cancelar el archivo no pide nada ni vuelve a pedir el detalle', async () => {
    const user = userEvent.setup();
    render(<DocumentDetail />);
    await heading();

    await user.click(actionButton('Archivar')!);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.archiveDocument).not.toHaveBeenCalled();
    expect(mocks.getDocument).toHaveBeenCalledTimes(1);
  });

  test('después de cambiar las áreas: vuelve a pedir, cierra el panel y avisa "Áreas actualizadas"', async () => {
    const user = userEvent.setup();
    const updated = { ...ACTIVE, areaIds: [AREA_IDS.operaciones] };
    mocks.changeAreas.mockResolvedValue(updated);
    render(<DocumentDetail />);
    await heading();
    mocks.getDocument.mockResolvedValue(updated);

    await user.click(actionButton('Cambiar áreas')!);
    await user.click(await screen.findByRole('checkbox', { name: 'Operaciones' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ventas' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Responsable' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar áreas' }));

    expect(await screen.findByText('Áreas actualizadas')).toHaveAttribute('role', 'status');
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Guardar áreas' })).not.toBeInTheDocument();
    expect(actionButton('Cambiar áreas')).toHaveAttribute('aria-expanded', 'false');
  });

  test('después de subir una versión: avisa "Versión 2 cargada"', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const updated = {
      ...ACTIVE,
      currentVersion: { ...ACTIVE.currentVersion, id: 'v2', versionNumber: 2 },
    };
    mocks.uploadVersion.mockResolvedValue(updated);
    render(<DocumentDetail />);
    await heading();
    mocks.getDocument.mockResolvedValue(updated);

    await user.click(actionButton('Subir versión nueva')!);
    await user.upload(
      screen.getByLabelText('Archivo'),
      new File([new Uint8Array(10)], 'manual v2.pdf'),
    );
    await user.click(screen.getByRole('button', { name: 'Subir versión' }));

    expect(await screen.findByText('Versión 2 cargada')).toHaveAttribute('role', 'status');
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Subir versión' })).not.toBeInTheDocument();
  });
});
