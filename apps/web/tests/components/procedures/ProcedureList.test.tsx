import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { ApiError } from '@/lib/api';
import { simulateDialogs } from '../../support/dialog';
import { AREAS } from '../../support/procedure-areas';
import { ANA, PROCEDURE_ID, editable, procedureResponse } from '../../support/procedures';
import { ELENA, SUSANA, detailOf, listItem, listPage } from '../../support/procedure-view';

simulateDialogs();

const mocks = vi.hoisted(() => ({
  listProcedures: vi.fn(),
  createProcedure: vi.fn(),
  getProcedure: vi.fn(),
  listVersions: vi.fn(),
  discardDraft: vi.fn(),
  listAreas: vi.fn(),
  push: vi.fn(),
  useSession: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  listProcedures: mocks.listProcedures,
  createProcedure: mocks.createProcedure,
  getProcedure: mocks.getProcedure,
  listVersions: mocks.listVersions,
  discardDraft: mocks.discardDraft,
}));

vi.mock('@/lib/directory', () => ({ areasDirectory: { listAreas: mocks.listAreas } }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.search,
  useRouter: () => ({ push: mocks.push }),
}));

const OTHER_ID = '1a000000-0000-4000-8000-000000000002';
const OTHER = listItem({
  id: OTHER_ID,
  version: { ...listItem().version, title: 'Recepción de mercadería', stepCount: 4 },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.search = new URLSearchParams();
  mocks.useSession.mockReturnValue(ELENA);
  mocks.listProcedures.mockResolvedValue(listPage([listItem(), OTHER]));
  mocks.createProcedure.mockResolvedValue(procedureResponse());
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });
  mocks.getProcedure.mockResolvedValue(detailOf(editable({ title: 'Cierre de caja' })));
  mocks.discardDraft.mockResolvedValue(undefined);
});

