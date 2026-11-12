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
      <p className="rounded-lg border p-4 text-sm">
        La autenticación real está desactivada en este entorno. Para probarla, configurá
        <code className="mx-1">NEXT_PUBLIC_REAL_AUTH=true</code> en
        <code className="mx-1">apps/web/.env.local</code> y reiniciá Next.js.
      </p>
    );
  }

  if (status === 'loading' && !pending) {
    return <p role="status">Preparando sesión…</p>;
  }

  if (user && status === 'ready') {
    return (
      <div className="space-y-3 text-center">
        <p>Ya ingresaste como <strong>{user.name}</strong>.</p>
        <Link className="text-blue-700 underline dark:text-blue-300" href="/documentos">
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
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
      <div>
        <label htmlFor="register-email" className="mb-2 block text-sm font-medium">
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
          className="min-h-11 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium">Rol asignado</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-400/30">
            {ROLE_LABELS[invitation.role]}
          </span>
        </div>
      </div>

      {invitation.areas && invitation.areas.length > 0 && (
        <div>
          <span className="mb-2 block text-sm font-medium">Áreas asignadas</span>
          <div className="flex flex-wrap gap-2">
            {invitation.areas.map((area) => {
              const label = typeof area === 'string' ? area : area.name;
              const key = typeof area === 'string' ? area : area.id;
              return (
                <span
                  key={key}
                  className="inline-flex items-center rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-500/10 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20"
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="register-name" className="mb-2 block text-sm font-medium">
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
          className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <label htmlFor="register-password" className="mb-2 block text-sm font-medium">
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
          className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Mínimo 8 caracteres.
        </p>
      </div>

      <div>
        <label htmlFor="register-confirm-password" className="mb-2 block text-sm font-medium">
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
          className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-11 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-500 dark:text-zinc-950"
      >
        {pending ? 'Creando cuenta…' : 'Completar registro'}
      </button>
    </form>
  );
}
