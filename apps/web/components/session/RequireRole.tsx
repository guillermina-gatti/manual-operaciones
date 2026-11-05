'use client';

// Deja ver una pantalla solo a roles autorizados (F1). Si el rol no corresponde, el contenido ni se monta:
// no arranca ni hace pedidos. No es la protección real: la API igual responde 403.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { ApiError, describeApiError } from '@/lib/api';
import { REAL_AUTH_ENABLED, buildLoginReturnUrl, useSession } from '@/lib/session';
import type { Role } from '@/lib/session';

interface RequireRoleProps {
  /** Rol único autorizado (compatibilidad con usos existentes). */
  role?: Role;
  /** Lista de roles autorizados (A-10b.1). */
  roles?: readonly Role[];
  /** Lo que ve un usuario sin permisos, por ejemplo "No tenés permiso para cargar documentos.". */
  deniedMessage: string;
  children: ReactNode;
}

/**
 * Resuelve los roles permitidos de manera segura y sin ambigüedades.
 * Si se reciben ambas propiedades (contradictorio) o ninguna (incompleto),
 * deniega el acceso devolviendo null (fail-closed) para evitar asunciones silenciosas.
 */
function resolveAllowedRoles(
  role?: Role,
  roles?: readonly Role[],
): readonly Role[] | null {
  if (role !== undefined && roles !== undefined) {
    return null;
  }
  if (role !== undefined) {
    return [role];
  }
  if (roles !== undefined && roles.length > 0) {
    return roles;
  }
  return null;
}

function LoginLink({ pathname }: { pathname: string | null }) {
  const searchParams = useSearchParams();
  const href = buildLoginReturnUrl(pathname, searchParams);
  return (
    <Link href={href} className="text-blue-700 underline dark:text-blue-400">
      Ir a iniciar sesión
    </Link>
  );
}

export function RequireRole({ role, roles, deniedMessage, children }: RequireRoleProps) {
  const { user, status } = useSession();
  const pathname = usePathname();

  // Hasta saber quién es, no se monta nada: el contenido no aparece un instante antes de saber el rol.
  if (status === 'loading') return <ScreenState kind="loading" />;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeApiError(new ApiError(401), 'upload').message} />;
  }

  if (!user) {
    return REAL_AUTH_ENABLED ? (
      <ScreenState
        kind="empty"
        message="Necesitás iniciar sesión para acceder a esta sección."
        action={
          // Suspense requerido por Next.js al leer useSearchParams() en Client Components.
          // El fallback es no interactivo (null) para evitar ofrecer un enlace incompleto sin query params.
          <Suspense fallback={null}>
            <LoginLink pathname={pathname} />
          </Suspense>
        }
      />
    ) : (
      <ScreenState
        kind="empty"
        message="Elegí un usuario de prueba"
      />
    );
  }

  const allowedRoles = resolveAllowedRoles(role, roles);
  const hasPermission = allowedRoles !== null && allowedRoles.includes(user.role);

  if (!hasPermission) {
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
