import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DevSessionSwitcher } from '@/components/session/DevSessionSwitcher';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import {
  SessionProvider,
  SIM_SESSION_KEY,
  getAuthHeaders,
  restoreSession,
  useSession,
} from '@/lib/session';
import { fakeAuthApi } from '../../support/session';
import type { FakeAuthApi } from '../../support/session';

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

const combobox = () => screen.getByRole('combobox', { name: 'Usuario de prueba' });

let api: FakeAuthApi;

beforeEach(async () => {
  localStorage.clear();
  api = fakeAuthApi();
  vi.stubGlobal('fetch', api.fetch);
  await restoreSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(combobox()).toHaveValue('');
  });

  test('elegir un usuario inicia sesión con la API y actualiza useSession', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(combobox(), 'Elena Empleada de Ventas (Empleado)');

    await waitFor(() =>
      expect(screen.getByTestId('usuario-actual')).toHaveTextContent('Elena Empleada de Ventas'),
    );
    expect(api.calls('/api/auth/login')).toHaveLength(1);
    expect(getAuthHeaders().Authorization).toMatch(/^Bearer /);
    expect(localStorage.getItem(SIM_SESSION_KEY)).toBe(FIXTURE_USERS.empleadoVentas.id);
    expect(screen.queryByText('Elegí un usuario de prueba')).not.toBeInTheDocument();
  });

  test('si el login falla, avisa en el selector', async () => {
    const user = userEvent.setup();
    api.fetch.mockImplementationOnce(async () => new Response('{}', { status: 503 }));
    renderSwitcher();

    await user.selectOptions(combobox(), 'Ana Administradora (Administrador)');

    expect(
      await screen.findByText(
        'No se pudo iniciar sesión. ¿Está levantada la API y cargado el seed de desarrollo?',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('usuario-actual')).toHaveTextContent('nadie');
  });

  test('muestra elegido el usuario que ya estaba guardado', async () => {
    localStorage.setItem(SIM_SESSION_KEY, FIXTURE_USERS.admin.id);
    await restoreSession();

    renderSwitcher();

    expect(combobox()).toHaveValue(FIXTURE_USERS.admin.id);
  });

  test('elegir "Sin sesión" hace logout y borra sim-session', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SIM_SESSION_KEY, FIXTURE_USERS.admin.id);
    await restoreSession();
    renderSwitcher();

    await user.selectOptions(combobox(), 'Sin sesión');

    await waitFor(() => expect(screen.getByTestId('usuario-actual')).toHaveTextContent('nadie'));
    expect(api.calls('/api/auth/logout')).toHaveLength(1);
    expect(localStorage.getItem(SIM_SESSION_KEY)).toBeNull();
    expect(getAuthHeaders()).toEqual({});
  });
});
