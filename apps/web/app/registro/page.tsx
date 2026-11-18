'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AmbientFeathers } from '@/components/home/AmbientFeathers';
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
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden bg-fondo px-4 py-8 text-texto sm:py-12">
      <AmbientFeathers />

      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-borde bg-blanco shadow-xl shadow-zinc-900/5 md:flex-row">
        {/* Columna izquierda: identidad PispIAr coherente con /login y la landing */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-bosque px-6 py-8 text-blanco select-none sm:px-8 md:w-[44%] md:py-10">
          <div className="flex flex-col gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-blanco/10 px-3 py-1.5 text-sm font-semibold tracking-tight text-blanco">
              <span>
                pisp<span className="text-naranja">IA</span>r
              </span>
              <span aria-hidden="true" className="text-chip-area">
                ·
              </span>
              <span className="font-normal text-salvia">Manual de operaciones</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-salvia/90">
              Activá tu cuenta y sumate al nido de conocimiento operativo de tu área.
            </p>
          </div>

          <div className="relative mt-6 hidden items-end justify-center pt-4 md:flex">
            <div
              aria-hidden="true"
              className="absolute bottom-0 h-18 w-40 rounded-t-full bg-barro"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-0 h-10 w-12 rounded-t-full bg-barro-puerta"
            />
            <Image
              src="/hornero-landing.png"
              alt="Hornero de pispIAr sobre su nido de barro"
              width={176}
              height={208}
              className="relative z-10 mb-5 h-40 w-auto object-contain drop-shadow-md"
              priority
            />
          </div>
        </div>

        {/* Columna derecha: formulario y estados de invitación */}
        <section className="flex flex-1 flex-col justify-center p-6 sm:p-10 md:w-[56%]">
          <div className="mb-6 space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-bosque sm:text-4xl">
              Registro de cuenta
            </h1>
            <p className="text-sm text-texto-suave">
              Completá tus datos para activar tu acceso al Manual de operaciones.
            </p>
          </div>
          <Suspense fallback={<p role="status" className="text-sm text-texto-suave">Cargando…</p>}>
            <RegistroContent />
          </Suspense>
        </section>
      </div>
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

    // Si la invitación ya fue validada, no reiniciar validación ante cambios de status durante el envío
    if (state.kind === 'valid') {
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
  }, [status, user, state.kind]);

  if (status === 'loading' && state.kind !== 'valid') {
    return (
      <div className="py-4 text-center text-sm text-texto-suave">
        <p role="status">Preparando sesión…</p>
      </div>
    );
  }

  if (status === 'ready' && user) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-texto">
          Ya ingresaste como <strong>{user.name}</strong>.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-bosque px-5 py-2.5 text-sm font-semibold text-blanco shadow-sm transition-colors hover:bg-bosque-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja"
          href="/documentos"
        >
          Ir a documentos
        </Link>
      </div>
    );
  }

  if (state.kind === 'initial' || state.kind === 'validating') {
    return (
      <div className="py-6 text-center text-sm text-texto-suave">
        <p role="status">Validando invitación…</p>
      </div>
    );
  }

  if (state.kind === 'invalid_link' || state.kind === 'validation_error') {
    return (
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-xl border border-peligro/25 bg-rosa-alerta p-4 text-sm text-rosa-alerta-texto"
        >
          {state.message}
        </p>
        <div className="text-center">
          <Link
            className="text-sm font-semibold text-bosque underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja"
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
