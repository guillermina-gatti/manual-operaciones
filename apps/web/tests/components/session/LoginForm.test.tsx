import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthClientError } from '@/lib/auth/auth-client';
import { LoginForm } from '@/components/session/LoginForm';

const mocks = vi.hoisted(() => ({
  loginSession: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/session', () => ({ REAL_AUTH_ENABLED: true, useSession: mocks.useSession }));
vi.mock('@/lib/session/real-session', () => ({ loginSession: mocks.loginSession }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
  mocks.loginSession.mockResolvedValue({ id: 'id', name: 'Ada', role: 'ADMIN' });
});

describe('A-09: pantalla de login real', () => {
  test('muestra campos accesibles y oculta la contraseña', () => {
    render(<LoginForm />);
    expect(screen.getByRole('textbox', { name: 'Correo electrónico' })).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
  });

  test('inicia sesión con los datos ingresados y dirige a Documentos', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), '  ada@example.com ');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-segura');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(mocks.loginSession).toHaveBeenCalledWith('ada@example.com', 'clave-segura'));
    expect(mocks.replace).toHaveBeenCalledWith('/documentos');
  });

  test('ante un 401 muestra el mensaje seguro y no navega', async () => {
    const user = userEvent.setup();
    mocks.loginSession.mockRejectedValueOnce(new AuthClientError(401, 'Correo o contraseña incorrectos.'));
    render(<LoginForm />);
    await user.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'ada@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  test('no expone un error interno inesperado', async () => {
    const user = userEvent.setup();
    mocks.loginSession.mockRejectedValueOnce(new Error('SQL connection string: password=test'));
    render(<LoginForm />);
    await user.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'ada@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos iniciar sesión.');
    expect(screen.queryByText(/SQL connection/)).not.toBeInTheDocument();
  });

  test('si ya está autenticado ofrece ir a Documentos sin formulario', () => {
    mocks.useSession.mockReturnValue({
      status: 'ready',
      user: { id: 'id', name: 'Ada Lovelace', role: 'ADMIN' },
    });
    render(<LoginForm />);
    expect(screen.getByText(/Ya ingresaste como/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a documentos' })).toHaveAttribute('href', '/documentos');
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });
});
