'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuthClientError, validateInvitation } from '@/lib/auth/auth-client';
import type { ValidateInvitationResponse } from '@/lib/auth/auth-client';
import { useSession } from '@/lib/session';
import { RegisterForm } from '@/components/session/RegisterForm';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

type RegistroState =
  | { kind: 'initial' }
  | { kind: 'invalid_link'; message: string }
  | { kind: 'validating' }
  | { kind: 'validation_error'; message: string }
  | { kind: 'valid'; token: string; invitation: ValidateInvitationResponse };

export default function RegistroPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 p-6 shadow-sm sm:p-8 dark:border-zinc-800">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">PispIAr</p>
          <h1 className="text-3xl font-bold tracking-tight">Registro de cuenta</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Completá tus datos para activar tu acceso al Manual de operaciones.
          </p>
        </div>
        <Suspense fallback={<p role="status">Cargando…</p>}>
          <RegistroContent />
        </Suspense>
      </section>
    </main>
  );
}

function RegistroContent() {
  const { user, status } = useSession();
  const [state, setState] = useState<RegistroState>({ kind: 'initial' });
  const tokenRef = useRef<string | null>(null);
  const validationPromiseRef = useRef<Promise<ValidateInvitationResponse> | null>(null);

  useEffect(() => {
    document.title = 'Completar registro · Manual de operaciones';
  }, []);

  useEffect(() => {
    // Si la sesión está cargando, esperar antes de iniciar la validación
    if (status === 'loading') {
      return;
    }

    // Si ya existe una sesión autenticada con ready, no validar la invitación
    if (status === 'ready' && user) {
      return;
    }

    let cancelled = false;

    // 1 y 2. Leer hash y extraer token (o reutilizar token ya extraído en tokenRef ante Strict Mode)
    let tokenCandidate = tokenRef.current;
    if (!tokenCandidate && typeof window !== 'undefined') {
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      const parsed = hashParams.get('token');
      if (parsed) {
        tokenCandidate = parsed;
        tokenRef.current = parsed;
      }
    }

    // 3. Limpiar el hash de la URL inmediatamente (conservando ruta y search params)
    if (typeof window !== 'undefined' && window.location.hash) {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', cleanUrl);
    }

    // 4 y 5: Validar formato del token y consultar al backend en tarea asíncrona (reutilizando promesa en Strict Mode)
    void (async () => {
      if (!tokenCandidate || !TOKEN_REGEX.test(tokenCandidate)) {
        if (cancelled) return;
        setState({
          kind: 'invalid_link',
          message: 'El enlace de invitación es inválido o se encuentra incompleto.',
        });
        return;
      }

      if (cancelled) return;
      setState({ kind: 'validating' });

      try {
        if (!validationPromiseRef.current) {
          validationPromiseRef.current = validateInvitation(tokenCandidate);
        }
        const response = await validationPromiseRef.current;
        if (cancelled) return;
        setState({
          kind: 'valid',
          token: tokenCandidate,
          invitation: response,
        });
      } catch (cause) {
        if (cancelled) return;
        const message =
          cause instanceof AuthClientError
            ? cause.message
            : 'No pudimos validar la invitación. Intentá nuevamente.';
        setState({
          kind: 'validation_error',
          message,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user]);

  if (status === 'loading') {
    return (
      <div className="text-center">
        <p role="status">Preparando sesión…</p>
      </div>
    );
  }

  if (status === 'ready' && user) {
    return (
      <div className="space-y-3 text-center">
        <p>
          Ya ingresaste como <strong>{user.name}</strong>.
        </p>
        <Link className="text-blue-700 underline dark:text-blue-300" href="/documentos">
          Ir a documentos
        </Link>
      </div>
    );
  }

  if (state.kind === 'initial' || state.kind === 'validating') {
    return (
      <div className="text-center py-6">
        <p role="status">Validando invitación…</p>
      </div>
    );
  }

  if (state.kind === 'invalid_link' || state.kind === 'validation_error') {
    return (
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {state.message}
        </p>
        <div className="text-center">
          <Link
            className="text-sm text-blue-700 underline dark:text-blue-300"
            href="/login"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return <RegisterForm token={state.token} invitation={state.invitation} />;
}
