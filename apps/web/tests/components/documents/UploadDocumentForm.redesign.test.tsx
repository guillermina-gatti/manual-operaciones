// Rediseño de la carga: título sugerido desde el archivo, zona para soltar con su ficha, atajos de la
// fecha de revisión y vista previa en vivo. Las validaciones y el envío los prueba UploadDocumentForm.test.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { UploadDocumentForm } from '@/components/documents/UploadDocumentForm';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { formatLongDate, shortcutDate } from '@/lib/documents/review-shortcuts';

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
const fileOf = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

const areas = createFakeAreasDirectory({ delayMs: 0 });
const users = createFakeUsersDirectory({ delayMs: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAreas.mockImplementation(() => areas.listAreas());
  mocks.listOwnerCandidates.mockImplementation((ids: string[]) => users.listOwnerCandidates(ids));
});

const setupUser = () => userEvent.setup({ applyAccept: false });
const fileInput = () => screen.getByLabelText('Archivo') as HTMLInputElement;
const titleInput = () => screen.getByLabelText('Título') as HTMLInputElement;
const dateInput = () => screen.getByLabelText('Fecha de revisión') as HTMLInputElement;
const preview = () => screen.getByRole('complementary', { name: 'Vista previa' });

async function renderForm() {
  render(<UploadDocumentForm />);
  await screen.findByRole('group', { name: 'Áreas' });
}

describe('título sugerido desde el nombre del archivo', () => {
  test('con el título vacío, se completa con la sugerencia', async () => {
    const user = setupUser();
    await renderForm();

    await user.upload(fileInput(), fileOf('manual-de-caja.pdf'));

    expect(titleInput()).toHaveValue('Manual de caja');
    expect(titleInput()).toHaveAccessibleDescription(
      'Sugerido a partir del nombre del archivo. Podés cambiarlo.',
    );
  });

  test('no pisa un título que escribió el usuario', async () => {
    const user = setupUser();
    await renderForm();

    await user.type(titleInput(), 'Cierre diario');
    await user.upload(fileInput(), fileOf('manual-de-caja.pdf'));

    expect(titleInput()).toHaveValue('Cierre diario');
    expect(screen.queryByText(/Sugerido a partir del nombre/)).not.toBeInTheDocument();
  });

  test('si no se editó, se actualiza al cambiar de archivo', async () => {
    const user = setupUser();
    await renderForm();

    await user.upload(fileInput(), fileOf('manual-de-caja.pdf'));
    await user.upload(fileInput(), fileOf('procedimiento_de_cierre.txt'));

    expect(titleInput()).toHaveValue('Procedimiento de cierre');
  });

  test('si se editó después de la sugerencia, ya no se actualiza', async () => {
    const user = setupUser();
    await renderForm();

    await user.upload(fileInput(), fileOf('manual-de-caja.pdf'));
    await user.type(titleInput(), ' (2026)');
    await user.upload(fileInput(), fileOf('procedimiento_de_cierre.txt'));

    expect(titleInput()).toHaveValue('Manual de caja (2026)');
  });

  test('si el usuario borra el título, el archivo siguiente lo vuelve a sugerir', async () => {
    const user = setupUser();
    await renderForm();

    await user.upload(fileInput(), fileOf('manual-de-caja.pdf'));
    await user.clear(titleInput());
    await user.upload(fileInput(), fileOf('procedimiento_de_cierre.txt'));

    expect(titleInput()).toHaveValue('Procedimiento de cierre');
  });
});

