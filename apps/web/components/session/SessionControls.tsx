'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import { logoutSession } from '@/lib/session/real-session';

export function SessionControls({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      setError('Se cerró la sesión local, pero no pudimos confirmar el cierre en el servidor.');
    } finally {
      leaving.current = false;
      setPending(false);
    }
  }

  // Si está en /login o /registro, no se muestra el sidebar ni la barra superior
  const isAuthPage = pathname === '/login' || pathname === '/registro';
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Sin sesión activa
  if (!user) {
    if (status === 'loading') {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-[#646F6A]">
          <span role="status">Comprobando sesión…</span>
        </div>
      );
    }

    return (
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <nav aria-label="Sesión" className="mx-auto flex max-w-6xl items-center justify-between text-sm">
          <Link href="/documentos" className="font-bold">
            PispIAr · Manual de operaciones
          </Link>
          <Link href="/login" className="font-semibold text-[#0B4233] underline">
            Iniciar sesión
          </Link>
        </nav>
      </header>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#F6F7F6] text-[#1E2B27]">
      {/* Sidebar fijo en escritorio */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          user={user}
          onLogout={onLogout}
          pendingLogout={pending}
        />
      </div>

      {/* Drawer móvil con overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full w-64 max-w-[85vw] flex-col shadow-2xl">
            <Sidebar
              user={user}
              onLogout={() => {
                setMobileMenuOpen(false);
                void onLogout();
              }}
              pendingLogout={pending}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Área de contenido principal con barra superior */}
      <div className="flex flex-1 flex-col overflow-y-auto min-w-0">
        <TopBar
          user={user}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        {error && (
          <p role="alert" className="mx-4 mt-2 rounded-xl bg-[#FCE1E4] px-4 py-3 text-sm font-semibold text-[#B4232C]">
            {error}
          </p>
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
