// Historial como línea de tiempo: se ven las 3 versiones más nuevas y "Ver todas" despliega el resto,
// sin otro pedido (spec 003, D10: sigue empezando cerrado y pidiendo al abrir).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VersionHistory } from '@/components/documents/VersionHistory';
import type { VersionHistoryItem } from '@/lib/api';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import { personRef } from '../../support/documents';

const mocks = vi.hoisted(() => ({ listVersions: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listVersions: mocks.listVersions,
}));

const ID = '11111111-1111-4111-8111-111111111111';

const version = (versionNumber: number, current = false): VersionHistoryItem => ({
  id: `0d000000-0000-4000-8000-00000000000${versionNumber}`,
  versionNumber,
  status: current ? 'CURRENT' : 'REPLACED',
  originalFileName: `manual v${versionNumber}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  processingStatus: 'READY',
  uploadedById: FIXTURE_USERS.admin.id,
  uploadedBy: personRef(FIXTURE_USERS.admin.id),
  createdAt: `2026-10-2${versionNumber}T15:00:00.000Z`,
});

const FIVE = [version(5, true), version(4), version(3), version(2), version(1)];

beforeEach(() => {
  vi.clearAllMocks();
});

async function open(user: ReturnType<typeof userEvent.setup>) {
  render(<VersionHistory documentId={ID} />);
  await user.click(screen.getByRole('button', { name: 'Historial de versiones' }));
  return screen.findByRole('list', { name: 'Versiones' });
}

const headings = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((row) => within(row).getByRole('heading').textContent);

describe('línea de tiempo del historial', () => {
  test('con 5 versiones muestra las 3 más nuevas y "Ver todas (5)"', async () => {
    mocks.listVersions.mockResolvedValue({ data: FIVE });
    const user = userEvent.setup();
    const list = await open(user);

    expect(headings(list)).toEqual(['Versión 5', 'Versión 4', 'Versión 3']);
    expect(screen.getByRole('button', { name: 'Ver todas (5)' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('"Ver todas" despliega el resto sin pedir de nuevo; "Ver menos" vuelve a 3', async () => {
    mocks.listVersions.mockResolvedValue({ data: FIVE });
    const user = userEvent.setup();
    const list = await open(user);

    await user.click(screen.getByRole('button', { name: 'Ver todas (5)' }));
    expect(headings(list)).toEqual(['Versión 5', 'Versión 4', 'Versión 3', 'Versión 2', 'Versión 1']);
    expect(mocks.listVersions).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(headings(list)).toHaveLength(3);
  });

  test('con 3 versiones o menos no hay "Ver todas"', async () => {
    mocks.listVersions.mockResolvedValue({ data: FIVE.slice(0, 3) });
    const user = userEvent.setup();
    const list = await open(user);

    expect(headings(list)).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Ver todas/ })).not.toBeInTheDocument();
  });

  test('la vigente dice "Vigente" y cada fila conserva su descarga', async () => {
    mocks.listVersions.mockResolvedValue({ data: FIVE.slice(0, 2) });
    const user = userEvent.setup();
    const list = await open(user);

    const [current, previous] = within(list).getAllByRole('listitem');
    expect(current).toHaveTextContent('Vigente');
    expect(previous).toHaveTextContent('Reemplazada');
    expect(screen.getByRole('button', { name: 'Descargar la versión 4' })).toBeInTheDocument();
  });
});
