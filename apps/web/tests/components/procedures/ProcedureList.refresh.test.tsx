import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { simulateDialogs } from '../../support/dialog';
import { AREAS } from '../../support/procedure-areas';
import { ANA, VERSION_ID, editable, procedureResponse } from '../../support/procedures';
import { detailOf, listItem, listPage } from '../../support/procedure-view';
import { page, versionDetail, versionItem } from '../../support/versions';

simulateDialogs();

const mocks = vi.hoisted(() => ({
  listProcedures: vi.fn(),
  createProcedure: vi.fn(),
  getProcedure: vi.fn(),
  listVersions: vi.fn(),
  updateVersion: vi.fn(),
  publishVersion: vi.fn(),
  listAreas: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  listProcedures: mocks.listProcedures,
  createProcedure: mocks.createProcedure,
  getProcedure: mocks.getProcedure,
  listVersions: mocks.listVersions,
  updateVersion: mocks.updateVersion,
  publishVersion: mocks.publishVersion,
}));

vi.mock('@/lib/directory', () => ({ areasDirectory: { listAreas: mocks.listAreas } }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue(ANA);
  mocks.listProcedures.mockResolvedValue(listPage([listItem()]));
  mocks.createProcedure.mockResolvedValue(procedureResponse());
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue(page([versionItem({ id: VERSION_ID })]));
  mocks.getProcedure.mockResolvedValue(detailOf(editable({ title: 'Cierre de caja' })));
  mocks.updateVersion.mockResolvedValue({ ...procedureResponse().versions[0], title: 'Cierre nuevo' });
  mocks.publishVersion.mockResolvedValue(versionDetail());
});

// Opens the draft of a procedure that was just created, on the same screen.
async function showTheDraft() {
  render(<ProcedureList />);
  await screen.findAllByRole('listitem');
  await userEvent.type(screen.getByRole('textbox', { name: 'Título' }), 'Cierre de caja');
  await userEvent.click(screen.getByRole('button', { name: 'Crear procedimiento' }));
  await screen.findByRole('heading', { level: 2, name: 'Borrador' });
  await screen.findByRole('button', { name: 'Guardar cambios' });
}

// Changes the title of the draft and saves it.
async function saveANewTitle() {
  const title = screen.getByRole('textbox', { name: 'Título' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Cierre nuevo');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
}

// Spec 015, D27 (E30): a second procedure can be created without reloading the page.
describe('"+ Crear otro procedimiento"', () => {
  test('is above the draft and brings back an empty form', async () => {
    await showTheDraft();

    await userEvent.click(screen.getByRole('button', { name: '+ Crear otro procedimiento' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Crear un procedimiento' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('');
    expect(screen.queryByRole('heading', { level: 2, name: 'Borrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Crear otro procedimiento' })).not.toBeInTheDocument();
  });

  test('is not there while the form to create is shown', async () => {
    render(<ProcedureList />);
    await screen.findAllByRole('listitem');

    expect(screen.queryByRole('button', { name: '+ Crear otro procedimiento' })).not.toBeInTheDocument();
  });

  test('asks the list again', async () => {
    await showTheDraft();
    const asked = mocks.listProcedures.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: '+ Crear otro procedimiento' }));

    expect(mocks.listProcedures).toHaveBeenCalledTimes(asked + 1);
  });
});

// Spec 015, D28 (E31 and E32): the list below follows the draft, and never goes back to "Cargando".
describe('the list while the draft changes', () => {
  test('after saving the changes of the draft, it asks again and shows the new answer', async () => {
    await showTheDraft();
    const asked = mocks.listProcedures.mock.calls.length;
    const changed = listItem({ version: { ...listItem().version, title: 'Cierre nuevo' } });
    mocks.listProcedures.mockResolvedValue(listPage([changed]));

    await saveANewTitle();

    expect(await screen.findByRole('heading', { level: 3, name: 'Cierre nuevo' })).toBeVisible();
    expect(mocks.listProcedures).toHaveBeenCalledTimes(asked + 1);
  });

  test('while it asks again, the cards stay and it does not say "Cargando"', async () => {
    await showTheDraft();
    mocks.listProcedures.mockReturnValue(new Promise(() => undefined));

    await saveANewTitle();

    await screen.findByText('Cambios guardados.');
    expect(screen.getByRole('heading', { level: 3, name: 'Cierre de caja' })).toBeVisible();
    expect(screen.queryByText('Cargando procedimientos…')).not.toBeInTheDocument();
  });

  test('after publishing, it asks again', async () => {
    await showTheDraft();
    const asked = mocks.listProcedures.mock.calls.length;

    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, publicar' }));

    await vi.waitFor(() => expect(mocks.listProcedures.mock.calls.length).toBeGreaterThan(asked));
  });
});
