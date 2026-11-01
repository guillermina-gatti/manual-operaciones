'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import { logoutSession } from '@/lib/session/real-session';

export function SessionControls() {
  const router = useRouter();
  const { user, status } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leaving = useRef(false);

  async function onLogout() {
    if (leaving.current) return;
    leaving.current = true;
    setPending(true);
    setError(null);
    try {
      await logoutSession();
      router.replace('/login');
    } catch {
      // A-08b ya limpió el JWT en memoria, pero no podemos asegurar revocación remota.
      setError('Se cerró la sesión local, pero no pudimos confirmar el cierre en el servidor.');
    } finally {
      leaving.current = false;
      setPending(false);
    }
  }

  if (!REAL_AUTH_ENABLED) return null;

  return (
    <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <nav aria-label="Sesión" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/documentos" className="font-bold">PispIAr · Manual de operaciones</Link>
        {status === 'loading' ? (
          <span role="status">Comprobando sesión…</span>
        ) : user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span>Hola, <strong>{user.name}</strong> · {user.role}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => void onLogout()}
              className="min-h-11 rounded-md border border-zinc-400 px-3 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {pending ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
        ) : (
          <Link href="/login" className="font-medium text-blue-700 underline dark:text-blue-300">
            Iniciar sesión
          </Link>
        )}
      </nav>
      {error && <p role="alert" className="mx-auto mt-2 max-w-6xl text-sm text-red-700 dark:text-red-300">{error}</p>}
    </header>
  );
}
