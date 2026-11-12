import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthClientError } from '@/lib/auth/auth-client';
import type { ValidateInvitationResponse } from '@/lib/auth/auth-client';
import RegistroPage from '@/app/registro/page';

const mocks = vi.hoisted(() => ({
  validateInvitation: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/lib/auth/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/auth-client')>();
  return {
    ...actual,
    validateInvitation: mocks.validateInvitation,
  };
});

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
    registerSession: vi.fn().mockResolvedValue({ id: 'u1', name: 'Ada', role: 'EMPLOYEE' }),
  };
});

const VALID_TOKEN_43 = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';

const VALID_INVITATION_RESPONSE: ValidateInvitationResponse = {
  valid: true,
  email: 'invitado@example.com',
  role: 'EMPLOYEE',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/registro');
  window.location.hash = '';
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
  mocks.validateInvitation.mockResolvedValue(VALID_INVITATION_RESPONSE);
});

describe('HU29: M5.3 - Página de Registro (/registro)', () => {
  describe('extracción y limpieza del token del hash', () => {
    test('el hash se elimina de la URL inmediatamente después de extraer el token', async () => {
      window.history.replaceState(null, '', '/registro#token=' + VALID_TOKEN_43);
      window.location.hash = '#token=' + VALID_TOKEN_43;
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      render(<RegistroPage />);

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/registro');
      await waitFor(() =>
        expect(mocks.validateInvitation).toHaveBeenCalledWith(VALID_TOKEN_43),
      );
    });

    test('los parámetros de consulta se conservan al limpiar el hash', async () => {
      window.history.replaceState(
        null,
        '',
        '/registro?returnTo=/documentos#token=' + VALID_TOKEN_43,
      );
      window.location.hash = '#token=' + VALID_TOKEN_43;
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      render(<RegistroPage />);

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/registro?returnTo=/documentos');
      await waitFor(() =>
        expect(mocks.validateInvitation).toHaveBeenCalledWith(VALID_TOKEN_43),
      );
    });

    test('la página no muestra el token de invitación en el DOM en ningún momento', async () => {
      window.history.replaceState(null, '', '/registro#token=' + VALID_TOKEN_43);
      window.location.hash = '#token=' + VALID_TOKEN_43;

      const { container } = render(<RegistroPage />);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument(),
      );

      expect(container.innerHTML).not.toContain(VALID_TOKEN_43);
    });
  });

  describe('validaciones de formato del enlace', () => {
    test('URL sin token en hash muestra error de enlace inválido y no llama al backend', () => {
      window.location.hash = '';

      render(<RegistroPage />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'El enlace de invitación es inválido o se encuentra incompleto.',
      );
      expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
        'href',
        '/login',
      );
      expect(mocks.validateInvitation).not.toHaveBeenCalled();
    });

    test('URL con token de menos de 43 caracteres no llama al backend y muestra error', () => {
      window.location.hash = '#token=token_demasiado_corto';

      render(<RegistroPage />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'El enlace de invitación es inválido o se encuentra incompleto.',
      );
      expect(mocks.validateInvitation).not.toHaveBeenCalled();
    });

    test('URL con caracteres no base64url no llama al backend y muestra error', () => {
      window.location.hash = '#token=' + 'A'.repeat(42) + '+'; // '+' no es base64url

      render(<RegistroPage />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'El enlace de invitación es inválido o se encuentra incompleto.',
      );
      expect(mocks.validateInvitation).not.toHaveBeenCalled();
    });
  });

  describe('estados de validación y ciclo de vida', () => {
    test('muestra estado de validación en curso mientras la petición está pendiente', async () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      const gate = deferred<ValidateInvitationResponse>();
      mocks.validateInvitation.mockReturnValueOnce(gate.promise);

      render(<RegistroPage />);

      expect(screen.getByRole('status')).toHaveTextContent('Validando invitación…');

      gate.resolve(VALID_INVITATION_RESPONSE);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument(),
      );
    });

    test('invitación expirada o consumida (410) muestra el mensaje seguro del backend y enlace a /login', async () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      mocks.validateInvitation.mockRejectedValueOnce(
        new AuthClientError(410, 'La invitación ya fue utilizada o expiró.'),
      );

      render(<RegistroPage />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('La invitación ya fue utilizada o expiró.');
      expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
        'href',
        '/login',
      );
    });

    test('límite de tasa excedido (429) muestra el mensaje seguro correspondiente', async () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      mocks.validateInvitation.mockRejectedValueOnce(
        new AuthClientError(429, 'Demasiados intentos. Por favor espere unos minutos antes de intentar nuevamente.'),
      );

      render(<RegistroPage />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Demasiados intentos');
    });

    test('error inesperado muestra mensaje genérico sin filtrar detalles técnicos', async () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      mocks.validateInvitation.mockRejectedValueOnce(
        new Error('Fatal database connection error at PostgreSQL 16'),
      );

      render(<RegistroPage />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No pudimos validar la invitación. Intentá nuevamente.');
      expect(alert).not.toHaveTextContent('PostgreSQL');
    });

    test('una respuesta tardía no actualiza el componente después del desmontaje', async () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      const gate = deferred<ValidateInvitationResponse>();
      mocks.validateInvitation.mockReturnValueOnce(gate.promise);

      const { unmount } = render(<RegistroPage />);

      expect(screen.getByRole('status')).toHaveTextContent('Validando invitación…');

      // Desmontamos el componente antes de que la respuesta resuelva
      unmount();

      // Resolvemos tardíamente: no debe provocar errores de setState en componente desmontado
      gate.resolve(VALID_INVITATION_RESPONSE);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    test('funciona correctamente bajo React StrictMode (doble montaje inicial con limpieza de hash)', async () => {
      window.history.replaceState(null, '', '/registro#token=' + VALID_TOKEN_43);
      window.location.hash = '#token=' + VALID_TOKEN_43;

      render(
        <StrictMode>
          <RegistroPage />
        </StrictMode>,
      );

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument(),
      );
      expect(mocks.validateInvitation).toHaveBeenCalledTimes(1);
      expect(mocks.validateInvitation).toHaveBeenCalledWith(VALID_TOKEN_43);
      expect(screen.getByLabelText('Correo electrónico')).toHaveValue('invitado@example.com');
      expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument();
      expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument();
    });
  });

  describe('gestión de sesión activa', () => {
    test('un usuario autenticado no dispara validateInvitation y muestra aviso con enlace a /documentos', () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      mocks.useSession.mockReturnValue({
        user: { id: 'u1', name: 'Grace Hopper', role: 'ADMIN' },
        status: 'ready',
      });

      render(<RegistroPage />);

      expect(mocks.validateInvitation).not.toHaveBeenCalled();
      expect(screen.getByText(/Ya ingresaste como/)).toBeInTheDocument();
      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a documentos' })).toHaveAttribute(
        'href',
        '/documentos',
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Completar registro' })).not.toBeInTheDocument();
    });

    test('si la sesión está cargando, espera antes de iniciar la validación', async () => {
      window.location.hash = '#token=' + VALID_TOKEN_43;
      mocks.useSession.mockReturnValue({
        user: null,
        status: 'loading',
      });

      const { rerender } = render(<RegistroPage />);

      expect(screen.getByRole('status')).toHaveTextContent('Preparando sesión…');
      expect(mocks.validateInvitation).not.toHaveBeenCalled();

      // Cuando la sesión finaliza y confirma que no hay usuario autenticado
      mocks.useSession.mockReturnValue({
        user: null,
        status: 'ready',
      });
      rerender(<RegistroPage />);

      await waitFor(() =>
        expect(mocks.validateInvitation).toHaveBeenCalledWith(VALID_TOKEN_43),
      );
    });
  });
});
