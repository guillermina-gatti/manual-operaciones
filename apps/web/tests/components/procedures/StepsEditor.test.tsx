import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { StepsEditor } from '@/components/procedures/StepsEditor';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import {
  PROCEDURE_ID,
  STEP_A,
  STEP_B,
  STEP_C,
  VERSION_ID,
  stepResponse,
  editable,
} from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  addStep: vi.fn(),
  updateStep: vi.fn(),
  deleteStep: vi.fn(),
  reorderSteps: vi.fn(),
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  addStep: mocks.addStep,
  updateStep: mocks.updateStep,
  deleteStep: mocks.deleteStep,
  reorderSteps: mocks.reorderSteps,
}));

const step = (id: string, order: number, title: string, description = '') => ({
  id,
  order,
  title,
  description,
});

const THREE = editable({
  steps: [
    step(STEP_A, 1, 'Contar el efectivo'),
    step(STEP_B, 2, 'Contar los comprobantes', 'Tarjetas y transferencias'),
    step(STEP_C, 3, 'Comparar con el sistema'),
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addStep.mockResolvedValue(stepResponse(STEP_A, 1, 'Contar el efectivo'));
  mocks.updateStep.mockImplementation(
    (_p: string, _v: string, stepId: string, changes: { title?: string; description?: string }) =>
      Promise.resolve(stepResponse(stepId, 2, changes.title ?? 'Contar los comprobantes', changes.description ?? 'Tarjetas y transferencias')),
  );
  mocks.deleteStep.mockResolvedValue(undefined);
  mocks.reorderSteps.mockResolvedValue([
    stepResponse(STEP_B, 1, 'Contar los comprobantes', 'Tarjetas y transferencias'),
    stepResponse(STEP_A, 2, 'Contar el efectivo'),
    stepResponse(STEP_C, 3, 'Comparar con el sistema'),
  ]);
});

function setup(procedure = THREE) {
  const onChange = vi.fn();
  const onGone = vi.fn();
  render(<StepsEditor procedure={procedure} onChange={onChange} onGone={onGone} />);
  return { onChange, onGone };
}

const items = () => within(screen.getByRole('list', { name: 'Pasos' })).getAllByRole('listitem');
const stepButton = (verb: string, title: string) =>
  screen.getByRole('button', { name: `${verb} paso: ${title}` });
const addForm = () => screen.getByRole('form', { name: 'Agregar un paso' });
const addTitle = () => within(addForm()).getByRole('textbox', { name: 'Título del paso' });
const addDescription = () =>
  within(addForm()).getByRole('textbox', { name: 'Descripción del paso (opcional)' });
const addButton = () => within(addForm()).getByRole('button', { name: /Agregar paso|Agregando…/ });

describe('the list', () => {
  test('without steps it says so, and the form to add one is there', () => {
    setup(editable());

    expect(screen.getByText('Todavía no tiene pasos.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pasos' })).not.toBeInTheDocument();
    expect(addForm()).toBeInTheDocument();
  });

  test('shows the steps in order, with their description', () => {
    setup();

    expect(items()).toHaveLength(3);
    expect(within(items()[0]).getByRole('heading', { level: 3 })).toHaveTextContent('Paso 1: Contar el efectivo');
    expect(within(items()[1]).getByText('Tarjetas y transferencias')).toBeInTheDocument();
    expect(within(items()[2]).getByRole('heading', { level: 3 })).toHaveTextContent('Paso 3: Comparar con el sistema');
  });

  test('the first step cannot go up and the last cannot go down', () => {
    setup();

    expect(stepButton('Subir', 'Contar el efectivo')).toBeDisabled();
    expect(stepButton('Bajar', 'Contar el efectivo')).toBeEnabled();
    expect(stepButton('Subir', 'Comparar con el sistema')).toBeEnabled();
    expect(stepButton('Bajar', 'Comparar con el sistema')).toBeDisabled();
  });

  // The button has 20 px of padding on each side by default: without px-0! the 48 px square leaves the
  // icon 8 px, and a flex item shrinks, so it was drawn as a dash.
  test.each([
    ['Subir', 'text-bosque'],
    ['Bajar', 'text-bosque'],
    ['Borrar', 'text-peligro'],
  ])('the "%s" button draws its icon at full size and in its color', (verb, color) => {
    setup();

    const button = stepButton(verb, 'Contar los comprobantes');
    const icon = button.querySelector('svg');

    expect(button).toHaveClass('px-0!', color);
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('size-5', 'shrink-0');
  });

  test('does not call the API until something is done', () => {
    setup();

    expect(mocks.addStep).not.toHaveBeenCalled();
    expect(mocks.reorderSteps).not.toHaveBeenCalled();
  });
});