// Spec 006, W1 (E41): the list is what the API answers, page by page.
describe('the list', () => {
  test('shows a card for each procedure the API answers', async () => {
    render(<ProcedureList />);

    expect(await screen.findByRole('heading', { level: 3, name: 'Cierre de caja' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Recepción de mercadería' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('asks for the first page, 12 at a time', async () => {
    render(<ProcedureList />);

    await screen.findAllByRole('listitem');
    expect(mocks.listProcedures).toHaveBeenCalledWith(
      { page: 1, limit: 12 },
      expect.any(AbortSignal),
    );
  });

  test('asks for the page of the address (?pagina=)', async () => {
    mocks.search = new URLSearchParams('pagina=3');

    render(<ProcedureList />);

    await screen.findAllByRole('listitem');
    expect(mocks.listProcedures).toHaveBeenCalledWith({ page: 3, limit: 12 }, expect.any(AbortSignal));
  });

  test('does not keep a copy in the browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(<ProcedureList />);
    await screen.findAllByRole('listitem');

    expect(setItem).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);
    setItem.mockRestore();
  });

  test('has page links when there are more than one page', async () => {
    mocks.listProcedures.mockResolvedValue({ ...listPage([listItem()], 30), page: 1 });

    render(<ProcedureList />);

    const pages = await screen.findByRole('navigation', { name: 'Páginas' });
    expect(within(pages).getByRole('link', { name: 'Página 3' })).toHaveAttribute(
      'href',
      '/procedimientos?pagina=3',
    );
  });
});

// W8 and W9 (E48): empty, loading and error.
describe('the states', () => {
  test('without procedures, an EMPLOYEE reads the friendly message', async () => {
    mocks.listProcedures.mockResolvedValue(listPage([]));

    render(<ProcedureList />);

    expect(
      await screen.findByText('Todavía no hay procedimientos publicados en tus áreas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('without procedures, an ADMIN reads a message about creating them', async () => {
    mocks.useSession.mockReturnValue(ANA);
    mocks.listProcedures.mockResolvedValue(listPage([]));

    render(<ProcedureList />);

    expect(await screen.findByText('Todavía no hay procedimientos creados.')).toBeInTheDocument();
  });

  test('while it asks, it tells screen readers', () => {
    mocks.listProcedures.mockReturnValue(new Promise(() => undefined));

    render(<ProcedureList />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando procedimientos…');
  });

  test('if it fails, it says so without the text of the server, and retrying asks again', async () => {
    mocks.listProcedures.mockRejectedValueOnce(new ApiError(503, ['pg connection refused']));

    render(<ProcedureList />);

    expect(await screen.findByRole('alert')).not.toHaveTextContent('pg connection');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Cierre de caja' })).toBeVisible();
    expect(mocks.listProcedures).toHaveBeenCalledTimes(2);
  });
});

// W3 (E43): the employee and the supervisor read; they do not create or edit.
describe.each([
  ['EMPLOYEE', ELENA],
  ['SUPERVISOR', SUSANA],
])('for a %s', (_role, session) => {
  test('has no form to create and no field', async () => {
    mocks.useSession.mockReturnValue(session);

    render(<ProcedureList />);

    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: 'Crear procedimiento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Crear un procedimiento' })).not.toBeInTheDocument();
  });

  test('each card goes to its read-only sheet', async () => {
    mocks.useSession.mockReturnValue(session);

    render(<ProcedureList />);

    const title = await screen.findByRole('link', { name: 'Cierre de caja' });
    expect(title).toHaveAttribute('href', `/procedimientos/${PROCEDURE_ID}`);
  });
});

// W2 (E42): the ADMIN keeps creating, and sees the new one.
describe('for an ADMIN', () => {
  beforeEach(() => mocks.useSession.mockReturnValue(ANA));

  test('has the form to create a procedure above the list', async () => {
    render(<ProcedureList />);

    expect(screen.getByRole('heading', { level: 2, name: 'Crear un procedimiento' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear procedimiento' })).toBeVisible();
    await screen.findAllByRole('listitem');
  });

  const createOne = async () => {
    await userEvent.type(screen.getByRole('textbox', { name: 'Título' }), 'Cierre de caja');
    await userEvent.click(screen.getByRole('button', { name: 'Crear procedimiento' }));
  };

  test('after creating one, the list is asked again and includes it', async () => {
    mocks.listProcedures.mockResolvedValueOnce(listPage([]));
    render(<ProcedureList />);
    await screen.findByText('Todavía no hay procedimientos creados.');
    mocks.listProcedures.mockResolvedValue(listPage([listItem()]));

    await createOne();

    expect(await screen.findByRole('heading', { level: 3, name: 'Cierre de caja' })).toBeVisible();
    expect(mocks.listProcedures).toHaveBeenCalledTimes(2);
  });

  test('after creating one, the same screen shows its draft in place of the form (E24)', async () => {
    render(<ProcedureList />);
    await screen.findAllByRole('listitem');

    await createOne();

    expect(await screen.findByRole('heading', { level: 2, name: 'Borrador' })).toBeVisible();
    expect(mocks.getProcedure).toHaveBeenCalledWith(PROCEDURE_ID, expect.any(AbortSignal));
    expect(screen.queryByRole('heading', { name: 'Crear un procedimiento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir el borrador' })).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('the draft of the same screen has one h1 only: the one of the page', async () => {
    render(<ProcedureList />);
    await screen.findAllByRole('listitem');

    await createOne();
    await screen.findByRole('heading', { level: 2, name: 'Borrador' });

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cierre de caja' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Volver a procedimientos/ })).not.toBeInTheDocument();
  });

  test('discarding that draft brings the form back and asks the list again', async () => {
    render(<ProcedureList />);
    await screen.findAllByRole('listitem');
    await createOne();
    await screen.findByRole('heading', { level: 2, name: 'Borrador' });

    await userEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Crear un procedimiento' })).toBeVisible();
    expect(mocks.listProcedures).toHaveBeenCalledTimes(3);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
