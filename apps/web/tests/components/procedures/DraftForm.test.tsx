import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DraftForm } from '@/components/procedures/DraftForm';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import { PROCEDURE_ID, VERSION_ID, procedureResponse, stored } from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  updateVersion: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  updateVersion: mocks.updateVersion,
  discardDraft: mocks.discardDraft,
}));

// What PATCH …/versions/:versionId answers.
const version = (title: string, description: string | null) => ({
  ...procedureResponse().versions[0],
  title,
  description,
});

const PROCEDURE = stored({ description: 'Al final del día' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateVersion.mockImplementation((_p: string, _v: string, changes: { title?: string; description?: string }) =>
    Promise.resolve(
      version(changes.title ?? 'Cierre de caja', changes.description ?? 'Al final del día'),
    ),
  );
  mocks.discardDraft.mockResolvedValue(undefined);
});

function setup(procedure = PROCEDURE) {
  const onChange = vi.fn();
  const onGone = vi.fn();
  render(<DraftForm procedure={procedure} onChange={onChange} onGone={onGone} />);
  return { onChange, onGone };
}

const titleField = () => screen.getByRole('textbox', { name: 'Título' });
const descriptionField = () => screen.getByRole('textbox', { name: 'Descripción (opcional)' });
const saveButton = () => screen.getByRole('button', { name: /Guardar cambios|Guardando…/ });
const discardButton = () => screen.getByRole('button', { name: 'Descartar borrador' });

async function retitle(title: string) {
  await userEvent.clear(titleField());
  await userEvent.type(titleField(), title);
}

describe('the form', () => {
  test('shows the title and description of the draft', () => {
    setup();

    expect(titleField()).toHaveValue('Cierre de caja');
    expect(descriptionField()).toHaveValue('Al final del día');
  });

  test('a draft without description has an empty field', () => {
    setup(stored({ description: null }));

    expect(descriptionField()).toHaveValue('');
  });
});

describe('saving', () => {
  test('without changes it says so and does not call the API', async () => {
    setup();

    await userEvent.click(saveButton());

    expect(screen.getByRole('status')).toHaveTextContent('No hay cambios para guardar.');
    expect(mocks.updateVersion).not.toHaveBeenCalled();
  });

  test('sends only the title when only the title changed', async () => {
    setup();

    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());

    expect(mocks.updateVersion).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, {
      title: 'Cierre y arqueo',
    });
  });

  test('sends only the description when only the description changed', async () => {
    setup();

    await userEvent.clear(descriptionField());
    await userEvent.type(descriptionField(), 'Con arqueo');
    await userEvent.click(saveButton());

    expect(mocks.updateVersion).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, {
      description: 'Con arqueo',
    });
  });

  test('a description that was emptied is sent as an empty text', async () => {
    setup();

    await userEvent.clear(descriptionField());
    await userEvent.click(saveButton());

    expect(mocks.updateVersion).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, { description: '' });
  });

  test('the spaces around the title are not sent', async () => {
    setup();

    await retitle('  Cierre y arqueo  ');
    await userEvent.click(saveButton());

    expect(mocks.updateVersion).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, {
      title: 'Cierre y arqueo',
    });
  });

  test('an empty title is marked and nothing is sent', async () => {
    setup();

    await userEvent.clear(titleField());
    await userEvent.click(saveButton());

    expect(screen.getByText('Escribí un título.')).toBeInTheDocument();
    expect(mocks.updateVersion).not.toHaveBeenCalled();
  });

  test('on success it gives the new copy to the screen and says so', async () => {
    const { onChange } = setup();

    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados.');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: PROCEDURE_ID,
        title: 'Cierre y arqueo',
        description: 'Al final del día',
      }),
    );
  });

  test('a double click saves only once and the button waits', async () => {
    let resolve!: (value: unknown) => void;
    mocks.updateVersion.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();

    await retitle('Cierre y arqueo');
    await userEvent.dblClick(saveButton());

    expect(mocks.updateVersion).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Guardando…');

    resolve(version('Cierre y arqueo', 'Al final del día'));
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});

describe('errors when saving', () => {
  test('409 VERSION_NOT_EDITABLE → the version is no longer a draft, and the data stays', async () => {
    mocks.updateVersion.mockRejectedValue(new ApiError(409, [], undefined, 'VERSION_NOT_EDITABLE'));
    const { onChange } = setup();

    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.versionNotEditable);
    expect(titleField()).toHaveValue('Cierre y arqueo');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('403 → only an administrator can', async () => {
    mocks.updateVersion.mockRejectedValue(new ApiError(403));
    setup();

    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.noPermission);
  });

  test('404 → it is not there anymore, and it can be taken off the list', async () => {
    mocks.updateVersion.mockRejectedValue(new ApiError(404));
    const { onGone } = setup();

    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.notFound);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar de la lista' }));
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  test('503 → unavailable, and saving again works', async () => {
    mocks.updateVersion.mockRejectedValueOnce(new ApiError(503));
    setup();

    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );

    await userEvent.click(saveButton());

    expect(mocks.updateVersion).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('discarding the draft', () => {
  test('asks first, and does not call the API yet', async () => {
    setup();

    await userEvent.click(discardButton());

    expect(screen.getByText(/¿Descartar el borrador\?/)).toBeInTheDocument();
    expect(mocks.discardDraft).not.toHaveBeenCalled();
  });

  test('"Cancelar" goes back and nothing is deleted', async () => {
    setup();

    await userEvent.click(discardButton());
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/¿Descartar el borrador\?/)).not.toBeInTheDocument();
    expect(mocks.discardDraft).not.toHaveBeenCalled();
  });

  test('confirming deletes the draft and leaves the screen', async () => {
    const { onGone } = setup();

    await userEvent.click(discardButton());
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));

    expect(mocks.discardDraft).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID);
    expect(await vi.waitFor(() => expect(onGone).toHaveBeenCalledTimes(1)));
  });

  test('a double click on confirm discards only once', async () => {
    let resolve!: (value: unknown) => void;
    mocks.discardDraft.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();

    await userEvent.click(discardButton());
    await userEvent.dblClick(screen.getByRole('button', { name: /Sí, descartar|Descartando…/ }));

    expect(mocks.discardDraft).toHaveBeenCalledTimes(1);
    resolve(undefined);
  });

  test('409 → the draft is not discarded and the screen stays', async () => {
    mocks.discardDraft.mockRejectedValue(new ApiError(409, [], undefined, 'VERSION_NOT_EDITABLE'));
    const { onGone } = setup();

    await userEvent.click(discardButton());
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.versionNotEditable);
    expect(onGone).not.toHaveBeenCalled();
    expect(discardButton()).toBeEnabled();
  });

  test('404 → it can be taken off the list', async () => {
    mocks.discardDraft.mockRejectedValue(new ApiError(404));
    const { onGone } = setup();

    await userEvent.click(discardButton());
    await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.notFound);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar de la lista' }));
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});

// With cacheComponents, Next hides the page with <Activity> instead of unmounting it.
describe('coming back to the screen (Activity)', () => {
  test('coming back does not show an old error or the question to discard', async () => {
    mocks.updateVersion.mockRejectedValue(new ApiError(503));
    const screenOf = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <DraftForm procedure={PROCEDURE} onChange={vi.fn()} onGone={vi.fn()} />
      </Activity>
    );
    const { rerender } = render(screenOf('visible'));
    await retitle('Cierre y arqueo');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(discardButton());

    rerender(screenOf('hidden'));
    rerender(screenOf('visible'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/¿Descartar el borrador\?/)).not.toBeInTheDocument();
  });
});
