// HU11 contra la API real (spec 006, W4): desde la lista, el clic en el título de una tarjeta lleva
// al detalle del procedimiento con navegación del lado del cliente.
// Se corre aparte: `pnpm --filter web test:e2e:integracion`, con la API levantada y el seed cargado.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loginAs, userId } from '../support/session';
import type { TestUser } from '../support/session';
import { DEV_FIXTURE_PASSWORD, devEmail } from '../../lib/session/dev-credentials';

const API_URL = 'http://localhost:3000';

// Con NEXT_PUBLIC_REAL_AUTH=true inicia sesión por el formulario real, como en el navegador; si no,
// con el usuario simulado de siempre.
async function signIn(page: Page, user: TestUser) {
  if (process.env.NEXT_PUBLIC_REAL_AUTH !== 'true') return loginAs(page, user);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(devEmail(userId(user)) ?? '');
  await page.getByLabel('Contraseña').fill(DEV_FIXTURE_PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión|ingresar|entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.beforeAll(async ({ request }) => {
  const response = await request.get(`${API_URL}/api/procedures`).catch(() => null);
  if (response?.status() !== 401) {
    throw new Error(`La API no responde en ${API_URL} (se esperaba 401 sin sesión). Levantala con "pnpm dev:api".`);
  }
});

for (const user of ['admin', 'supervisorVentas', 'empleadoVentas'] as TestUser[]) {
  test(`W4: ${user} hace clic en el título de una tarjeta y llega al detalle`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await signIn(page, user);
    // Como el usuario: del inicio a la lista por la tarjeta, sin recargar.
    await page.goto('/');
    await page.getByRole('link', { name: /procedimientos/i }).first().click();
    await expect(page).toHaveURL(/\/procedimientos$/);
    const title = page.getByRole('article').first().getByRole('heading', { level: 3 });
    await expect(title).toBeVisible();
    const name = (await title.textContent())?.trim() ?? '';
    const href = await title.getByRole('link').getAttribute('href');
    expect(href).toMatch(/^\/procedimientos\/[0-9a-f-]{36}$/);

    await title.getByRole('link').click();

    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
}
