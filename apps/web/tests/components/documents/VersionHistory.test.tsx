import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VersionHistory } from '@/components/documents/VersionHistory';
import { ApiError } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/api';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';

const mocks = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getVersionDownloadUrl: vi.fn(),
  getNames: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listVersions: mocks.listVersions,
  getVersionDownloadUrl: mocks.getVersionDownloadUrl,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: vi.fn() },
  usersDirectory: { listOwnerCandidates: vi.fn(), getNames: mocks.getNames },
}));

const ID = '11111111-1111-4111-8111-111111111111';
const version = (
  versionNumber: number,
  overrides: Partial<VersionHistoryItem> = {},
): VersionHistoryItem => ({
  id: `0d000000-0000-4000-8000-00000000000${versionNumber}`,
  versionNumber,
  status: 'REPLACED',
  originalFileName: `manual v${versionNumber}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  processingStatus: 'READY',
  uploadedById: FIXTURE_USERS.admin.id,
  createdAt: `2026-10-2${versionNumber}T15:00:00.000Z`,
  ...overrides,
});
const V3 = version(3, {
  status: 'CURRENT',
  processingStatus: 'PENDING',
  uploadedById: FIXTURE_USERS.supervisorVentas.id,
});
const V2 = version(2);
const V1 = version(1, { originalFileName: `${'manual muy largo '.repeat(10)}.pdf` });

const users = createFakeUsersDirectory({ delayMs: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listVersions.mockResolvedValue({ data: [V3, V2, V1] });
  mocks.getNames.mockImplementation((ids: string[]) => users.getNames(ids));
  mocks.getVersionDownloadUrl.mockResolvedValue({
    url: 'https://manual-docs.s3.amazonaws.com/x.pdf?firma=1',
    expiresAt: '2026-10-23T15:05:00.000Z',
  });
});

const toggle = () => screen.getByRole('button', { name: 'Historial de versiones' });

async function openHistory(user: ReturnType<typeof userEvent.setup>, openUrl = vi.fn()) {
  render(<VersionHistory documentId={ID} openUrl={openUrl} />);
  await user.click(toggle());
  return screen.findByRole('list', { name: 'Versiones' });
}

describe('VersionHistory (spec 003, R12; plan 003, 6.5)', () => {
  test('empieza cerrada y no pide nada', () => {
    render(<VersionHistory documentId={ID} />);

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(mocks.listVersions).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Versiones' })).not.toBeInTheDocument();
  });

  test('al abrirla, un solo pedido', async () => {
    const user = userEvent.setup();
    await openHistory(user);

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(mocks.listVersions).toHaveBeenCalledTimes(1);
    expect(mocks.listVersions).toHaveBeenCalledWith(ID, expect.any(AbortSignal));
  });

  test('E13: tres versiones en orden 3, 2, 1, con su estado, su procesamiento y quién la subió', async () => {
    const user = userEvent.setup();
    const list = await openHistory(user);

    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Versión 3',
      'Versión 2',
      'Versión 1',
    ]);
    expect(rows[0]).toHaveTextContent('Vigente');
    expect(rows[0]).toHaveTextContent('Pendiente');
    expect(rows[1]).toHaveTextContent('Reemplazada');
    expect(rows[1]).toHaveTextContent('Listo');
    await waitFor(() => expect(rows[0]).toHaveTextContent('Sergio Supervisor de Ventas'));
    expect(rows[1]).toHaveTextContent('Ana Administradora');
    expect(rows[0]).toHaveTextContent('manual v3.pdf');
    expect(rows[0]).toHaveTextContent('23/10/2026');
  });

  test('un nombre de archivo largo se recorta y queda completo en title', async () => {
    const user = userEvent.setup();
    await openHistory(user);

    expect(screen.getByTitle(V1.originalFileName)).toHaveClass('truncate');
  });

  test('"Descargar" de la versión 2 pide getVersionDownloadUrl(id, v2) en cada clic', async () => {
    const user = userEvent.setup();
    const openUrl = vi.fn();
    await openHistory(user, openUrl);

    const download = screen.getByRole('button', { name: 'Descargar la versión 2' });
    await user.click(download);
    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    await user.click(download);
    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(2));

    expect(mocks.getVersionDownloadUrl).toHaveBeenCalledTimes(2);
    for (const call of mocks.getVersionDownloadUrl.mock.calls) {
      expect(call.slice(0, 2)).toEqual([ID, V2.id]);
    }
  });

  test('error: mensaje y "Reintentar" vuelve a pedir', async () => {
    mocks.listVersions.mockRejectedValueOnce(new ApiError(503, ['Service Unavailable']));
    const user = userEvent.setup();
    render(<VersionHistory documentId={ID} />);

    await user.click(toggle());

    expect(
      await screen.findByText('El servicio no está disponible. Probá de nuevo en unos minutos.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Versiones' })).toBeInTheDocument();
    expect(mocks.listVersions).toHaveBeenCalledTimes(2);
  });

  test('si no se conocen los nombres, muestra "—"', async () => {
    mocks.getNames.mockResolvedValue({});
    const user = userEvent.setup();
    const list = await openHistory(user);

    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Subida por —'),
    );
  });

  test('al cerrarla y volver a abrirla no pide de nuevo', async () => {
    const user = userEvent.setup();
    await openHistory(user);

    await user.click(toggle());
    await user.click(toggle());

    expect(await screen.findByRole('list', { name: 'Versiones' })).toBeInTheDocument();
    expect(mocks.listVersions).toHaveBeenCalledTimes(1);
  });
});
