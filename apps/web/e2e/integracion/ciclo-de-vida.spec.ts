// Ciclo de vida contra la API real (spec 003, T28; plan 003, sección 7.4): E1, E2 y E7 de punta a punta,
// y R5 y R10 vistos desde la pantalla. Web en el 3001, rewrite de /api, API en el 3000 sin S3_BUCKET
// (archivos en memoria) y PostgreSQL en Docker.
//
// Se corre aparte: `pnpm --filter web test:e2e:integracion`, con la API levantada. Para no escribir en la
// base de desarrollo, la API se levanta contra la base de tests, pasando la URL solo en el comando, después
// de que `pnpm --filter api test:e2e` la deje migrada:
//   DATABASE_URL=<la TEST_DATABASE_URL de apps/api/.env> pnpm dev:api
// La sesión inicia sesión de verdad: antes, `pnpm --filter api seed:fixtures` deja los usuarios de prueba
// con la contraseña de desarrollo.
// Cada documento lleva "[e2e]" y una marca única en el título, y cada archivo tiene contenido distinto.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { DocumentResponse } from '../../lib/api';
import { AREA_IDS } from '../../lib/directory/fixtures';
import { pdfFile } from '../support/files';
import { authHeadersFor, loginAs, userId } from '../support/session';
import type { TestUser } from '../support/session';

const API_URL = 'http://localhost:3000';
// Única por proceso: dos procesos de Playwright pueden arrancar en el mismo milisegundo.
const RUN = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const NOT_FOUND = 'No se encontró el documento.';

// Si la API no está levantada, se avisa enseguida en vez de esperar al tiempo límite.
test.beforeAll(async ({ request }) => {
  const response = await request.get(`${API_URL}/api/documents`).catch(() => null);
  if (response?.status() !== 401) {
    throw new Error(
      `La API no responde en ${API_URL} (se esperaba 401 sin sesión). Levantala con Docker y "pnpm dev:api".`,
    );
  }
});

// Un documento de Ventas, cargado por la API a través del rewrite, con la ADMIN como responsable:
// así sigue siendo válido al pasar a Operaciones (R4 de la spec 001).
async function createVentasDocument(request: APIRequestContext, name: string): Promise<DocumentResponse> {
  const response = await request.post('/api/documents', {
    headers: await authHeadersFor(request, 'admin'),
    multipart: {
      file: pdfFile('original.pdf', 2048),
      title: `[e2e] ${name} ${RUN}`,
      areaIds: AREA_IDS.ventas,
      ownerId: userId('admin'),
      reviewDate: '2030-01-15',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function openAs(page: Page, user: TestUser, document: DocumentResponse) {
  await loginAs(page, user);
  await page.goto(`/documentos/${document.id}`);
}

const heading = (page: Page, document: DocumentResponse) =>
  page.getByRole('heading', { level: 1, name: document.title });

// Lo que ve un usuario en el listado. Con la base de tests hay pocos documentos: entran en la página 1.
async function listedTitles(page: Page, user: TestUser): Promise<string[]> {
  await loginAs(page, user);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/documents?page=1')),
    page.goto('/documentos'),
  ]);
  const body = (await response.json()) as { data: { title: string }[] };
  return body.data.map((document) => document.title);
}

test('E1: la ADMIN pasa un documento de Ventas a Operaciones; cambia quién lo ve (R5)', async ({
  page,
  request,
}) => {
  const document = await createVentasDocument(request, 'Cambio de áreas');
  await openAs(page, 'admin', document);
  await expect(heading(page, document)).toBeVisible();

  await page.getByRole('button', { name: 'Cambiar áreas' }).click();
  await page.getByRole('checkbox', { name: 'Operaciones' }).check();
  await page.getByRole('checkbox', { name: 'Ventas' }).uncheck();
  await expect(page.getByRole('combobox', { name: 'Responsable' })).toHaveValue(userId('admin'));
  const [patch] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/documents/${document.id}/areas`)),
    page.getByRole('button', { name: 'Guardar áreas' }).click(),
  ]);

  expect(patch.status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Áreas actualizadas' })).toBeVisible();
  await expect(page.locator('dd').first()).toHaveText('Operaciones');

  // La EMPLOYEE de Ventas deja de verlo; el EMPLOYEE de Operaciones lo ve.
  expect(await listedTitles(page, 'empleadoVentas')).not.toContain(document.title);
  await openAs(page, 'empleadoVentas', document);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();

  expect(await listedTitles(page, 'empleadoOperaciones')).toContain(document.title);
  await openAs(page, 'empleadoOperaciones', document);
  await expect(heading(page, document)).toBeVisible();
});

test('E2: la ADMIN sube la versión 2 y la ve vigente en el historial, con la 1 reemplazada', async ({
  page,
  request,
}) => {
  const document = await createVentasDocument(request, 'Versión nueva');
  await openAs(page, 'admin', document);
  await expect(heading(page, document)).toBeVisible();

  await page.getByRole('button', { name: 'Subir versión nueva' }).click();
  await page.getByLabel('Archivo').setInputFiles(pdfFile('version-2.pdf', 4096));
  const [post] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/documents/${document.id}/versions`)),
    page.getByRole('button', { name: 'Subir versión', exact: true }).click(),
  ]);

  expect(post.status(), await post.text()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Versión 2 cargada' })).toBeVisible();
  await expect(page.getByText('version-2.pdf')).toBeVisible();
  await expect(page.getByText('Pendiente')).toBeVisible();

  await page.getByRole('button', { name: 'Historial de versiones' }).click();
  const rows = page.getByRole('list', { name: 'Versiones' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.getByRole('heading')).toHaveText(['Versión 2', 'Versión 1']);
  await expect(rows.nth(0)).toContainText('Vigente');
  await expect(rows.nth(0)).toContainText('version-2.pdf');
  await expect(rows.nth(1)).toContainText('Reemplazada');
  await expect(rows.nth(1)).toContainText('original.pdf');
});

test('E7: la ADMIN archiva con confirmación y la EMPLOYEE de Ventas deja de verlo (R10)', async ({
  page,
  request,
}) => {
  const document = await createVentasDocument(request, 'Archivar');
  // Antes de archivar, la EMPLOYEE de Ventas lo ve.
  await openAs(page, 'empleadoVentas', document);
  await expect(heading(page, document)).toBeVisible();

  await openAs(page, 'admin', document);
  await expect(heading(page, document)).toBeVisible();
  await page.getByRole('button', { name: 'Archivar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Archivar documento' });
  await expect(dialog).toContainText('no se puede deshacer');
  const [archive] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/documents/${document.id}/archive`)),
    dialog.getByRole('button', { name: 'Archivar' }).click(),
  ]);

  expect(archive.status()).toBe(200);
  await expect(page.getByText(/^Archivado desde \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  for (const name of ['Cambiar áreas', 'Subir versión nueva', 'Archivar']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }

  await openAs(page, 'empleadoVentas', document);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  expect(await listedTitles(page, 'empleadoVentas')).not.toContain(document.title);
});
