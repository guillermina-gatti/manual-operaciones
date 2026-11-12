import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthClientError } from '@/lib/auth/auth-client';
import type { ValidateInvitationResponse } from '@/lib/auth/auth-client';
import { RegisterForm } from '@/components/session/RegisterForm';

const mocks = vi.hoisted(() => ({
  registerSession: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  return {
    ...actual,
    REAL_AUTH_ENABLED: true,
    useSession: mocks.useSession,
  };
});

vi.mock('@/lib/session/real-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session/real-session')>();
  return {
    ...actual,
    registerSession: mocks.registerSession,
  };
});

const DEFAULT_INVITATION: ValidateInvitationResponse = {
  valid: true,
  email: 'invitado@example.com',
  role: 'EMPLOYEE',
};

const TOKEN = 'valid-invitation-token-43-chars-long-abc';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
  mocks.registerSession.mockResolvedValue({ id: 'id-123', name: 'Ada Lovelace', role: 'EMPLOYEE' });
});

describe('HU29: M5.2 - RegisterForm', () => {
  describe('estructura y datos iniciales', () => {
    test('muestra el email de la invitación en modo de solo lectura y el rol asignado', () => {
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      const emailInput = screen.getByLabelText('Correo electrónico');
      expect(emailInput).toHaveValue('invitado@example.com');
      expect(emailInput).toBeDisabled();
      expect(emailInput).toHaveAttribute('aria-readonly', 'true');

      expect(screen.getByText('Empleado')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Completar registro' })).toBeDisabled();
    });

    test('muestra correctamente las etiquetas de rol para ADMIN, SUPERVISOR y EMPLOYEE', () => {
      const { rerender } = render(
        <RegisterForm token={TOKEN} invitation={{ ...DEFAULT_INVITATION, role: 'ADMIN' }} />,
      );
      expect(screen.getByText('Administrador')).toBeInTheDocument();

      rerender(
        <RegisterForm token={TOKEN} invitation={{ ...DEFAULT_INVITATION, role: 'SUPERVISOR' }} />,
      );
      expect(screen.getByText('Supervisor')).toBeInTheDocument();

      rerender(
        <RegisterForm token={TOKEN} invitation={{ ...DEFAULT_INVITATION, role: 'EMPLOYEE' }} />,
      );
      expect(screen.getByText('Empleado')).toBeInTheDocument();
    });

    test('muestra las áreas asignadas si la invitación las incluye', () => {
      render(
        <RegisterForm
          token={TOKEN}
          invitation={{
            ...DEFAULT_INVITATION,
            areas: [
              { id: 'area-1', name: 'Operaciones' },
              { id: 'area-2', name: 'Logística' },
            ],
          }}
        />,
      );

      expect(screen.getByText('Áreas asignadas')).toBeInTheDocument();
      expect(screen.getByText('Operaciones')).toBeInTheDocument();
      expect(screen.getByText('Logística')).toBeInTheDocument();
    });
  });

  describe('validaciones de campos', () => {
    test('el botón permanece deshabilitado si el nombre tiene menos de 2 caracteres tras trim', async () => {
      const user = userEvent.setup();
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), ' A ');
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-segura-123');

      expect(screen.getByRole('button', { name: 'Completar registro' })).toBeDisabled();
    });

    test('el botón permanece deshabilitado si el nombre supera los 100 caracteres', async () => {
      const user = userEvent.setup();
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'A'.repeat(101));
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-segura-123');

      expect(screen.getByRole('button', { name: 'Completar registro' })).toBeDisabled();
    });

    test('el botón permanece deshabilitado si la contraseña tiene menos de 8 caracteres', async () => {
      const user = userEvent.setup();
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'Ada Lovelace');
      await user.type(screen.getByLabelText('Contraseña'), '1234567');
      await user.type(screen.getByLabelText('Confirmar contraseña'), '1234567');

      expect(screen.getByRole('button', { name: 'Completar registro' })).toBeDisabled();
    });

    test('el botón permanece deshabilitado si las contraseñas no coinciden', async () => {
      const user = userEvent.setup();
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'Ada Lovelace');
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-diferente-123');

      expect(screen.getByRole('button', { name: 'Completar registro' })).toBeDisabled();
    });
  });

  describe('registro exitoso', () => {
    test('envía name.trim() a registerSession, limpia contraseñas y redirige a /documentos', async () => {
      const user = userEvent.setup();
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), '   Ada Lovelace   ');
      const passInput = screen.getByLabelText('Contraseña');
      const confirmInput = screen.getByLabelText('Confirmar contraseña');
      await user.type(passInput, 'clave-segura-123');
      await user.type(confirmInput, 'clave-segura-123');

      const submitButton = screen.getByRole('button', { name: 'Completar registro' });
      expect(submitButton).toBeEnabled();
      await user.click(submitButton);

      await waitFor(() =>
        expect(mocks.registerSession).toHaveBeenCalledWith(
          TOKEN,
          'Ada Lovelace',
          'clave-segura-123',
        ),
      );

      // Limpieza de campos de contraseña en DOM
      expect(passInput).toHaveValue('');
      expect(confirmInput).toHaveValue('');

      // Redirección por defecto
      expect(mocks.replace).toHaveBeenCalledWith('/documentos');
    });

    test('respeta el parámetro returnTo sanitizado si está presente en la URL', async () => {
      const user = userEvent.setup();
      mocks.searchParams = new URLSearchParams('returnTo=/documentos/doc-123');
      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'Ada Lovelace');
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-segura-123');
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/documentos/doc-123'));
    });
  });

  describe('prevención de doble envío', () => {
    test('doble click rápido ejecuta una sola llamada a registerSession', async () => {
      const user = userEvent.setup();
      let resolveRegister!: () => void;
      mocks.registerSession.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRegister = () => resolve({ id: 'id-1', name: 'Ada', role: 'EMPLOYEE' });
        }),
      );

      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'Ada Lovelace');
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-segura-123');

      const submitButton = screen.getByRole('button', { name: 'Completar registro' });
      await user.click(submitButton);
      // Segundo click inmediato mientras pending/sending están activos
      await user.click(submitButton);

      expect(mocks.registerSession).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Creando cuenta…' })).toBeDisabled();

      resolveRegister();
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/documentos'));
    });
  });

  describe('manejo de errores', () => {
    test('ante un AuthClientError muestra el mensaje seguro del cliente en un alert accesible', async () => {
      const user = userEvent.setup();
      mocks.registerSession.mockRejectedValueOnce(
        new AuthClientError(410, 'La invitación ya fue utilizada o expiró.'),
      );

      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'Ada Lovelace');
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-segura-123');
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('La invitación ya fue utilizada o expiró.');
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    test('ante un error desconocido muestra mensaje genérico sin exponer detalles internos', async () => {
      const user = userEvent.setup();
      mocks.registerSession.mockRejectedValueOnce(new Error('Internal database exception 0xdeadbeef'));

      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      await user.type(screen.getByLabelText('Nombre completo'), 'Ada Lovelace');
      await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-segura-123');
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No pudimos completar el registro. Intentá nuevamente.');
      expect(alert).not.toHaveTextContent('deadbeef');
    });
  });

  describe('manejo de sesión activa y carga', () => {
    test('si ya existe una sesión autenticada con ready, muestra aviso y enlace sin renderizar el formulario', () => {
      mocks.useSession.mockReturnValue({
        user: { id: 'u1', name: 'Grace Hopper', role: 'ADMIN' },
        status: 'ready',
      });

      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      expect(screen.getByText(/Ya ingresaste como/)).toBeInTheDocument();
      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a documentos' })).toHaveAttribute(
        'href',
        '/documentos',
      );
      expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Completar registro' })).not.toBeInTheDocument();
    });

    test('muestra estado de carga accesible si la sesión se está preparando', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'loading' });

      render(<RegisterForm token={TOKEN} invitation={DEFAULT_INVITATION} />);

      expect(screen.getByRole('status')).toHaveTextContent('Preparando sesión…');
      expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
    });
  });
});
