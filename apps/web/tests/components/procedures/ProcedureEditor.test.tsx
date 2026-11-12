import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { ApiError } from '@/lib/api';
import { AREAS } from '../../support/procedure-areas';
import { detailOf } from '../../support/procedure-view';
import { ANA, PROCEDURE_ID, editable } from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getProcedure: vi.fn(),
  listVersions: vi.fn(),
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

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  getProcedure: mocks.getProcedure,
  listVersions: mocks.listVersions,
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
  mocks.listVersions.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });
  mocks.getProcedure.mockResolvedValue(detailOf(editable({ title: 'Cierre de caja' })));
});

// Spec 006, W6 (E46): the editor works from what GET /api/procedures/:id answers.
describe('the procedure', () => {
  test('asks the API for the procedure of the address', async () => {
    render(<ProcedureEditor />);

    await screen.findByRole('heading', { level: 1, name: 'Cierre de caja' });
    expect(mocks.getProcedure).toHaveBeenCalledWith(PROCEDURE_ID, expect.any(AbortSignal));
  });

  test('shows its title and the draft, the steps and the areas', async () => {
    render(<ProcedureEditor />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Cierre de caja' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Pasos' })).toBeInTheDocument();
    // The areas are chips inside the card of the draft, not a section of their own (D22).
    expect(await screen.findByRole('group', { name: 'Áreas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Áreas' })).not.toBeInTheDocument();
  });

  test('does not read or write the browser storage', async () => {
    render(<ProcedureEditor />);

    await screen.findByRole('heading', { level: 1 });
    expect(window.sessionStorage).toHaveLength(0);
  });

  test('while it loads, it tells screen readers', () => {
    mocks.getProcedure.mockReturnValue(new Promise(() => undefined));

    render(<ProcedureEditor />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando el procedimiento…');
  });

  test('an id the API answers 404 for says it was not found, and goes back to the list', async () => {
    mocks.getProcedure.mockRejectedValue(new ApiError(404));

    render(<ProcedureEditor />);

    expect(await screen.findByText('No se encontró el procedimiento')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a procedimientos/ })).toHaveAttribute(
      'href',
      '/procedimientos',
    );
    expect(mocks.listAreas).not.toHaveBeenCalled();
    expect(mocks.listVersions).not.toHaveBeenCalled();
  });

  test('another error offers to retry', async () => {
    mocks.getProcedure.mockRejectedValueOnce(new ApiError(503));

    render(<ProcedureEditor />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cierre de caja' })).toBeInTheDocument();
  });
});