describe('adding a step', () => {
  test('an empty title is marked and nothing is sent', async () => {
    setup(editable());

    await userEvent.click(addButton());

    expect(within(addForm()).getByText('Escribí un título.')).toBeInTheDocument();
    expect(mocks.addStep).not.toHaveBeenCalled();
  });

  test('a description of 2001 characters is marked and nothing is sent', async () => {
    setup(editable());

    await userEvent.type(addTitle(), 'Contar el efectivo');
    await userEvent.click(addDescription());
    await userEvent.paste('a'.repeat(2001));
    await userEvent.click(addButton());

    expect(
      within(addForm()).getByText('La descripción puede tener hasta 2000 caracteres.'),
    ).toBeInTheDocument();
    expect(mocks.addStep).not.toHaveBeenCalled();
  });

  test('sends the title, without a position (at the end), and gives the new copy to the screen', async () => {
    const { onChange } = setup(editable());

    await userEvent.type(addTitle(), '  Contar el efectivo  ');
    await userEvent.click(addButton());

    expect(mocks.addStep).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, {
      title: 'Contar el efectivo',
    });
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: [{ id: STEP_A, order: 1, title: 'Contar el efectivo', description: '' }],
        }),
      ),
    );
  });

  test('sends the description when there is one, and clears the form', async () => {
    setup(editable());

    await userEvent.type(addTitle(), 'Contar el efectivo');
    await userEvent.type(addDescription(), 'Billetes y monedas');
    await userEvent.click(addButton());

    expect(mocks.addStep).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, {
      title: 'Contar el efectivo',
      description: 'Billetes y monedas',
    });
    await vi.waitFor(() => expect(addTitle()).toHaveValue(''));
    expect(addDescription()).toHaveValue('');
  });

  test('409 STEP_LIMIT_REACHED → the draft has 50 steps, and what was typed stays', async () => {
    mocks.addStep.mockRejectedValue(new ApiError(409, [], undefined, 'STEP_LIMIT_REACHED'));
    setup(editable());

    await userEvent.type(addTitle(), 'Contar el efectivo');
    await userEvent.click(addButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.stepLimit);
    expect(addTitle()).toHaveValue('Contar el efectivo');
  });

  test('with 50 steps there is no form to add one, and it says why', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => step(`1c000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, i + 1, `Paso ${i + 1}`));
    setup(editable({ steps: fifty }));

    expect(screen.getByText('El borrador ya tiene 50 pasos: es el máximo.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Agregar un paso' })).not.toBeInTheDocument();
  });
});

describe('editing a step', () => {
  const editButton = (title: string) => stepButton('Editar', title);
  const editForm = () => screen.getByRole('form', { name: 'Editar el paso' });

  test('opens the form with the step, in the place of the step', async () => {
    setup();

    await userEvent.click(editButton('Contar los comprobantes'));

    expect(within(editForm()).getByRole('textbox', { name: 'Título del paso' })).toHaveValue('Contar los comprobantes');
    expect(within(editForm()).getByRole('textbox', { name: 'Descripción del paso (opcional)' })).toHaveValue('Tarjetas y transferencias');
  });

  test('sends only what changed and gives the new copy to the screen', async () => {
    const { onChange } = setup();

    await userEvent.click(editButton('Contar los comprobantes'));
    const title = within(editForm()).getByRole('textbox', { name: 'Título del paso' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Contar los vouchers');
    await userEvent.click(within(editForm()).getByRole('button', { name: 'Guardar paso' }));

    expect(mocks.updateStep).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, STEP_B, {
      title: 'Contar los vouchers',
    });
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.arrayContaining([expect.objectContaining({ id: STEP_B, title: 'Contar los vouchers' })]),
        }),
      ),
    );
    await vi.waitFor(() => expect(screen.queryByRole('form', { name: 'Editar el paso' })).not.toBeInTheDocument());
  });

  test('without changes it closes and does not call the API', async () => {
    setup();

    await userEvent.click(editButton('Contar los comprobantes'));
    await userEvent.click(within(editForm()).getByRole('button', { name: 'Guardar paso' }));

    expect(mocks.updateStep).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.queryByRole('form', { name: 'Editar el paso' })).not.toBeInTheDocument());
  });

  test('"Cancelar" closes without saving', async () => {
    setup();

    await userEvent.click(editButton('Contar los comprobantes'));
    await userEvent.click(within(editForm()).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('form', { name: 'Editar el paso' })).not.toBeInTheDocument();
    expect(mocks.updateStep).not.toHaveBeenCalled();
  });

  test('an error keeps the form open with what was typed', async () => {
    mocks.updateStep.mockRejectedValue(new ApiError(409, [], undefined, 'VERSION_NOT_EDITABLE'));
    setup();

    await userEvent.click(editButton('Contar los comprobantes'));
    const title = within(editForm()).getByRole('textbox', { name: 'Título del paso' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Otro');
    await userEvent.click(within(editForm()).getByRole('button', { name: 'Guardar paso' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.versionNotEditable);
    expect(within(editForm()).getByRole('textbox', { name: 'Título del paso' })).toHaveValue('Otro');
  });
});

describe('deleting a step', () => {
  test('deletes it and the following steps move up in the copy', async () => {
    const { onChange } = setup();

    await userEvent.click(stepButton('Borrar', 'Contar el efectivo'));

    expect(mocks.deleteStep).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, STEP_A);
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: [
            expect.objectContaining({ id: STEP_B, order: 1 }),
            expect.objectContaining({ id: STEP_C, order: 2 }),
          ],
        }),
      ),
    );
  });

  test('a double click deletes only once, and every button waits meanwhile', async () => {
    let resolve!: (value: unknown) => void;
    mocks.deleteStep.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();

    await userEvent.dblClick(stepButton('Borrar', 'Contar el efectivo'));

    expect(mocks.deleteStep).toHaveBeenCalledTimes(1);
    expect(stepButton('Borrar', 'Comparar con el sistema')).toBeDisabled();
    expect(stepButton('Bajar', 'Contar el efectivo')).toBeDisabled();
    expect(addButton()).toBeDisabled();
    resolve(undefined);
  });
});

describe('moving a step', () => {
  test('moving the first one down asks the API for the whole list in the new order', async () => {
    const { onChange } = setup();

    await userEvent.click(stepButton('Bajar', 'Contar el efectivo'));

    expect(mocks.reorderSteps).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, [STEP_B, STEP_A, STEP_C]);
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: [
            expect.objectContaining({ id: STEP_B, order: 1 }),
            expect.objectContaining({ id: STEP_A, order: 2 }),
            expect.objectContaining({ id: STEP_C, order: 3 }),
          ],
        }),
      ),
    );
  });

  test('moving the last one up swaps it with the one before', async () => {
    setup();

    await userEvent.click(stepButton('Subir', 'Comparar con el sistema'));

    expect(mocks.reorderSteps).toHaveBeenCalledWith(PROCEDURE_ID, VERSION_ID, [STEP_A, STEP_C, STEP_B]);
  });

  test('400 → the steps changed, and the copy does not change', async () => {
    mocks.reorderSteps.mockRejectedValue(new ApiError(400));
    const { onChange } = setup();

    await userEvent.click(stepButton('Bajar', 'Contar el efectivo'));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.stepsChanged);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  test.each([
    [403, PROCEDURE_MESSAGES.noPermission],
    [503, 'El servicio no está disponible. Probá de nuevo en unos minutos.'],
    [401, 'Tu sesión no es válida. Volvé a ingresar.'],
  ])('%i → the message for the user', async (status, message) => {
    mocks.deleteStep.mockRejectedValue(new ApiError(status));
    setup();

    await userEvent.click(stepButton('Borrar', 'Contar el efectivo'));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  test('404 → it is not there anymore, and it can be taken off the list', async () => {
    mocks.deleteStep.mockRejectedValue(new ApiError(404));
    const { onGone } = setup();

    await userEvent.click(stepButton('Borrar', 'Contar el efectivo'));
    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.notFound);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar de la lista' }));
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  test('after an error the buttons work again', async () => {
    mocks.deleteStep.mockRejectedValueOnce(new ApiError(503));
    setup();

    await userEvent.click(stepButton('Borrar', 'Contar el efectivo'));
    await screen.findByRole('alert');
    await userEvent.click(stepButton('Borrar', 'Contar el efectivo'));

    expect(mocks.deleteStep).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

// With cacheComponents, Next hides the page with <Activity> instead of unmounting it.
describe('coming back to the screen (Activity)', () => {
  test('coming back does not show an old error or an open step form', async () => {
    mocks.deleteStep.mockRejectedValue(new ApiError(503));
    const screenOf = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <StepsEditor procedure={THREE} onChange={vi.fn()} onGone={vi.fn()} />
      </Activity>
    );
    const { rerender } = render(screenOf('visible'));
    await userEvent.click(stepButton('Borrar', 'Contar el efectivo'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(stepButton('Editar', 'Contar el efectivo'));

    rerender(screenOf('hidden'));
    rerender(screenOf('visible'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Editar el paso' })).not.toBeInTheDocument();
  });
});
