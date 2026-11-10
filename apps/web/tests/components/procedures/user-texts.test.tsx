import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { saveProcedure } from '@/lib/procedures/session-list';
import { AREAS } from '../../support/procedure-areas';
import { ADMIN_ID, ANA, PROCEDURE_ID, stored } from '../../support/procedures';
import { page, versionItem } from '../../support/versions';

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

// A story number (HU11, HU32…) is for the team, not for the person who uses the screen.
const STORY_NUMBER = /\bHU\d+\b/;

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.params = { id: PROCEDURE_ID };
  mocks.useSession.mockReturnValue(ANA);
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue(page([versionItem({ id: stored().versionId })]));
});

describe('the texts of the procedures screens are for the user', () => {
  test('the list says why it only has the procedures of this session, without a story number', () => {
    render(<ProcedureList />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'Todavía no hay un listado completo de procedimientos; por ahora se ven los que creaste en esta sesión del navegador.',
    );
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });

  test('the editor says that its data is the copy of this session, without a story number', () => {
    saveProcedure(ADMIN_ID, stored());
    render(<ProcedureEditor />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'Estos datos son la copia de esta sesión del navegador: todavía no se pueden recuperar desde el servidor. Si el procedimiento se cambia desde otro lugar, la copia puede quedar desactualizada.',
    );
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });

  test('a procedure that is not in this session says so, without a story number', () => {
    render(<ProcedureEditor />);

    expect(
      screen.getByText(
        'No tenemos los datos de este procedimiento en esta sesión del navegador. Por ahora solo se pueden abrir los procedimientos que creaste en esta sesión.',
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });

  test('the help of the areas says that a procedure needs one to be published, without a story number', async () => {
    saveProcedure(ADMIN_ID, stored());
    render(<ProcedureEditor />);

    expect(
      await screen.findByText('Un procedimiento puede quedar sin áreas, pero no se puede publicar sin al menos una.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(STORY_NUMBER);
  });
});
