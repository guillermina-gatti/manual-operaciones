import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureEditor } from '@/components/procedures/ProcedureEditor';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import { AREAS } from '../../support/procedure-areas';
import {
  ANA,
  PROCEDURE_ID,
  STEP_A,
  VENTAS,
  procedureResponse,
  stepResponse,
  editable,
} from '../../support/procedures';
import { detailOf } from '../../support/procedure-view';
import { V1, V2, page, published, versionDetail, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAreas: vi.fn(),
  getProcedure: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  createVersionDraft: vi.fn(),
  addStep: vi.fn(),
  updateVersion: vi.fn(),
  publishVersion: vi.fn(),
  setAreas: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({ areasDirectory: { listAreas: mocks.listAreas } }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  getProcedure: mocks.getProcedure,
  listVersions: mocks.listVersions,
  getVersion: mocks.getVersion,
  createVersionDraft: mocks.createVersionDraft,
  addStep: mocks.addStep,
  updateVersion: mocks.updateVersion,
  publishVersion: mocks.publishVersion,
  setAreas: mocks.setAreas,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn() }),
}));

// What the API answers for the procedure: the draft 2, or the published version 1.
const serve = (procedure: ReturnType<typeof editable>) =>
  mocks.getProcedure.mockResolvedValue(detailOf(procedure));
const storedDraft = () => editable({ versionId: V2, versionNumber: 2 });
const storedPublished = () => editable({ versionId: V1, versionNumber: 1, status: 'PUBLISHED' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: PROCEDURE_ID };
  mocks.useSession.mockReturnValue(ANA);
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.listVersions.mockResolvedValue(page([versionItem(), published()]));
  mocks.getVersion.mockResolvedValue(versionDetail());
});

