import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AreasField } from '@/components/documents/AreasField';
import { FileField } from '@/components/documents/FileField';

const MB = 1024 * 1024;
const fileOf = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

// applyAccept: false simula que el usuario elige "Todos los archivos" en el selector del sistema:
// el accept solo filtra la vista, no impide elegir otro tipo.
const setupUser = () => userEvent.setup({ applyAccept: false });

// Hace de formulario: guarda el archivo y el error, como lo hará UploadDocumentForm (T21).
function FileHarness({ apiError }: { apiError?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>(apiError);
  const [renders, setRenders] = useState(0);
  return (
    <>
      <FileField
        file={file}
        error={error}
        onChange={(chosen, chosenError) => {
          setFile(chosen);
          setError(chosenError);
        }}
      />
      <button type="button" onClick={() => setRenders((n) => n + 1)}>
        Volver a dibujar ({renders})
      </button>
    </>
  );
}

const fileInput = () => screen.getByLabelText('Archivo') as HTMLInputElement;

describe('FileField', () => {
  test('acepta .pdf, .txt y .md en el selector del sistema', () => {
    render(<FileHarness />);

    expect(fileInput()).toHaveAttribute('type', 'file');
    expect(fileInput()).toHaveAttribute('accept', '.pdf,.txt,.md');
  });

  test('E5: al elegir un .docx, el error aparece junto al campo', async () => {
    const user = setupUser();
    render(<FileHarness />);

    await user.upload(fileInput(), fileOf('manual.docx'));

    expect(fileInput()).toHaveAccessibleDescription(
      expect.stringContaining('El archivo tiene que ser PDF, .txt o .md.'),
    );
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
  });

  test('E5: al elegir un archivo de 11 MB, el error aparece junto al campo', async () => {
    const user = setupUser();
    render(<FileHarness />);

    await user.upload(fileInput(), fileOf('manual.pdf', 11 * MB));

    expect(screen.getByText('El archivo pesa más de 10 MB.')).toBeInTheDocument();
  });

  test('un archivo válido muestra su nombre y su tamaño, sin error', async () => {
    const user = setupUser();
    render(<FileHarness />);

    await user.upload(fileInput(), fileOf('manual-de-caja.pdf', 2 * MB));

    expect(screen.getByText('manual-de-caja.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(fileInput()).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('elegir un archivo válido después de uno inválido borra el error', async () => {
    const user = setupUser();
    render(<FileHarness />);

    await user.upload(fileInput(), fileOf('manual.docx'));
    await user.upload(fileInput(), fileOf('manual.pdf'));

    expect(screen.queryByText('El archivo tiene que ser PDF, .txt o .md.')).not.toBeInTheDocument();
  });

  test('un nombre largo con tildes se recorta y queda completo en title', async () => {
    const user = setupUser();
    const name =
      'instrucción-de-operación-para-la-recepción-y-verificación-de-mercadería-en-depósito.pdf';
    render(<FileHarness />);

    await user.upload(fileInput(), fileOf(name));

    const shown = screen.getByText(name);
    expect(shown).toHaveClass('truncate');
    expect(shown).toHaveAttribute('title', name);
  });

  test('si el formulario vuelve a dibujarse, el input conserva el archivo (F4)', async () => {
    const user = setupUser();
    const chosen = fileOf('manual.pdf');
    render(<FileHarness />);

    await user.upload(fileInput(), chosen);
    const input = fileInput();
    await user.click(screen.getByRole('button', { name: /Volver a dibujar/ }));
    await user.click(screen.getByRole('button', { name: /Volver a dibujar/ }));

    expect(fileInput()).toBe(input);
    expect(fileInput().files?.[0]).toBe(chosen);
    expect(screen.getByText('manual.pdf')).toBeInTheDocument();
  });

  test('muestra un error que llega de la API (415)', () => {
    render(<FileHarness apiError="El archivo no es un PDF, .txt o .md válido." />);

    expect(fileInput()).toHaveAccessibleDescription(
      expect.stringContaining('El archivo no es un PDF, .txt o .md válido.'),
    );
  });

  test('avisa el archivo elegido y su error al formulario', async () => {
    const user = setupUser();
    const onChange = vi.fn();
    const chosen = fileOf('manual.docx');
    render(<FileField file={null} onChange={onChange} />);

    await user.upload(fileInput(), chosen);

    expect(onChange).toHaveBeenCalledWith(chosen, 'El archivo tiene que ser PDF, .txt o .md.');
  });
});

const AREAS = [
  { id: '0a000000-0000-4000-8000-000000000001', name: 'Ventas', isActive: true },
  { id: '0a000000-0000-4000-8000-000000000002', name: 'Operaciones', isActive: true },
];

function AreasHarness({ error }: { error?: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <AreasField areas={AREAS} selected={selected} onChange={setSelected} error={error} />;
}

describe('AreasField', () => {
  test('una casilla por área, con su nombre, dentro del grupo "Áreas"', () => {
    render(<AreasHarness />);

    expect(screen.getByRole('group', { name: 'Áreas' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ventas' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Operaciones' })).not.toBeChecked();
  });

  test('marca y desmarca áreas', async () => {
    const user = userEvent.setup();
    render(<AreasHarness />);

    await user.click(screen.getByRole('checkbox', { name: 'Operaciones' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ventas' }));
    expect(screen.getByRole('checkbox', { name: 'Ventas' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Operaciones' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Ventas' }));
    expect(screen.getByRole('checkbox', { name: 'Ventas' })).not.toBeChecked();
  });

  test('avisa la lista nueva en el orden de las áreas', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AreasField areas={AREAS} selected={[AREAS[1].id]} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Ventas' }));

    expect(onChange).toHaveBeenCalledWith([AREAS[0].id, AREAS[1].id]);
  });

  test('muestra su error asociado al grupo', () => {
    render(<AreasHarness error="Elegí al menos un área." />);

    expect(screen.getByRole('group', { name: 'Áreas' })).toHaveAccessibleDescription(
      'Elegí al menos un área.',
    );
  });

  test('sin áreas disponibles muestra el mensaje correspondiente', () => {
  render(<AreasField areas={[]} selected={[]} onChange={vi.fn()} />);

  expect(screen.getByText('No hay áreas disponibles')).toBeInTheDocument();
});
});
