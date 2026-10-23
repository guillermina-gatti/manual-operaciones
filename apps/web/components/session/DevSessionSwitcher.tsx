'use client';

// Selector del usuario de prueba de la sesión simulada (plan 002, sección 3.1; D2).
// Solo existe fuera de producción y se borra junto con la sesión simulada (T30).
// Importa los fixtures directamente porque es parte de la simulación, no una pantalla.
import type { ChangeEvent } from 'react';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import {
  SIM_SESSION_CHANGE_EVENT,
  SIM_SESSION_KEY,
  useSession,
} from '@/lib/session';
import type { Role } from '@/lib/session';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
};

const USERS = Object.values(FIXTURE_USERS);

function chooseUser(id: string) {
  try {
    if (id) localStorage.setItem(SIM_SESSION_KEY, id);
    else localStorage.removeItem(SIM_SESSION_KEY);
  } catch {
    // Sin acceso a localStorage: la sesión sigue igual.
    return;
  }
  // La sesión escucha este evento para actualizarse en esta misma pestaña.
  window.dispatchEvent(new Event(SIM_SESSION_CHANGE_EVENT));
}

export function DevSessionSwitcher() {
  const { user, status } = useSession();

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg dark:border-amber-600 dark:bg-amber-950 dark:text-amber-50">
      <label htmlFor="dev-session-switcher" className="block font-semibold">
        Usuario de prueba
      </label>
      <select
        id="dev-session-switcher"
        className="mt-1 min-h-11 w-full rounded border border-amber-400 bg-white px-2 text-amber-950 dark:bg-amber-900 dark:text-amber-50"
        value={user?.id ?? ''}
        disabled={status === 'loading'}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => chooseUser(event.target.value)}
      >
        <option value="">Sin sesión</option>
        {USERS.map((fixture) => (
          <option key={fixture.id} value={fixture.id}>
            {fixture.name} ({ROLE_LABELS[fixture.role]})
          </option>
        ))}
      </select>
      {status === 'ready' && !user && (
        <p className="mt-2">Elegí un usuario de prueba</p>
      )}
      <p className="mt-2 text-xs opacity-75">Solo en desarrollo: simula la sesión.</p>
    </aside>
  );
}