describe('the versions of the procedure (spec 015, R8)', () => {
  test('shows the section "Versiones" with the history of this procedure', async () => {
    serve(storedDraft());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('list', { name: 'Versiones' })).toBeInTheDocument();
    expect(mocks.listVersions).toHaveBeenCalledWith(PROCEDURE_ID, { limit: 100 }, expect.any(AbortSignal));
  });

  test('if the history fails, the draft is still there and the section says what happened', async () => {
    mocks.listVersions.mockRejectedValue(new ApiError(503));
    serve(storedDraft());
    render(<ProcedureEditor />);

    expect(await screen.findByText('No pudimos cargar las versiones.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
  });

  test('spec 015, R2: with the draft in the history it offers "Publicar"', async () => {
    serve(storedDraft());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear nueva versión' })).not.toBeInTheDocument();
  });

  test('the confirmation to publish names a replaced version only if one is published', async () => {
    mocks.listVersions.mockResolvedValue(page([versionItem({ id: V2 })]));
    serve(storedDraft());
    const { unmount } = render(<ProcedureEditor />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    expect(screen.getByRole('group', { name: 'Confirmar publicación' })).not.toHaveTextContent('reemplazada');
    unmount();

    mocks.listVersions.mockResolvedValue(page([versionItem(), published()]));
    render(<ProcedureEditor />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(screen.getByRole('group', { name: 'Confirmar publicación' })).toHaveTextContent(
      'La versión vigente pasa a reemplazada.',
    );
  });

  test('spec 015, R10: with two versions or more it offers to compare them; with one it does not', async () => {
    serve(storedDraft());
    const { unmount } = render(<ProcedureEditor />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Comparar versiones' })).toBeInTheDocument();
    unmount();

    mocks.listVersions.mockResolvedValue(page([versionItem()]));
    render(<ProcedureEditor />);
    await screen.findByRole('list', { name: 'Versiones' });

    expect(screen.queryByRole('heading', { name: 'Comparar versiones' })).not.toBeInTheDocument();
  });

  test('a procedure the API does not find does not ask for any history', async () => {
    mocks.getProcedure.mockRejectedValue(new ApiError(404));
    render(<ProcedureEditor />);

    await screen.findByText('No se encontró el procedimiento');
    expect(mocks.listVersions).not.toHaveBeenCalled();
  });
});

describe('when the draft changes, the history follows (spec 015, R8)', () => {
  const addAStep = async () => {
    const form = await screen.findByRole('form', { name: 'Agregar un paso' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Título del paso' }), 'Contar');
    await userEvent.click(within(form).getByRole('button', { name: 'Agregar paso' }));
  };

  beforeEach(() => {
    mocks.addStep.mockResolvedValue(stepResponse(STEP_A, 1, 'Contar'));
    mocks.listVersions
      .mockResolvedValueOnce(page([versionItem({ stepCount: 0 }), published()]))
      .mockResolvedValue(page([versionItem({ stepCount: 1 }), published()]));
  });

  test('a step added to the draft is counted in the timeline', async () => {
    serve(storedDraft());
    render(<ProcedureEditor />);
    expect(await screen.findByText('0 pasos')).toBeInTheDocument();

    await addAStep();

    expect(await screen.findByText('1 paso')).toBeInTheDocument();
    expect(mocks.listVersions).toHaveBeenCalledTimes(2);
  });

  test('a title saved in the draft asks the history again', async () => {
    mocks.updateVersion.mockResolvedValue({ ...procedureResponse().versions[0], title: 'Cierre nuevo' });
    serve(storedDraft());
    render(<ProcedureEditor />);
    await screen.findByText('0 pasos');

    const title = screen.getByRole('textbox', { name: 'Título' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Cierre nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await screen.findByText('Cambios guardados.');
    expect(mocks.listVersions).toHaveBeenCalledTimes(2);
  });

  test('the timeline stays on screen while it is asked again, with no loading flash', async () => {
    mocks.listVersions
      .mockReset()
      .mockResolvedValueOnce(page([versionItem({ stepCount: 0 }), published()]))
      .mockReturnValue(new Promise(() => {}));
    serve(storedDraft());
    render(<ProcedureEditor />);
    await screen.findByText('0 pasos');

    await addAStep();

    expect(mocks.listVersions).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('list', { name: 'Versiones' })).toBeInTheDocument();
    expect(screen.queryByText('Cargando las versiones…')).not.toBeInTheDocument();
  });
});

describe('an error of publishing does not outlive the change that fixes it (spec 015, R3)', () => {
  // Publishes the draft and waits for the error that the API answers.
  const failToPublish = async (reason: string) => {
    mocks.publishVersion.mockRejectedValue(new ApiError(409, [], undefined, reason));
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, publicar' }));
    return screen.findByRole('alert');
  };
  const publishError = () =>
    screen.queryByText(PROCEDURE_MESSAGES.noSteps) ?? screen.queryByText(PROCEDURE_MESSAGES.noAreas);

  test('NO_STEPS: it goes away when a step is added', async () => {
    mocks.addStep.mockResolvedValue(stepResponse(STEP_A, 1, 'Contar'));
    serve(storedDraft());
    render(<ProcedureEditor />);
    expect(await failToPublish('NO_STEPS')).toHaveTextContent('La versión no tiene pasos.');

    const form = screen.getByRole('form', { name: 'Agregar un paso' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Título del paso' }), 'Contar');
    await userEvent.click(within(form).getByRole('button', { name: 'Agregar paso' }));

    await waitFor(() => expect(publishError()).not.toBeInTheDocument());
  });

  test('NO_AREAS: it goes away when the areas are saved', async () => {
    mocks.setAreas.mockResolvedValue({ areaIds: [VENTAS] });
    serve({
      ...storedDraft(),
      steps: [{ id: STEP_A, order: 1, title: 'Contar', description: '' }],
    });
    render(<ProcedureEditor />);
    expect(await failToPublish('NO_AREAS')).toHaveTextContent('El procedimiento no tiene áreas.');

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ventas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar áreas' }));

    await waitFor(() => expect(publishError()).not.toBeInTheDocument());
  });

  test('it goes away when the title of the draft is saved', async () => {
    mocks.updateVersion.mockResolvedValue({ ...procedureResponse().versions[0], title: 'Cierre nuevo' });
    serve(storedDraft());
    render(<ProcedureEditor />);
    await failToPublish('NO_STEPS');

    const title = screen.getByRole('textbox', { name: 'Título' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Cierre nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(publishError()).not.toBeInTheDocument());
  });

  test('it stays while nothing changes', async () => {
    serve(storedDraft());
    render(<ProcedureEditor />);

    await failToPublish('NO_STEPS');
    await screen.findByRole('list', { name: 'Versiones' });

    expect(publishError()).toBeInTheDocument();
  });
});

describe('a version that is no longer a draft (spec 015, R6 and R7)', () => {
  beforeEach(() => {
    mocks.listVersions.mockResolvedValue(page([published()]));
  });

  test('is shown read-only: no fields to edit it, and the subtitle says its state', async () => {
    serve(storedPublished());
    render(<ProcedureEditor />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Versión 1 · Publicada' })).toBeInTheDocument();
    expect(screen.getByText('Versión 1 · publicada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Borrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Título' })).not.toBeInTheDocument();
  });

  test('"Crear nueva versión" shows the new draft, which can be edited and published', async () => {
    mocks.createVersionDraft.mockResolvedValue({ ...procedureResponse().versions[0], id: V2, versionNumber: 2 });
    mocks.getVersion.mockImplementation((_procedure: string, id: string) =>
      Promise.resolve(id === V2 ? versionDetail({ id: V2, versionNumber: 2, status: 'DRAFT' }) : versionDetail()),
    );
    serve(storedPublished());
    render(<ProcedureEditor />);
    const create = await screen.findByRole('button', { name: 'Crear nueva versión' });
    // From now on the history has the new draft too.
    mocks.listVersions.mockResolvedValue(page([versionItem(), published()]));

    await userEvent.click(create);

    expect(await screen.findByRole('heading', { level: 2, name: 'Borrador' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument();
  });
});
