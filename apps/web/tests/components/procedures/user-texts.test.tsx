import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { ApiError } from '@/lib/api';
import { AREAS } from '../../support/procedure-areas';
import { detailOf, listItem, listPage } from '../../support/procedure-view';
import { ANA, PROCEDURE_ID, editable } from '../../support/procedures';
import { page, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAreas: vi.fn(),
  listVersions: vi.fn(),
  getProcedure: vi.fn(),
  listProcedures: vi.fn(),
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
  getProcedure: mocks.getProcedure,
  listProcedures: mocks.listProcedures,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// A story number (HU11, HU32…) is for the team, not for the person who uses the screen.
const STORY_NUMBER = /\bHU\d+\b/;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: PROCEDURE_ID };
  mocks.useSession.mockReturnValue(ANA);
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue(page([versionItem({ id: editable().versionId })]));
  mocks.getProcedure.mockResolvedValue(detailOf(editable()));
  mocks.listProcedures.mockResolvedValue(listPage([listItem()]));
});

describe('the texts of the procedures screens are for the user', () => {
  test('the list has no story number and no notice about a copy of the session', async () => {
    render(<ProcedureList />);

    await screen.findByRole('heading', { level: 3, name: 'Cierre de caja' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });

  test('the editor has no story number and does not say its data is a copy of the session', async () => {
    render(<ProcedureEditor />);

    await screen.findByRole('heading', { level: 1, name: 'Cierre de caja' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/copia de esta sesión/);
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });

  test('a procedure that is not found says so, without a story number', async () => {
    mocks.getProcedure.mockRejectedValue(new ApiError(404));

    render(<ProcedureEditor />);

    expect(await screen.findByText('No se encontró el procedimiento')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });

  test('the help of the areas says that a procedure needs one to be published, without a story number', async () => {
    render(<ProcedureEditor />);

    expect(
      await screen.findByText('Un procedimiento puede quedar sin áreas, pero no se puede publicar sin al menos una.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });
});
