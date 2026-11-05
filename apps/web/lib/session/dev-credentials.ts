// SOLO PARA DESARROLLO Y TESTS (plan 002, sección 3.1). Con estas credenciales el selector de sesión
// (DevSessionSwitcher) inicia sesión de verdad con POST /api/auth/login. Son las que deja el seed de
// desarrollo de la API: la misma contraseña que DEV_FIXTURE_PASSWORD en apps/api/test/directory-fixtures.ts
// y el mismo email (`<clave del fixture en minúsculas>@fixtures.test`). En producción no se usan: la
// sesión de desarrollo está desactivada.
import { FIXTURE_USERS } from '@/lib/directory/fixtures';

export const DEV_FIXTURE_PASSWORD = 'dev-fixtures-2026';

const EMAILS = new Map<string, string>(
  Object.entries(FIXTURE_USERS).map(([key, user]) => [user.id, `${key.toLowerCase()}@fixtures.test`]),
);

// El email de un usuario de los fixtures, o undefined si el ID no es de los fixtures.
export const devEmail = (userId: string): string | undefined => EMAILS.get(userId);
