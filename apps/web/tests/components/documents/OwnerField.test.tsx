import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { OwnerField } from '@/components/documents/OwnerField';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';

// El directorio simulado de verdad (la regla de T07), sin demora.
const mocks = vi.hoisted(() => ({ listOwnerCandidates: vi.fn() }));
const realDirectory = createFakeUsersDirectory({ delayMs: 0 });

vi.mock('@/lib/directory', () => ({
  usersDirectory: { listOwnerCandidates: mocks.listOwnerCandidates, getNames: vi.fn() },
  areasDirectory: { listAreas: vi.fn() },
}));

const NOTICE = 'El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro';
const SIN_USUARIOS = '0a000000-0000-4000-8000-000000000099';

// Hace de formulario: guarda las áreas, el responsable y su error, como UploadDocumentForm (T21).
function Harness({ initialAreas = [] as string[], initialOwner = '' }) {
  const [areaIds, setAreaIds] = useState<string[]>(initialAreas);
  const [owner, setOwner] = useState(initialOwner);
  const [error, setError] = useState<string | undefined>();
  return (
    <>
      <OwnerField
        areaIds={areaIds}
        value={owner}
        error={error}
        onChange={(id, message) => {
          setOwner(id);
          setError(message);
        }}
      />
      <p data-testid="responsable">{owner || 'ninguno'}</p>
      <button type="button" onClick={() => setAreaIds([AREA_IDS.ventas])}>Solo Ventas</button>
      <button type="button" onClick={() => setAreaIds([AREA_IDS.operaciones])}>Solo Operaciones</button>
      <button type="button" onClick={() => setAreaIds([SIN_USUARIOS])}>Área sin usuarios</button>
      <button type="button" onClick={() => setAreaIds([])}>Sin áreas</button>
    </>
  );
}

const select = () => screen.getByRole('combobox', { name: 'Responsable' });
const optionNames = () =>
  within(select())
    .getAllByRole('option')
    .map((option) => option.textContent);
const waitForCandidates = () =>
  waitFor(() => expect(within(select()).getAllByRole('option').length).toBeGreaterThan(1));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listOwnerCandidates.mockImplementation((areaIds: string[]) =>
    realDirectory.listOwnerCandidates(areaIds),
  );
});

describe('sin áreas (D5)', () => {
  test('deshabilitado, con "Elegí primero las áreas", y sin pedir candidatos', () => {
    render(<Harness />);

    expect(select()).toBeDisabled();
    expect(screen.getByText('Elegí primero las áreas')).toBeInTheDocument();
    expect(mocks.listOwnerCandidates).not.toHaveBeenCalled();
  });
});

describe('candidatos (F11)', () => {
  test('E3: con Ventas no aparece el EMPLOYEE de Operaciones y sí los ADMIN', async () => {
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();

    expect(optionNames()).toEqual([
      'Elegí un responsable',
      'Ana Administradora (Administrador)',
      'Sergio Supervisor de Ventas (Supervisor)',
      'Elena Empleada de Ventas (Empleado)',
    ]);
    expect(optionNames()).not.toContain('Emilio Empleado de Operaciones (Empleado)');
    expect(select()).toBeEnabled();
  });

  test('un área sin usuarios muestra solo a los ADMIN (caso borde)', async () => {
    render(<Harness initialAreas={[SIN_USUARIOS]} />);
    await waitForCandidates();

    expect(optionNames()).toEqual(['Elegí un responsable', 'Ana Administradora (Administrador)']);
  });

  test('mientras llegan los candidatos, "Cargando responsables…" y deshabilitado', () => {
    mocks.listOwnerCandidates.mockReturnValue(new Promise(() => {}));
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);

    expect(select()).toBeDisabled();
    expect(screen.getByText('Cargando responsables…')).toBeInTheDocument();
  });

  test('elegir un candidato lo avisa al formulario', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();

    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');

    expect(screen.getByTestId('responsable')).toHaveTextContent(FIXTURE_USERS.supervisorVentas.id);
  });
});

describe('cambiar las áreas', () => {
  test('E4: el responsable de Ventas se borra al pasar a Operaciones, con el aviso', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');

    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));

    await waitFor(() => expect(screen.getByTestId('responsable')).toHaveTextContent('ninguno'));
    expect(select()).toHaveValue('');
    expect(select()).toHaveAccessibleDescription(NOTICE);
    expect(optionNames()).toContain('Emilio Empleado de Operaciones (Empleado)');
  });

  test('un responsable que sigue siendo válido (ADMIN) no se borra', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Ana Administradora (Administrador)');

    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));
    await waitFor(() => expect(optionNames()).toContain('Emilio Empleado de Operaciones (Empleado)'));

    expect(screen.getByTestId('responsable')).toHaveTextContent(FIXTURE_USERS.admin.id);
    expect(select()).toHaveValue(FIXTURE_USERS.admin.id);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('al elegir otro responsable después del aviso, el aviso desaparece', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');
    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));
    await screen.findByText(NOTICE);

    await user.selectOptions(select(), 'Emilio Empleado de Operaciones (Empleado)');

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('al desmarcar todas las áreas, la elección se borra y vuelve "Elegí primero las áreas"', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');

    await user.click(screen.getByRole('button', { name: 'Sin áreas' }));

    await waitFor(() => expect(screen.getByTestId('responsable')).toHaveTextContent('ninguno'));
    expect(select()).toBeDisabled();
    expect(screen.getByText('Elegí primero las áreas')).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('mientras llegan los candidatos nuevos, no se borra nada', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');
    mocks.listOwnerCandidates.mockReturnValue(new Promise(() => {}));

    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));

    expect(screen.getByTestId('responsable')).toHaveTextContent(FIXTURE_USERS.supervisorVentas.id);
  });
});

describe('error del directorio', () => {
  test('muestra el mensaje y "Reintentar" vuelve a pedir', async () => {
    const user = userEvent.setup();
    mocks.listOwnerCandidates.mockRejectedValueOnce(new Error('sin conexión'));
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);

    expect(await screen.findByText('No pudimos cargar la lista de responsables.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitForCandidates();
    expect(mocks.listOwnerCandidates).toHaveBeenCalledTimes(2);
  });
});
