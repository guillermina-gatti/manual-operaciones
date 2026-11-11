import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CreateProcedureForm } from '@/components/procedures/CreateProcedureForm';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import { ANA, PROCEDURE_ID, procedureResponse } from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  createProcedure: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  createProcedure: mocks.createProcedure,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.useSession.mockReturnValue(ANA);
  mocks.createProcedure.mockResolvedValue(procedureResponse());
});

const titleField = () => screen.getByRole('textbox', { name: 'Título' });
const descriptionField = () => screen.getByRole('textbox', { name: 'Descripción (opcional)' });
const submitButton = () => screen.getByRole('button', { name: /Crear procedimiento|Creando…/ });

describe('the form', () => {
  test('has a title, an optional description and a button', () => {
    render(<CreateProcedureForm />);

    expect(titleField()).toBeInTheDocument();
    expect(descriptionField()).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  test('does not call the API until it is sent', () => {
    render(<CreateProcedureForm />);

    expect(mocks.createProcedure).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  test('an empty title is marked and nothing is sent', async () => {
    render(<CreateProcedureForm />);

    await userEvent.click(submitButton());

    expect(screen.getByText('Escribí un título.')).toBeInTheDocument();
    expect(titleField()).toHaveAccessibleDescription('Escribí un título.');
    expect(mocks.createProcedure).not.toHaveBeenCalled();
  });

  test('a title of only spaces is not valid', async () => {
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), '   ');
    await userEvent.click(submitButton());

    expect(screen.getByText('Escribí un título.')).toBeInTheDocument();
    expect(mocks.createProcedure).not.toHaveBeenCalled();
  });

  test('a title of 201 characters is marked and nothing is sent', async () => {
    render(<CreateProcedureForm />);

    await userEvent.click(titleField());
    await userEvent.paste('a'.repeat(201));
    await userEvent.click(submitButton());

    expect(screen.getByText('El título puede tener hasta 200 caracteres.')).toBeInTheDocument();
    expect(mocks.createProcedure).not.toHaveBeenCalled();
  });

  test('a description of 1001 characters is marked and nothing is sent', async () => {
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(descriptionField());
    await userEvent.paste('a'.repeat(1001));
    await userEvent.click(submitButton());

    expect(
      screen.getByText('La descripción puede tener hasta 1000 caracteres.'),
    ).toBeInTheDocument();
    expect(mocks.createProcedure).not.toHaveBeenCalled();
  });
});

describe('creating', () => {
  test('sends the title without the spaces around it and no description', async () => {
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), '  Cierre de caja  ');
    await userEvent.click(submitButton());

    expect(mocks.createProcedure).toHaveBeenCalledWith({ title: 'Cierre de caja' });
  });

  test('sends the description when there is one', async () => {
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.type(descriptionField(), 'Al final del día');
    await userEvent.click(submitButton());

    expect(mocks.createProcedure).toHaveBeenCalledWith({
      title: 'Cierre de caja',
      description: 'Al final del día',
    });
  });

  test('links to its draft, tells the list to ask again, and keeps nothing in the browser', async () => {
    const onCreated = vi.fn();
    render(<CreateProcedureForm onCreated={onCreated} />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(submitButton());

    expect(await screen.findByRole('status')).toHaveTextContent('Procedimiento creado.');
    expect(screen.getByRole('link', { name: 'Abrir el borrador' })).toHaveAttribute(
      'href',
      `/procedimientos/${PROCEDURE_ID}`,
    );
    expect(onCreated).toHaveBeenCalledOnce();
    expect(window.sessionStorage).toHaveLength(0);
  });

  test('clears the fields after creating', async () => {
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.type(descriptionField(), 'Al final del día');
    await userEvent.click(submitButton());
    await screen.findByRole('status');

    expect(titleField()).toHaveValue('');
    expect(descriptionField()).toHaveValue('');
  });

  test('a double click creates only one procedure and the button waits', async () => {
    let resolve!: (value: unknown) => void;
    mocks.createProcedure.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.dblClick(submitButton());

    expect(mocks.createProcedure).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Creando…');

    resolve(procedureResponse());
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});

describe('errors', () => {
  test('403 → only an administrator can, the list is not told and the data stays', async () => {
    const onCreated = vi.fn();
    mocks.createProcedure.mockRejectedValue(new ApiError(403));
    render(<CreateProcedureForm onCreated={onCreated} />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.noPermission);
    expect(titleField()).toHaveValue('Cierre de caja');
    expect(submitButton()).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test('401 → the session is not valid', async () => {
    mocks.createProcedure.mockRejectedValue(new ApiError(401));
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu sesión no es válida. Volvé a ingresar.',
    );
  });

  test('400 → asks to check the data', async () => {
    mocks.createProcedure.mockRejectedValue(new ApiError(400, ['title should not be empty']));
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá los datos del formulario.');
  });

  test('503 → unavailable, and sending again works', async () => {
    mocks.createProcedure.mockRejectedValueOnce(new ApiError(503));
    render(<CreateProcedureForm />);

    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );

    await userEvent.click(submitButton());

    expect(mocks.createProcedure).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent('Procedimiento creado.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// With cacheComponents, Next hides the page with <Activity> instead of unmounting it.
describe('coming back to the screen (Activity)', () => {
  const form = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <CreateProcedureForm />
    </Activity>
  );

  test('coming back does not show an old error or the old notice', async () => {
    mocks.createProcedure.mockRejectedValue(new ApiError(503));
    const { rerender } = render(form('visible'));
    await userEvent.type(titleField(), 'Cierre de caja');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(form('hidden'));
    rerender(form('visible'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });
});
