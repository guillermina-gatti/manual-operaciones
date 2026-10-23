import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DevSessionSwitcher } from '@/components/session/DevSessionSwitcher';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import { SessionProvider, SIM_SESSION_KEY, useSession } from '@/lib/session';

// Muestra quién es el usuario de la sesión, para comprobar que el selector la cambia.
function CurrentUser() {
  const { user } = useSession();
  return <p data-testid="usuario-actual">{user ? user.name : 'nadie'}</p>;
}

function renderSwitcher() {
  return render(
    <SessionProvider>
      <CurrentUser />
      <DevSessionSwitcher />
    </SessionProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('en producción', () => {
  test('no se renderiza nada, aunque haya un usuario de prueba guardado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    localStorage.setItem(SIM_SESSION_KEY, FIXTURE_USERS.admin.id);

    const { container } = render(
      <SessionProvider>
        <DevSessionSwitcher />
      </SessionProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Elegí un usuario de prueba')).not.toBeInTheDocument();
  });
});

describe('en desarrollo', () => {
  test('lista "Sin sesión" y los usuarios de los fixtures con su rol', () => {
    renderSwitcher();

    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual([
      'Sin sesión',
      'Ana Administradora (Administrador)',
      'Sergio Supervisor de Ventas (Supervisor)',
      'Elena Empleada de Ventas (Empleado)',
      'Sofía Supervisora de Operaciones (Supervisor)',
      'Emilio Empleado de Operaciones (Empleado)',
    ]);
  });

  test('sin usuario elegido muestra "Elegí un usuario de prueba"', () => {
    renderSwitcher();

    expect(screen.getByText('Elegí un usuario de prueba')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Usuario de prueba' })).toHaveValue('');
  });

  test('elegir un usuario escribe sim-session y actualiza useSession', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Usuario de prueba' }),
      'Elena Empleada de Ventas (Empleado)',
    );

    expect(localStorage.getItem(SIM_SESSION_KEY)).toBe(FIXTURE_USERS.empleadoVentas.id);
    expect(screen.getByTestId('usuario-actual')).toHaveTextContent('Elena Empleada de Ventas');
    expect(screen.queryByText('Elegí un usuario de prueba')).not.toBeInTheDocument();
  });

  test('muestra elegido el usuario que ya estaba guardado', () => {
    localStorage.setItem(SIM_SESSION_KEY, FIXTURE_USERS.admin.id);

    renderSwitcher();

    expect(screen.getByRole('combobox', { name: 'Usuario de prueba' })).toHaveValue(
      FIXTURE_USERS.admin.id,
    );
  });

  test('elegir "Sin sesión" borra sim-session', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SIM_SESSION_KEY, FIXTURE_USERS.admin.id);
    renderSwitcher();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Usuario de prueba' }),
      'Sin sesión',
    );

    expect(localStorage.getItem(SIM_SESSION_KEY)).toBeNull();
    expect(screen.getByTestId('usuario-actual')).toHaveTextContent('nadie');
  });
});
