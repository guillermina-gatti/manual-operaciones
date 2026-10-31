'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthClientError } from '@/lib/auth/auth-client';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import { loginSession } from '@/lib/session/real-session';

export function LoginForm() {
  const router = useRouter();
  const { user, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      await loginSession(email.trim(), password);
      setPassword('');
      router.replace('/documentos');
    } catch (cause) {
      setError(
        cause instanceof AuthClientError
          ? cause.message
          : 'No pudimos iniciar sesión. Intentá nuevamente.',
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  if (!REAL_AUTH_ENABLED) {
    return (
      <p className="rounded-lg border p-4 text-sm">
        El login real está desactivado en este entorno. Para probarlo, configurá
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

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
      <div>
        <label htmlFor="login-email" className="mb-2 block text-sm font-medium">Correo electrónico</label>
        <input
          id="login-email"
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-2 block text-sm font-medium">Contraseña</label>
        <input
          id="login-password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          className="min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600"
        />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <button
        className="min-h-11 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-500 dark:text-zinc-950"
        type="submit"
        disabled={pending || email.trim().length === 0 || password.length === 0}
      >
        {pending ? 'Ingresando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
