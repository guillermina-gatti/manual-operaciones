'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthClientError } from '@/lib/auth/auth-client';
import type { ValidateInvitationResponse } from '@/lib/auth/auth-client';
import { REAL_AUTH_ENABLED, sanitizeReturnTo, useSession } from '@/lib/session';
import type { Role } from '@/lib/session';
import { registerSession } from '@/lib/session/real-session';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
};

export interface RegisterFormProps {
  token: string;
  invitation: ValidateInvitationResponse & {
    areas?: Array<{ id: string; name: string } | string>;
  };
}

export function RegisterForm({ token, invitation }: RegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useSession();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }
    if (trimmedName.length > 100) {
      setError('El nombre completo no puede superar los 100 caracteres.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    sending.current = true;
    setPending(true);
    setError(null);

    try {
      await registerSession(token, trimmedName, password);
      setPassword('');
      setConfirmPassword('');
      const target = sanitizeReturnTo(searchParams.get('returnTo'));
      router.replace(target);
    } catch (cause) {
      setError(
        cause instanceof AuthClientError
          ? cause.message
          : cause instanceof Error && cause.message.includes('sesión activa')
            ? cause.message
            : 'No pudimos completar el registro. Intentá nuevamente.',
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  if (!REAL_AUTH_ENABLED) {
    return (
      <p className="rounded-xl border border-borde bg-salvia p-4 text-sm text-texto">
        La autenticación real está desactivada en este entorno. Para probarla, configurá
        <code className="mx-1 rounded bg-blanco px-1 py-0.5 text-xs">NEXT_PUBLIC_REAL_AUTH=true</code> en
        <code className="mx-1 rounded bg-blanco px-1 py-0.5 text-xs">apps/web/.env.local</code> y reiniciá Next.js.
      </p>
    );
  }

  if (status === 'loading' && !pending) {
    return <p role="status" className="text-sm text-texto-suave">Preparando sesión…</p>;
  }

  if (user && status === 'ready') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-texto">Ya ingresaste como <strong>{user.name}</strong>.</p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-bosque px-5 py-2.5 text-sm font-semibold text-blanco shadow-sm transition-colors hover:bg-bosque-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja"
          href="/documentos"
        >
          Ir a documentos
        </Link>
      </div>
    );
  }

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 100;
  const isPasswordValid = password.length >= 8;
  const doPasswordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = !pending && isNameValid && isPasswordValid && doPasswordsMatch;

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="register-email" className="mb-1.5 block text-xs font-semibold tracking-wider text-texto-suave uppercase">
          Correo electrónico
        </label>
        <input
          id="register-email"
          type="email"
          name="email"
          value={invitation.email}
          disabled
          readOnly
          aria-readonly="true"
          className="min-h-11 w-full rounded-xl border border-borde bg-fondo px-3.5 text-sm text-texto-suave"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold tracking-wider text-texto-suave uppercase">Rol asignado</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-lg bg-salvia px-3 py-1 text-xs font-semibold text-bosque">
            {ROLE_LABELS[invitation.role]}
          </span>
        </div>
      </div>

      {invitation.areas && invitation.areas.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wider text-texto-suave uppercase">Áreas asignadas</span>
          <div className="flex flex-wrap gap-2">
            {invitation.areas.map((area) => {
              const label = typeof area === 'string' ? area : area.name;
              const key = typeof area === 'string' ? area : area.id;
              return (
                <span
                  key={key}
                  className="inline-flex items-center rounded-lg bg-chip-area px-2.5 py-1 text-xs font-semibold text-chip-area-texto"
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="register-name" className="mb-1.5 block text-xs font-semibold tracking-wider text-texto-suave uppercase">
          Nombre completo
        </label>
        <input
          id="register-name"
          type="text"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          className="min-h-11 w-full rounded-xl border border-borde bg-blanco px-3.5 text-sm text-texto transition focus:border-bosque focus:outline-none focus:ring-1 focus:ring-bosque disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="register-password" className="mb-1.5 block text-xs font-semibold tracking-wider text-texto-suave uppercase">
          Contraseña
        </label>
        <input
          id="register-password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          className="min-h-11 w-full rounded-xl border border-borde bg-blanco px-3.5 text-sm text-texto transition focus:border-bosque focus:outline-none focus:ring-1 focus:ring-bosque disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-texto-suave">
          Mínimo 8 caracteres.
        </p>
      </div>

      <div>
        <label htmlFor="register-confirm-password" className="mb-1.5 block text-xs font-semibold tracking-wider text-texto-suave uppercase">
          Confirmar contraseña
        </label>
        <input
          id="register-confirm-password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={pending}
          className="min-h-11 w-full rounded-xl border border-borde bg-blanco px-3.5 text-sm text-texto transition focus:border-bosque focus:outline-none focus:ring-1 focus:ring-bosque disabled:opacity-60"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-peligro/25 bg-rosa-alerta p-3 text-sm text-rosa-alerta-texto">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-12 w-full rounded-xl bg-bosque px-4 font-semibold text-blanco shadow-sm transition-[background-color,transform] hover:bg-bosque-hover active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja disabled:opacity-60"
      >
        {pending ? 'Creando cuenta…' : 'Completar registro'}
      </button>
    </form>
  );
}
