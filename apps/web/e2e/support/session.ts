// La sesión de los tests en el navegador (plan 002, sección 3.1). loginAs hace lo mismo que elegir el
// usuario en DevSessionSwitcher: deja su ID en sim-session antes de que cargue la página y la web inicia
// sesión con POST /api/auth/login (la API simulada de mock-api.ts, o la real en e2e/integracion).
import type { APIRequestContext, Page } from '@playwright/test';
import { FIXTURE_USERS } from '../../lib/directory/fixtures';
import { DEV_FIXTURE_PASSWORD, devEmail } from '../../lib/session/dev-credentials';

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

// El accessToken que da la API simulada a cada usuario: un JWT con su ID en `sub` (la web lee el `sub`
// y no revisa la firma, que acá no existe).
export function accessTokenFor(user: TestUser): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId(user) })}.simulado`;
}

// Contra la API real: inicia sesión con el email y la contraseña de desarrollo (los del seed de
// fixtures) y devuelve la cabecera Authorization, para preparar datos sin pasar por la pantalla.
export async function authHeadersFor(
  request: APIRequestContext,
  user: TestUser,
): Promise<{ Authorization: string }> {
  const response = await request.post('/api/auth/login', {
    data: { email: devEmail(userId(user)), password: DEV_FIXTURE_PASSWORD },
  });
  if (response.status() !== 200) {
    throw new Error(
      `No se pudo iniciar sesión como ${user} (${response.status()}): ¿se cargó "pnpm --filter api seed:fixtures"?`,
    );
  }
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}
