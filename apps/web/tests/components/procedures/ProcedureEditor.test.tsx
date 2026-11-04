import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { saveProcedure } from '@/lib/procedures/session-list';
import { AREAS } from '../../support/procedure-areas';
import { ADMIN_ID, ANA, PROCEDURE_ID, stored } from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAreas: vi.fn(),
  params: { id: '' } as { id: string },
  push: vi.fn(),
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.params = { id: PROCEDURE_ID };
  mocks.useSession.mockReturnValue(ANA);
  mocks.listAreas.mockResolvedValue(AREAS);
});

describe('the procedure', () => {
  test('shows its title and the draft, the steps and the areas', async () => {
    saveProcedure(ADMIN_ID, stored({ title: 'Cierre de caja' }));
    render(<ProcedureEditor />);

    expect(screen.getByRole('heading', { level: 1, name: 'Cierre de caja' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Pasos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Áreas' })).toBeInTheDocument();
    await screen.findByRole('group', { name: 'Áreas' });
  });

  test('an id that is not in this session says we do not have its data, and goes back to the list', () => {
    render(<ProcedureEditor />);

    expect(screen.getByText(/No tenemos los datos de este procedimiento/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a procedimientos' })).toHaveAttribute(
      'href',
      '/procedimientos',
    );
    expect(mocks.listAreas).not.toHaveBeenCalled();
  });
});
