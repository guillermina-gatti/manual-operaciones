'use client';

// Deja ver una pantalla solo a un rol (F1). Si el rol no corresponde, el contenido ni se monta:
// no arranca ni hace pedidos. No es la protección real: la API igual responde 403.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { ApiError, describeApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Role } from '@/lib/session';

interface RequireRoleProps {
  role: Role;
  // Lo que ve otro rol, por ejemplo "No tenés permiso para cargar documentos.".
  deniedMessage: string;
  children: ReactNode;
}

export function RequireRole({ role, deniedMessage, children }: RequireRoleProps) {
  const { user, status } = useSession();

  // Hasta saber quién es, no se monta nada: el contenido no aparece un instante antes de saber el rol.
  if (status === 'loading') return <ScreenState kind="loading" />;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'upload').message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;

  if (user.role !== role) {
    return (
      <ScreenState
        kind="empty"
        message={deniedMessage}
        action={
          <Link href="/documentos" className="text-blue-700 underline dark:text-blue-400">
            Volver a Documentos
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