describe('zona para soltar el archivo', () => {
  test('el input real sigue con la etiqueta "Archivo", alcanzable con el teclado', async () => {
    const user = setupUser();
    await renderForm();

    expect(fileInput()).toHaveAttribute('type', 'file');
    expect(fileInput()).not.toHaveAttribute('tabindex', '-1');
    await user.tab();
    expect(fileInput()).toHaveFocus();
  });

  test('soltar un archivo muestra la ficha con su nombre, tamaño y "Quitar"', async () => {
    await renderForm();
    const zone = screen.getByText(/Arrastrá el archivo acá/).closest('div')!;

    fireEvent.drop(zone, { dataTransfer: { files: [fileOf('manual-de-caja.pdf', 2 * MB)] } });

    expect(await screen.findByText('manual-de-caja.pdf')).toHaveAttribute('title', 'manual-de-caja.pdf');
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar el archivo elegido' })).toBeInTheDocument();
    expect(titleInput()).toHaveValue('Manual de caja');
  });

  test('un .docx soltado muestra el error junto al campo', async () => {
    await renderForm();
    const zone = screen.getByText(/Arrastrá el archivo acá/).closest('div')!;

    fireEvent.drop(zone, { dataTransfer: { files: [fileOf('informe.docx')] } });

    expect(await screen.findByText('El archivo tiene que ser PDF, .txt o .md.')).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
  });

  test('"Quitar" vacía el input y saca la ficha', async () => {
    const user = setupUser();
    await renderForm();
    await user.upload(fileInput(), fileOf('manual.pdf'));

    await user.click(screen.getByRole('button', { name: 'Quitar el archivo elegido' }));

    expect(fileInput().files).toHaveLength(0);
    expect(screen.queryByText('manual.pdf')).not.toBeInTheDocument();
  });
});

describe('atajos de la fecha de revisión', () => {
  const shortcuts = () => screen.getByRole('group', { name: 'Revisar en' });

  test('"6 meses" pone la fecha en el campo, queda marcado y muestra la fecha en palabras', async () => {
    const user = setupUser();
    await renderForm();

    await user.click(within(shortcuts()).getByRole('button', { name: '6 meses' }));

    const expected = shortcutDate(6, new Date());
    expect(dateInput()).toHaveValue(expected);
    expect(within(shortcuts()).getByRole('button', { name: '6 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(`Se revisa el ${formatLongDate(expected)}.`)).toBeInTheDocument();
  });

  test('"Otra fecha" pone el foco en el campo y queda marcado', async () => {
    const user = setupUser();
    await renderForm();

    await user.click(within(shortcuts()).getByRole('button', { name: 'Otra fecha' }));

    expect(dateInput()).toHaveFocus();
    expect(within(shortcuts()).getByRole('button', { name: 'Otra fecha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('una fecha escrita a mano marca "Otra fecha"; una pasada no se anuncia', async () => {
    await renderForm();

    fireEvent.change(dateInput(), { target: { value: '2030-01-15' } });
    expect(within(shortcuts()).getByRole('button', { name: 'Otra fecha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Se revisa el 15 de enero de 2030.')).toBeInTheDocument();

    fireEvent.change(dateInput(), { target: { value: '2020-01-15' } });
    expect(screen.queryByText(/Se revisa el/)).not.toBeInTheDocument();
  });
});

describe('vista previa en vivo', () => {
  test('sin datos, textos de ejemplo', async () => {
    await renderForm();

    expect(within(preview()).getByText('Sin título')).toBeInTheDocument();
    expect(within(preview()).getByText('Sin áreas')).toBeInTheDocument();
    expect(within(preview()).getByText('Sin responsable')).toBeInTheDocument();
    expect(within(preview()).getByText('v1')).toBeInTheDocument();
  });

  test('muestra el tipo, el título, el área y el responsable a medida que se completan', async () => {
    const user = setupUser();
    await renderForm();

    await user.upload(fileInput(), fileOf('manual-de-caja.pdf'));
    await user.click(screen.getByRole('checkbox', { name: 'Ventas' }));
    const owner = screen.getByRole('combobox', { name: 'Responsable' });
    await waitFor(() => expect(owner).toBeEnabled());
    await user.selectOptions(owner, 'Sergio Supervisor de Ventas (Supervisor)');

    expect(preview().querySelector('svg text')).toHaveTextContent('PDF');
    expect(within(preview()).getByText('Manual de caja')).toBeInTheDocument();
    expect(within(preview()).getByText(/Actualizado recién · Ventas/)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(preview()).getByText('Responsable: Sergio Supervisor de Ventas'),
      ).toBeInTheDocument(),
    );
  });
});
