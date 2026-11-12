/**
 * Utilidades de redirección segura post-autenticación (A-10b.1).
 * Previene ataques de Open Redirect validando que el destino sea una ruta interna válida.
 */

export const DEFAULT_REDIRECT = '/documentos';

const DUMMY_BASE = 'http://safe-internal.local';

/**
 * Evalúa si un candidato es una ruta interna relativa segura.
 * Devuelve la ruta normalizada (pathname + search + hash) si es válida, o null si debe rechazarse.
 */
function parseSafeInternalPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return null;
  }

  const trimmed = candidate.trim();

  // Debe comenzar con una única barra y no con doble barra ('//')
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  // Rechazar barras invertidas ('\') en cualquier posición para evitar ambigüedades entre parsers
  if (trimmed.includes('\\')) {
    return null;
  }

  // Rechazar caracteres de control y espacios en blanco
  if (/[\x00-\x1F\x7F\s]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, DUMMY_BASE);

    // El origen resultante debe coincidir exactamente con la base interna
    if (parsed.origin !== DUMMY_BASE || parsed.protocol !== 'http:') {
      return null;
    }

    // El pathname resultante debe comenzar con '/' y no '//'
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
      return null;
    }

    // Evitar bucles hacia /login (cubre /login, /login/, /login?..., /login#..., /login/#...)
    const normalizedPathname = parsed.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPathname === '/login') {
      return null;
    }

    // Reconstruir el path completo (pathname + search + hash)
    const safePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (
      !safePath.startsWith('/') ||
      safePath.startsWith('//') ||
      safePath.includes('\\')
    ) {
      return null;
    }

    return safePath;
  } catch {
    return null;
  }
}

/**
 * Valida y sanitiza una ruta de redirección.
 * Solo acepta rutas internas relativas que comiencen con una única '/' y sin caracteres ambiguos.
 * Cualquier URL externa, protocolo, barra invertida, bucle a /login o destino sospechoso se rechaza.
 * Si se provee un fallback personalizado, también se valida antes de devolverlo; si es inválido,
 * se utiliza DEFAULT_REDIRECT ('/documentos').
 */
export function sanitizeReturnTo(
  target: unknown,
  fallback: string = DEFAULT_REDIRECT,
): string {
  const safeTarget = parseSafeInternalPath(target);
  if (safeTarget !== null) {
    return safeTarget;
  }

  if (fallback === DEFAULT_REDIRECT) {
    return DEFAULT_REDIRECT;
  }

  return parseSafeInternalPath(fallback) ?? DEFAULT_REDIRECT;
}

/**
 * Construye la URL de login con el parámetro returnTo preservando la ruta y query string actual.
 */
export function buildLoginReturnUrl(
  pathname?: string | null,
  searchParams?: { toString(): string } | null,
): string {
  if (!pathname || typeof pathname !== 'string' || !pathname.startsWith('/')) {
    return '/login';
  }

  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';

  // Si la ruta actual ya es /login (o /login/) o la raíz /, no incluir returnTo redundante
  if (normalizedPathname === '/login' || normalizedPathname === '/') {
    return '/login';
  }

  const query = searchParams?.toString();
  const fullPath = query ? `${pathname}?${query}` : pathname;

  return `/login?returnTo=${encodeURIComponent(fullPath)}`;
}
