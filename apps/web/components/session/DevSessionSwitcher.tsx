'use client';

// Selector de prueba: desaparece cuando se activa la autenticación real.
import type { ChangeEvent } from 'react';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import {
  REAL_AUTH_ENABLED,
  selectDevUser,
  useDevLoginError,
  useSession,
} from '@/lib/session';
import type { Role } from '@/lib/session';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
};

const USERS = Object.values(FIXTURE_USERS);

export function DevSessionSwitcher() {
  const { user, status } = useSession();
  const loginError = useDevLoginError();

  if (REAL_AUTH_ENABLED || process.env.NODE_ENV === 'production') return null;

  return (
    <aside className="mx-4 mb-4 mt-auto rounded-lg border sm:fixed sm:bottom-4 sm:right-4 sm:z-50 sm:m-0 sm:w-72 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg dark:border-amber-600 dark:bg-amber-950 dark:text-amber-50">
      <label htmlFor="dev-session-switcher" className="block font-semibold">
        Usuario de prueba
      </label>
      <select
        id="dev-session-switcher"
        className="mt-1 min-h-11 w-full rounded border border-amber-400 bg-white px-2 text-amber-950 dark:bg-amber-900 dark:text-amber-50"
        value={user?.id ?? ''}
        disabled={status === 'loading'}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => void selectDevUser(event.target.value || null)}
      >
        <option value="">Sin sesión</option>
        {USERS.map((fixture) => (
          <option key={fixture.id} value={fixture.id}>
            {fixture.name} ({ROLE_LABELS[fixture.role]})
          </option>
        ))}
      </select>
      {loginError && <p role="alert" className="mt-2 font-semibold">{loginError}</p>}
      {status === 'ready' && !user && <p className="mt-2">Elegí un usuario de prueba</p>}
      <p className="mt-2 text-xs opacity-75">
        Solo en desarrollo: inicia sesión con la contraseña de desarrollo.
      </p>
    </aside>
  );
}
