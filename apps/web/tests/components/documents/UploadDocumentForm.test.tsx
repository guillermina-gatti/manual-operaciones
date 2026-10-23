import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { UploadDocumentForm } from '@/components/documents/UploadDocumentForm';
import { ApiError } from '@/lib/api';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';

const mocks = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  push: vi.fn(),
  listAreas: vi.fn(),
  listOwnerCandidates: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  uploadDocument: mocks.uploadDocument,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
  usersDirectory: { listOwnerCandidates: mocks.listOwnerCandidates, getNames: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const MB = 1024 * 1024;
const NEW_ID = '33333333-3333-4333-8333-333333333333';
const REVIEW_DATE = '2030-01-15';
const fileOf = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

const areas = createFakeAreasDirectory({ delayMs: 0 });
const users = createFakeUsersDirectory({ delayMs: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAreas.mockImplementation(() => areas.listAreas());
  mocks.listOwnerCandidates.mockImplementation((ids: string[]) => users.listOwnerCandidates(ids));
  mocks.uploadDocument.mockResolvedValue({ id: NEW_ID });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// applyAccept: false = el usuario elige "Todos los archivos" en el selector del sistema.
const setupUser = () => userEvent.setup({ applyAccept: false });

const submitButton = () => screen.getByRole('button', { name: /Cargar documento|Cargando…/ });
const fileInput = () => screen.getByLabelText('Archivo') as HTMLInputElement;
const titleInput = () => screen.getByLabelText('Título');
const dateInput = () => screen.getByLabelText('Fecha de revisión') as HTMLInputElement;
const ownerSelect = () => screen.getByRole('combobox', { name: 'Responsable' });

async function renderForm() {
  render(<UploadDocumentForm />);
  await screen.findByRole('group', { name: 'Áreas' });
}

// Completa todos los campos con datos válidos.
async function fillValid(user: ReturnType<typeof setupUser>, file = fileOf('manual.pdf', 2 * MB)) {
  await user.upload(fileInput(), file);
  await user.type(titleInput(), 'Manual de caja');
  await user.click(screen.getByRole('checkbox', { name: 'Ventas' }));
  await waitFor(() => expect(ownerSelect()).toBeEnabled());
  await user.selectOptions(ownerSelect(), 'Sergio Supervisor de Ventas (Supervisor)');
  fireEvent.change(dateInput(), { target: { value: REVIEW_DATE } });
  return file;
}

describe('carga correcta', () => {
  test('E1: con todos los campos válidos y un PDF de 2 MB, envía los valores y va al detalle', async () => {
    const user = setupUser();
    await renderForm();
    const file = await fillValid(user);

    await user.click(submitButton());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/documentos/${NEW_ID}`));
    expect(mocks.uploadDocument).toHaveBeenCalledWith({
      file,
      title: 'Manual de caja',
      description: '',
      areaIds: [AREA_IDS.ventas],
      ownerId: FIXTURE_USERS.supervisorVentas.id,
      reviewDate: REVIEW_DATE,
    });
  });

  test('D4: después de una carga correcta, el formulario queda vacío', async () => {
    const user = setupUser();
    await renderForm();
    await fillValid(user);

    await user.click(submitButton());
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());

    expect(titleInput()).toHaveValue('');
    expect(fileInput().files).toHaveLength(0);
    expect(screen.getByRole('checkbox', { name: 'Ventas' })).not.toBeChecked();
    expect(dateInput()).toHaveValue('');
  });
});

describe('validación antes de enviar (F2)', () => {
  test('E5: con un .docx no se llama a uploadDocument', async () => {
    const user = setupUser();
    await renderForm();
    await fillValid(user, fileOf('manual.docx'));

    await user.click(submitButton());

    expect(screen.getByText('El archivo tiene que ser PDF, .txt o .md.')).toBeInTheDocument();
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });

  test('con varios campos inválidos muestra todos los errores y pone el foco en el primero', async () => {
    const user = setupUser();
    await renderForm();

    await user.click(submitButton());

    expect(screen.getByText('Elegí un archivo.')).toBeInTheDocument();
    expect(screen.getByText('Escribí un título.')).toBeInTheDocument();
    expect(screen.getByText('Elegí al menos un área.')).toBeInTheDocument();
    expect(screen.getByText('Elegí un responsable.')).toBeInTheDocument();
    expect(screen.getByText('Elegí la fecha de revisión.')).toBeInTheDocument();
    expect(fileInput()).toHaveFocus();
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });

  test('después del primer intento, el error de un campo se va al corregirlo', async () => {
    const user = setupUser();
    await renderForm();
    await user.click(submitButton());
    expect(screen.getByText('Escribí un título.')).toBeInTheDocument();

    await user.type(titleInput(), 'Manual de caja');

    expect(screen.queryByText('Escribí un título.')).not.toBeInTheDocument();
    expect(screen.getByText('Elegí un archivo.')).toBeInTheDocument();
  });

  test('la fecha de revisión tiene como mínimo mañana en Buenos Aires', async () => {
    await renderForm();

    expect(dateInput()).toHaveAttribute('type', 'date');
    expect(dateInput()).toHaveAttribute('min', tomorrowIn(COMPANY_TIME_ZONE, new Date()));
  });

  test('la descripción es opcional y muestra cuántos caracteres lleva', async () => {
    const user = setupUser();
    await renderForm();

    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Hola');

    expect(screen.getByText('4/1000')).toBeInTheDocument();
  });
});

describe('un solo envío (F5)', () => {
  test('mientras sube, el botón queda deshabilitado con "Cargando…"', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockReturnValue(new Promise(() => {}));
    await renderForm();
    await fillValid(user);

    await user.click(submitButton());

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Cargando…');
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
  });

  test('dos envíos que llegan antes de que React vuelva a dibujar hacen una sola llamada', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockReturnValue(new Promise(() => {}));
    await renderForm();
    await fillValid(user);
    const button = submitButton();

    act(() => {
      button.click();
      button.click();
    });

    expect(mocks.uploadDocument).toHaveBeenCalledTimes(1);
  });

  test('si la carga falla, el botón se vuelve a habilitar y se muestra el error', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(new ApiError(503));
    await renderForm();
    await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByText(/Probá de nuevo en unos minutos/)).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('salir del formulario (F14)', () => {
  test('no registra beforeunload y "Cancelar" vuelve a Documentos', async () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    await renderForm();

    expect(addListener.mock.calls.map(([type]) => type)).not.toContain('beforeunload');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/documentos');
  });
});

describe('áreas (plan 5.2)', () => {
  test('mientras llegan las áreas, cargando', () => {
    mocks.listAreas.mockReturnValue(new Promise(() => {}));
    render(<UploadDocumentForm />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  test('si fallan las áreas, mensaje y "Reintentar" vuelve a pedirlas', async () => {
    const user = setupUser();
    mocks.listAreas.mockRejectedValueOnce(new Error('sin conexión'));
    render(<UploadDocumentForm />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar las áreas.');

    await user.click(within(alert.parentElement!).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('group', { name: 'Áreas' })).toBeInTheDocument();
  });
});

describe('errores de la API (F3) sin perder nada (F4)', () => {
  const EXISTING_ID = '44444444-4444-4444-8444-444444444444';

  // Todo lo completado sigue igual, incluido el mismo archivo en el mismo input.
  function expectEverythingKept(file: File) {
    expect(fileInput().files?.[0]).toBe(file);
    expect(screen.getByText('manual.pdf')).toBeInTheDocument();
    expect(titleInput()).toHaveValue('Manual de caja');
    expect(screen.getByRole('checkbox', { name: 'Ventas' })).toBeChecked();
    expect(ownerSelect()).toHaveValue(FIXTURE_USERS.supervisorVentas.id);
    expect(dateInput()).toHaveValue(REVIEW_DATE);
  }

  test('E6: con 409, el mensaje, el enlace al documento existente y todo lo completado', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(
      new ApiError(409, ['Ya hay un documento vigente con el mismo archivo'], EXISTING_ID),
    );
    await renderForm();
    const file = await fillValid(user);
    const input = fileInput();

    await user.click(submitButton());

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Ya existe un documento con este mismo archivo.');
    expect(within(banner).getByRole('link', { name: 'Ver el documento existente' })).toHaveAttribute(
      'href',
      `/documentos/${EXISTING_ID}`,
    );
    expect(fileInput()).toBe(input);
    expectEverythingKept(file);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('E7: con 503, "Probá de nuevo en unos minutos", todo sigue y un segundo envío vuelve a llamar', async () => {
    const user = setupUser();
    mocks.uploadDocument
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce({ id: NEW_ID });
    await renderForm();
    const file = await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );
    expectEverythingKept(file);

    await user.click(submitButton());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/documentos/${NEW_ID}`));
    expect(mocks.uploadDocument).toHaveBeenCalledTimes(2);
    expect(mocks.uploadDocument.mock.calls[1][0].file).toBe(file);
  });

  test('400 con "ownerId: …": el error junto al responsable, con el foco ahí', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(
      new ApiError(400, ['ownerId: el responsable no comparte ningún área con el documento']),
    );
    await renderForm();
    const file = await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisá los datos marcados en el formulario.',
    );
    expect(ownerSelect()).toHaveAccessibleDescription(
      'El responsable tiene que pertenecer a alguna de las áreas elegidas, o ser administrador.',
    );
    await waitFor(() => expect(ownerSelect()).toHaveFocus());
    expectEverythingKept(file);
  });

  test('400 sin un campo reconocible: el aviso general', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(new ApiError(400, ['property foo should not exist']));
    await renderForm();
    await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá los datos del formulario.');
  });

  test.each([
    [413, 'El archivo pesa más de 10 MB.'],
    [415, 'El archivo no es un PDF, .txt o .md válido.'],
  ])('%i: el error junto al archivo, y el archivo sigue elegido', async (status, message) => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(new ApiError(status));
    await renderForm();
    const file = await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá el archivo elegido.');
    expect(fileInput()).toHaveAccessibleDescription(expect.stringContaining(message));
    expectEverythingKept(file);
  });

  test('el error de la API junto al archivo se va al elegir otro archivo', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(new ApiError(415));
    await renderForm();
    await fillValid(user);
    await user.click(submitButton());
    await screen.findByText('El archivo no es un PDF, .txt o .md válido.');

    await user.upload(fileInput(), fileOf('otro.pdf'));

    expect(screen.queryByText('El archivo no es un PDF, .txt o .md válido.')).not.toBeInTheDocument();
  });

  test('403: "No tenés permiso para cargar documentos."', async () => {
    const user = setupUser();
    mocks.uploadDocument.mockRejectedValue(new ApiError(403, ['Forbidden resource']));
    await renderForm();
    const file = await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tenés permiso para cargar documentos.',
    );
    expectEverythingKept(file);
  });
});
