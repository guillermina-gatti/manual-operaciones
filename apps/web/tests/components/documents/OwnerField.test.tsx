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
// Habilitado y con opciones: con currentOwner (spec 008), el responsable actual ya es una opción
// antes de que lleguen los candidatos, así que contar opciones solo no alcanza.
const waitForCandidates = () =>
  waitFor(() => {
    expect(select()).toBeEnabled();
    expect(within(select()).getAllByRole('option').length).toBeGreaterThan(1);
  });

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

  test('al desmarcar todas las áreas, la elección se conserva y vuelve "Elegí primero las áreas"', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');

    await user.click(screen.getByRole('button', { name: 'Sin áreas' }));

    expect(select()).toBeDisabled();
    expect(screen.getByText('Elegí primero las áreas')).toBeInTheDocument();
    expect(screen.getByTestId('responsable')).toHaveTextContent(FIXTURE_USERS.supervisorVentas.id);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('E4 pasando por "sin áreas": de Ventas a ninguna y después a Operaciones, se borra con el aviso', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');

    await user.click(screen.getByRole('button', { name: 'Sin áreas' }));
    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));

    await waitFor(() => expect(screen.getByTestId('responsable')).toHaveTextContent('ninguno'));
    expect(select()).toHaveAccessibleDescription(NOTICE);
  });

  test('de Ventas a ninguna y de vuelta a Ventas, el responsable sigue elegido', async () => {
    const user = userEvent.setup();
    render(<Harness initialAreas={[AREA_IDS.ventas]} />);
    await waitForCandidates();
    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');

    await user.click(screen.getByRole('button', { name: 'Sin áreas' }));
    await user.click(screen.getByRole('button', { name: 'Solo Ventas' }));
    await waitForCandidates();

    expect(select()).toHaveValue(FIXTURE_USERS.supervisorVentas.id);
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

// Spec 008 (T11; F4, F6; PD9): al cambiar las áreas, el responsable actual se conserva aunque esté
// inactivo o no sea candidato. Las áreas que recibe OwnerField son solo las activas (PD10).
describe('responsable actual (spec 008)', () => {
  const ANA_INACTIVA = {
    id: '0b000000-0000-4000-8000-000000000098',
    name: 'Ana Pérez',
    isActive: false,
  };
  const INACTIVE_HINT = 'Para elegir otro responsable, marcá al menos un área activa';

  function EditHarness({
    currentOwner = ANA_INACTIVA,
    initialAreas = [AREA_IDS.ventas] as string[],
  }) {
    const [areaIds, setAreaIds] = useState<string[]>(initialAreas);
    const [onlyInactive, setOnlyInactive] = useState(false);
    const [owner, setOwner] = useState(currentOwner.id);
    const [error, setError] = useState<string | undefined>();
    return (
      <>
        <OwnerField
          areaIds={areaIds}
          value={owner}
          error={error}
          currentOwner={currentOwner}
          onlyInactiveAreas={onlyInactive}
          onChange={(id, message) => {
            setOwner(id);
            setError(message);
          }}
        />
        <p data-testid="responsable">{owner || 'ninguno'}</p>
        <button type="button" onClick={() => setAreaIds([AREA_IDS.operaciones])}>
          Solo Operaciones
        </button>
        <button
          type="button"
          onClick={() => {
            setAreaIds([]);
            setOnlyInactive(true);
          }}
        >
          Solo inactivas
        </button>
      </>
    );
  }

  test('E19: el responsable inactivo aparece elegido, con "(inactivo)"', async () => {
    render(<EditHarness />);
    await waitForCandidates();

    expect(select()).toHaveValue(ANA_INACTIVA.id);
    expect(optionNames()).toContain('Ana Pérez (inactivo)');
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('E19: al cambiar las áreas y llegar los candidatos, no se borra', async () => {
    const user = userEvent.setup();
    render(<EditHarness />);
    await waitForCandidates();

    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));
    await waitFor(() => expect(optionNames()).toContain('Emilio Empleado de Operaciones (Empleado)'));

    expect(screen.getByTestId('responsable')).toHaveTextContent(ANA_INACTIVA.id);
    expect(select()).toHaveValue(ANA_INACTIVA.id);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('P5: el responsable actual activo que deja de ser candidato tampoco se borra', async () => {
    const user = userEvent.setup();
    const sergio = { id: FIXTURE_USERS.supervisorVentas.id, name: 'Sergio Supervisor de Ventas', isActive: true };
    render(<EditHarness currentOwner={sergio} />);
    await waitForCandidates();

    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));
    await waitFor(() => expect(optionNames()).toContain('Emilio Empleado de Operaciones (Empleado)'));

    expect(select()).toHaveValue(sergio.id);
    expect(optionNames()).toContain('Sergio Supervisor de Ventas');
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('E20: se puede elegir otro, y un candidato elegido que deja de serlo sí se borra (PD9)', async () => {
    const user = userEvent.setup();
    render(<EditHarness />);
    await waitForCandidates();

    await user.selectOptions(select(), 'Sergio Supervisor de Ventas (Supervisor)');
    expect(screen.getByTestId('responsable')).toHaveTextContent(FIXTURE_USERS.supervisorVentas.id);

    await user.click(screen.getByRole('button', { name: 'Solo Operaciones' }));

    await waitFor(() => expect(screen.getByTestId('responsable')).toHaveTextContent('ninguno'));
    expect(select()).toHaveAccessibleDescription(NOTICE);
    // El responsable actual sigue entre las opciones, para volver a elegirlo.
    expect(optionNames()).toContain('Ana Pérez (inactivo)');
  });

  test('E21: sin áreas activas, no pide candidatos, conserva al actual y lo explica', async () => {
    const user = userEvent.setup();
    render(<EditHarness />);
    await waitForCandidates();
    mocks.listOwnerCandidates.mockClear();

    await user.click(screen.getByRole('button', { name: 'Solo inactivas' }));

    expect(screen.getByText(INACTIVE_HINT)).toBeInTheDocument();
    expect(screen.queryByText('Elegí primero las áreas')).not.toBeInTheDocument();
    expect(select()).toHaveValue(ANA_INACTIVA.id);
    expect(mocks.listOwnerCandidates).not.toHaveBeenCalled();
  });
});
