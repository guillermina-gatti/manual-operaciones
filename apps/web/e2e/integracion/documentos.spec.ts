// Integración con la API real (T26; plan 002, secciones 2 y 7.2): web en el 3001, rewrite de /api,
// API en el 3000 sin S3_BUCKET (archivos en memoria) y PostgreSQL en Docker.
// Se corre aparte: `pnpm --filter web test:e2e:integracion`, con la API levantada (`pnpm dev:api`).
// Cada corrida carga documentos nuevos en la base de desarrollo: los títulos llevan "[e2e]" y una marca única,
// y cada archivo tiene contenido distinto, para no chocar con el 409 de una corrida anterior.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { DocumentResponse } from '../../lib/api';
import { AREA_IDS } from '../../lib/directory/fixtures';
import type { TestFile } from '../support/files';
import { megabytes, pdfFile } from '../support/files';
import { loginAs, userId } from '../support/session';

const API_URL = 'http://localhost:3000';
// Única por proceso: dos procesos de Playwright pueden arrancar en el mismo milisegundo.
const RUN = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const REVIEW_DATE = '2030-01-15';

// Si la API no está levantada, se avisa enseguida en vez de esperar al tiempo límite.
test.beforeAll(async ({ request }) => {
  const response = await request.get(`${API_URL}/api/documents`).catch(() => null);
  if (response?.status() !== 401) {
    throw new Error(
      `La API no responde en ${API_URL} (se esperaba 401 sin sesión). Levantala con "pnpm dev:api" y Docker.`,
    );
  }
});

const owner = (page: Page) => page.getByRole('combobox', { name: 'Responsable' });

// Carga desde el formulario, como la ADMIN, y devuelve la respuesta de la API.
async function uploadFromForm(page: Page, file: TestFile, title: string) {
  await loginAs(page, 'admin');
  await page.goto('/documentos/nuevo');
  await page.getByLabel('Archivo').setInputFiles(file);
  await page.getByLabel('Título').fill(title);
  await page.getByRole('checkbox', { name: 'Ventas' }).check();
  const sergio = 'Sergio Supervisor de Ventas (Supervisor)';
  await expect(owner(page).locator('option', { hasText: sergio })).toHaveCount(1);
  await owner(page).selectOption({ label: sergio });
  await page.getByLabel('Fecha de revisión').fill(REVIEW_DATE);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/documents') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Cargar documento' }).click(),
  ]);
  return response;
}

// Carga directa a la API, a través del rewrite de la web, como la ADMIN (para preparar datos).
async function uploadThroughRewrite(
  request: APIRequestContext,
  { title, areaId, ownerId }: { title: string; areaId: string; ownerId: string },
): Promise<DocumentResponse> {
  const file = pdfFile('preparado.pdf', 1024);
  const response = await request.post('/api/documents', {
    headers: { 'x-user-id': userId('admin'), 'x-user-role': 'ADMIN' },
    multipart: {
      file,
      title,
      areaIds: areaId,
      ownerId,
      reviewDate: REVIEW_DATE,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test('E1 de punta a punta: la ADMIN carga un PDF de 2 MB y llega al detalle con "Pendiente"', async ({
  page,
}) => {
  const title = `[e2e] Manual de caja ${RUN}`;

  const response = await uploadFromForm(page, pdfFile('manual-de-caja.pdf', megabytes(2)), title);

  expect(response.status()).toBe(201);
  const created: DocumentResponse = await response.json();
  await page.waitForURL(new RegExp(`/documentos/${created.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('Pendiente')).toBeVisible();
  await expect(page.getByText('manual-de-caja.pdf')).toBeVisible();
});

test('un PDF de exactamente 10 MB pasa entero por el rewrite y la API responde 201', async ({ page }) => {
  const file = pdfFile('diez-megas.pdf', megabytes(10));
  expect(file.buffer.length).toBe(10 * 1024 * 1024);

  const response = await uploadFromForm(page, file, `[e2e] Diez megas ${RUN}`);

  expect(response.status()).toBe(201);
  const created: DocumentResponse = await response.json();
  // La API guardó el archivo completo: si el cuerpo llegara recortado, sizeBytes sería menor o fallaría.
  expect(created.currentVersion.sizeBytes).toBe(10 * 1024 * 1024);
});

test.describe('E8 y E12 contra la API real', () => {
  // En orden y en un solo proceso: los datos se preparan una vez y los usan los tres tests.
  test.describe.configure({ mode: 'serial' });

  const ventasTitle = `[e2e] Documento de Ventas ${RUN}`;
  const operacionesTitle = `[e2e] Documento de Operaciones ${RUN}`;
  let operaciones: DocumentResponse;

  test.beforeAll(async ({ request }) => {
    await uploadThroughRewrite(request, {
      title: ventasTitle,
      areaId: AREA_IDS.ventas,
      ownerId: userId('supervisorVentas'),
    });
    operaciones = await uploadThroughRewrite(request, {
      title: operacionesTitle,
      areaId: AREA_IDS.operaciones,
      ownerId: userId('empleadoOperaciones'),
    });
  });

  test('E8: la EMPLOYEE de Ventas ve el documento de Ventas y no el de Operaciones', async ({ page }) => {
    await loginAs(page, 'empleadoVentas');

    await page.goto('/documentos');

    await expect(page.getByRole('link', { name: ventasTitle })).toBeVisible();
    await expect(page.getByRole('link', { name: operacionesTitle })).toHaveCount(0);
  });

  test('E12: al abrir el de Operaciones por su dirección, ve "No se encontró el documento"', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoVentas');

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/documents/${operaciones.id}`)),
      page.goto(`/documentos/${operaciones.id}`),
    ]);

    expect(response.status()).toBe(404);
    await expect(page.getByText('No se encontró el documento.')).toBeVisible();
  });

  test('E11: "Descargar" pide el enlace a la API real en el momento del clic', async ({ page }) => {
    await loginAs(page, 'admin');
    const downloads: number[] = [];
    page.on('response', (r) => {
      if (r.url().endsWith(`/api/documents/${operaciones.id}/download`)) downloads.push(r.status());
    });

    await page.goto(`/documentos/${operaciones.id}`);
    await expect(page.getByRole('heading', { level: 1, name: operacionesTitle })).toBeVisible();
    expect(downloads).toEqual([]);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/documents/${operaciones.id}/download`)),
      page.getByRole('button', { name: 'Descargar' }).click(),
    ]);

    expect(response.status()).toBe(200);
    const { url, expiresAt } = await response.json();
    // Sin S3_BUCKET, la API guarda en memoria y el enlace es memory://: la web no lo abre (solo http/https).
    expect(url).toMatch(/^memory:\/\/documents\//);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    await expect(page.getByText('Ocurrió un error inesperado. Probá de nuevo.')).toBeVisible();
  });
});
