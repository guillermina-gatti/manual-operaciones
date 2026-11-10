import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { ApiError } from '@/lib/api';
import { loadProcedures, saveProcedure } from '@/lib/procedures/session-list';
import { AREAS } from '../../support/procedure-areas';
import { ADMIN_ID, ANA, PROCEDURE_ID, procedureResponse, stored } from '../../support/procedures';
import { V1, V2, page, published, versionDetail, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAreas: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  createVersionDraft: vi.fn(),
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
  getVersion: mocks.getVersion,
  createVersionDraft: mocks.createVersionDraft,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn() }),
}));

// The draft 2 is the one the copy follows, and the version 1 is the published one.
const storedDraft = () => stored({ versionId: V2, versionNumber: 2 });
const storedPublished = () => stored({ versionId: V1, versionNumber: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.params = { id: PROCEDURE_ID };
  mocks.useSession.mockReturnValue(ANA);
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue(page([versionItem(), published()]));
  mocks.getVersion.mockResolvedValue(versionDetail());
});

describe('the versions of the procedure (spec 015, R8)', () => {
  test('shows the section "Versiones" with the history of this procedure', async () => {
    saveProcedure(ADMIN_ID, storedDraft());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('list', { name: 'Versiones' })).toBeInTheDocument();
    expect(mocks.listVersions).toHaveBeenCalledWith(PROCEDURE_ID, { limit: 100 }, expect.any(AbortSignal));
  });

  test('if the history fails, the draft is still there and the section says what happened', async () => {
    mocks.listVersions.mockRejectedValue(new ApiError(503));
    saveProcedure(ADMIN_ID, storedDraft());
    render(<ProcedureEditor />);

    expect(await screen.findByText('No pudimos cargar las versiones.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
  });

  test('spec 015, R2: with the draft of the copy in the history it offers "Publicar"', async () => {
    saveProcedure(ADMIN_ID, storedDraft());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear nueva versión' })).not.toBeInTheDocument();
  });

  test('a procedure that is not in this session does not ask for any history', () => {
    render(<ProcedureEditor />);

    expect(mocks.listVersions).not.toHaveBeenCalled();
  });
});

describe('a version that is no longer a draft (spec 015, R6 and R7)', () => {
  beforeEach(() => {
    mocks.listVersions.mockResolvedValue(page([published()]));
  });

  test('is shown read-only: no fields to edit it, and the subtitle says its state', async () => {
    saveProcedure(ADMIN_ID, storedPublished());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Versión 1 · Publicada' })).toBeInTheDocument();
    expect(screen.getByText('Versión 1 · publicada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Borrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Título' })).not.toBeInTheDocument();
  });

  test('"Crear nueva versión" makes the copy follow the new draft, which can be edited and published', async () => {
    mocks.createVersionDraft.mockResolvedValue({ ...procedureResponse().versions[0], id: V2, versionNumber: 2 });
    mocks.getVersion.mockImplementation((_procedure: string, id: string) =>
      Promise.resolve(id === V2 ? versionDetail({ id: V2, versionNumber: 2, status: 'DRAFT' }) : versionDetail()),
    );
    saveProcedure(ADMIN_ID, storedPublished());
    render(<ProcedureEditor />);
    mocks.listVersions.mockResolvedValue(page([versionItem(), published()]));

    await userEvent.click(await screen.findByRole('button', { name: 'Crear nueva versión' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
    expect(loadProcedures(ADMIN_ID)[0]).toMatchObject({ versionId: V2, versionNumber: 2 });
    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument();
  });
});
