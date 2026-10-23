// Fija el usuario de prueba de la sesión simulada (plan 002, sección 3.1) antes de que cargue la página.
// Cuando llegue la sesión real (T30), esto pasa a iniciar sesión de verdad.
import type { Page } from '@playwright/test';
import { FIXTURE_USERS } from '../../lib/directory/fixtures';

export type TestUser = keyof typeof FIXTURE_USERS;

// La misma clave que usa lib/session/simulated-session.tsx.
const SIM_SESSION_KEY = 'sim-session';

export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript(
    ([key, id]) => window.localStorage.setItem(key, id),
    [SIM_SESSION_KEY, FIXTURE_USERS[user].id] as const,
  );
}

export function userId(user: TestUser): string {
  return FIXTURE_USERS[user].id;
}
