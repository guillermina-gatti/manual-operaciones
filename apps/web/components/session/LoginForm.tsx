'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthClientError } from '@/lib/auth/auth-client';
import { REAL_AUTH_ENABLED, sanitizeReturnTo, useSession } from '@/lib/session';
import { loginSession } from '@/lib/session/real-session';

function MailIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function LockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function EyeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
      const target = sanitizeReturnTo(searchParams.get('returnTo'));
      router.replace(target);
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
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        El login real está desactivado en este entorno. Para probarlo, configurá
        <code className="mx-1 rounded bg-zinc-200 px-1 py-0.5 text-xs">NEXT_PUBLIC_REAL_AUTH=true</code> en
        <code className="mx-1 rounded bg-zinc-200 px-1 py-0.5 text-xs">apps/web/.env.local</code> y reiniciá Next.js.
      </p>
    );
  }

  if (status === 'loading' && !pending) {
    return <p role="status" className="text-sm text-zinc-500">Preparando sesión…</p>;
  }

  if (user && status === 'ready') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-zinc-700">Ya ingresaste como <strong>{user.name}</strong>.</p>
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-[#0B4233] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083327]"
          href="/documentos"
        >
          Ir a documentos
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Correo electrónico
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
            <MailIcon className="h-5 w-5" />
          </div>
          <input
            id="login-email"
            type="email"
            name="email"
            placeholder="elena@empresa.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-[#0B4233] focus:outline-none focus:ring-1 focus:ring-[#0B4233] disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Contraseña
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
            <LockIcon className="h-5 w-5" />
          </div>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-11 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-[#0B4233] focus:outline-none focus:ring-1 focus:ring-[#0B4233] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 transition hover:text-zinc-600 focus:outline-none"
          >
            {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 text-xs sm:text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-600">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-[#0B4233] focus:ring-[#0B4233]"
          />
          <span>Recordarme</span>
        </label>
        <Link href="#recuperar" className="font-medium text-[#C04A18] hover:underline">
          ¿La olvidaste?
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 border border-red-200">
          {error}
        </p>
      )}

      <button
        className="min-h-11 w-full rounded-xl bg-[#0B4233] px-4 font-semibold text-white shadow-sm transition hover:bg-[#083327] disabled:opacity-60 flex items-center justify-center gap-2"
        type="submit"
        aria-label="Iniciar sesión"
        disabled={pending || email.trim().length === 0 || password.length === 0}
      >
        {pending ? (
          'Ingresando…'
        ) : (
          <>
            <span>Ingresar</span>
            <span aria-hidden="true">&rarr;</span>
          </>
        )}
      </button>

      <p className="pt-2 text-center text-xs text-zinc-500">
        ¿Te llegó una invitación?{' '}
        <Link href="/registro" className="font-semibold text-[#0B4233] hover:underline">
          Activá tu cuenta
        </Link>
      </p>
    </form>
  );
}
