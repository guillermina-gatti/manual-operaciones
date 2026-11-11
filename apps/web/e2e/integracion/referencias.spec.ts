// Referencias históricas contra la API real (spec 008, T13; plan 008, 4.4): E3, E4, E13, E15 y E19 de
// punta a punta. Web en el 3001, rewrite de /api, API en el 3000 y PostgreSQL en Docker.
//
// Se corre aparte: `pnpm --filter web test:e2e:integracion`, con la API levantada contra la base de tests,
// como las demás de esta carpeta (ver ciclo-de-vida.spec.ts):
//   DATABASE_URL=<la TEST_DATABASE_URL de apps/api/.env> pnpm dev:api
// y los usuarios de prueba cargados con `pnpm --filter api seed:fixtures`.
//
// No hay endpoint para desactivar usuarios ni áreas, y la API no deja cargar con un responsable o un área
// inactivos (R5, R7). Por eso el documento lo siembra apps/api/test/documents/seed-references.ts, que
// escribe solo en una base local _test (TEST_DATABASE_URL): un responsable y un área propios de la
// corrida, los dos desactivados después de crear el documento.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loginAs } from '../support/session';

const API_URL = 'http://localhost:3000';
const API_DIR = resolve(__dirname, '../../../api');
// Única por proceso: dos procesos de Playwright pueden arrancar en el mismo milisegundo.
const RUN = `${Date.now()}-${randomUUID().slice(0, 8)}`;

interface SeededReferences {
  documentId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  areaId: string;
  areaName: string;
}

// Corre la siembra con el ts-node de la API; imprime los IDs en JSON en la última línea. Un solo texto
// de comando (en Windows, pnpm es un .cmd y necesita la shell): RUN solo tiene dígitos, letras y guiones.
function seedReferences(): SeededReferences {
  const output = execSync(
    `pnpm exec ts-node --transpile-only -r ./test/resolve-js-to-ts.cjs test/documents/seed-references.ts ${RUN}`,
    { cwd: API_DIR, encoding: 'utf8' },
  );
  const lastLine = output.trim().split(/\r?\n/).pop() ?? '';
  return JSON.parse(lastLine) as SeededReferences;
}

let seeded: SeededReferences;

test.beforeAll(async ({ request }) => {
  // Si la API no está levantada, se avisa enseguida en vez de esperar al tiempo límite.
  const response = await request.get(`${API_URL}/api/documents`).catch(() => null);
  if (response?.status() !== 401) {
    throw new Error(
      `La API no responde en ${API_URL} (se esperaba 401 sin sesión). Levantala con Docker y "pnpm dev:api".`,
    );
  }
  seeded = seedReferences();
});

const inactiveOwner = () => `${seeded.ownerName} (inactivo)`;
const inactiveArea = () => `${seeded.areaName} (inactiva)`;

// El valor (dd) de una etiqueta (dt) del detalle.
const detailValue = (page: Page, label: string) =>
  page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
// Las áreas del detalle van en su encabezado, como chips (no en el cuadro de datos).
const detailAreas = (page: Page) => page.locator('main header');

test('E3, E4, E19, E15, E13: el responsable y el área inactivos se ven, y el cambio de áreas los conserva', async ({
  page,
}) => {
  await loginAs(page, 'admin');

  // E3, E4 en el listado: la tarjeta muestra "(inactivo)" y "(inactiva)".
  await page.goto('/documentos');
  const card = page.getByRole('article').filter({ hasText: seeded.title });
  await expect(card).toBeVisible();
  await expect(card.getByText(inactiveOwner())).toBeVisible();
  await expect(card.getByText(inactiveArea())).toBeVisible();

  // E3, E4 en el detalle.
  await page.goto(`/documentos/${seeded.documentId}`);
  await expect(page.getByRole('heading', { level: 1, name: seeded.title })).toBeVisible();
  await expect(detailValue(page, 'Responsable')).toHaveText(inactiveOwner());
  await expect(detailAreas(page)).toContainText(inactiveArea());

  // E19: al abrir el cambio de áreas, el responsable inactivo está elegido.
  await page.getByRole('button', { name: 'Cambiar áreas' }).click();
  const owner = page.getByRole('combobox', { name: 'Responsable' });
  await expect(owner).toHaveValue(seeded.ownerId);
  await expect(owner.locator('option:checked')).toHaveText(inactiveOwner());

  // E13: Compras inactiva sigue marcada; se agrega Operaciones. E19: al llegar los candidatos de las
  // áreas nuevas, el responsable sigue elegido.
  await expect(page.getByRole('checkbox', { name: inactiveArea() })).toBeChecked();
  const candidates = page.waitForResponse((r) => r.url().includes('/api/users'));
  await page.getByRole('checkbox', { name: 'Operaciones' }).check();
  await candidates;
  await expect(owner).toHaveValue(seeded.ownerId);

  // E15: se guarda sin cambiar el responsable: el pedido no trae ownerId y la API responde 200.
  const [request, patch] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith(`/api/documents/${seeded.documentId}/areas`)),
    page.waitForResponse((r) => r.url().endsWith(`/api/documents/${seeded.documentId}/areas`)),
    page.getByRole('button', { name: 'Guardar áreas' }).click(),
  ]);
  expect(patch.status(), await patch.text()).toBe(200);
  expect(request.postDataJSON()).not.toHaveProperty('ownerId');

  // El detalle sigue con el mismo responsable, con Compras (inactiva) y con Operaciones.
  await expect(page.getByRole('status').filter({ hasText: 'Áreas actualizadas' })).toBeVisible();
  await expect(detailValue(page, 'Responsable')).toHaveText(inactiveOwner());
  const areas = detailAreas(page);
  await expect(areas).toContainText(inactiveArea());
  await expect(areas).toContainText('Operaciones');
  await expect(areas).toContainText('Ventas');
});
