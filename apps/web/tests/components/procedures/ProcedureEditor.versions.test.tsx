import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { ApiError } from '@/lib/api';
import { saveProcedure } from '@/lib/procedures/session-list';
import { AREAS } from '../../support/procedure-areas';
import { ADMIN_ID, ANA, PROCEDURE_ID, stored } from '../../support/procedures';
import { page, published, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAreas: vi.fn(),
  listVersions: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({ areasDirectory: { listAreas: mocks.listAreas } }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  listVersions: mocks.listVersions,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.params = { id: PROCEDURE_ID };
  mocks.useSession.mockReturnValue(ANA);
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue(page([versionItem(), published()]));
});

describe('the versions of the procedure (spec 015, R8)', () => {
  test('shows the section "Versiones" with the history of this procedure', async () => {
    saveProcedure(ADMIN_ID, stored());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('list', { name: 'Versiones' })).toBeInTheDocument();
    expect(mocks.listVersions).toHaveBeenCalledWith(PROCEDURE_ID, { limit: 100 }, expect.any(AbortSignal));
  });

  test('if the history fails, the draft is still there and the section says what happened', async () => {
    mocks.listVersions.mockRejectedValue(new ApiError(503));
    saveProcedure(ADMIN_ID, stored());
    render(<ProcedureEditor />);

    expect(await screen.findByText('No pudimos cargar las versiones.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
  });

  test('spec 015, R2: with a draft in the history it offers "Publicar"; without one it does not', async () => {
    saveProcedure(ADMIN_ID, stored());
    const { unmount } = render(<ProcedureEditor />);
    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    unmount();

    mocks.listVersions.mockResolvedValue(page([published()]));
    render(<ProcedureEditor />);
    await screen.findByRole('list', { name: 'Versiones' });

    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  test('a procedure that is not in this session does not ask for any history', () => {
    render(<ProcedureEditor />);

    expect(mocks.listVersions).not.toHaveBeenCalled();
  });
});
