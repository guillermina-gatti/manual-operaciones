// Búsqueda por título contra la API real (spec 004, T18): la caja, el rewrite de /api, la codificación
// de q y la ruta GET /api/documents/search antes de :id (D1). La búsqueda por contenido de punta a punta
// queda para T19, bloqueada por el worker de Guille: sin worker no hay fragmentos.
//
// Se corre aparte, como el ciclo de vida (spec 003, T28): `pnpm --filter web test:e2e:integracion`, con la
// API levantada contra la base de tests, pasando la URL solo en el comando:
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
// Única por proceso, como en ciclo-de-vida.spec.ts. Sin guiones: así es una sola palabra para la búsqueda.
const RUN = `${Date.now()}x${randomUUID().slice(0, 8)}`;

test.beforeAll(async ({ request }) => {
  const response = await request.get(`${API_URL}/api/documents`).catch(() => null);
  if (response?.status() !== 401) {
    throw new Error(
      `La API no responde en ${API_URL} (se esperaba 401 sin sesión). Levantala con Docker y "pnpm dev:api".`,
    );
  }
});

// Un documento de Ventas cargado por la ADMIN, por la API y a través del rewrite.
async function createVentasDocument(request: APIRequestContext, title: string): Promise<DocumentResponse> {
  const response = await request.post('/api/documents', {
    headers: await authHeadersFor(request, 'admin'),
    multipart: {
      file: pdfFile('facturacion.pdf', 2048),
      title,
      areaIds: AREA_IDS.ventas,
      ownerId: userId('admin'),
      reviewDate: '2030-01-15',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

// Busca desde la caja de /documentos y espera la respuesta real de la API.
async function searchAs(page: Page, user: TestUser, text: string) {
  await loginAs(page, user);
  await page.goto('/documentos');
  const box = page.getByRole('searchbox', { name: 'Buscar documentos' });
  await box.fill(text);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/documents/search?')),
    box.press('Enter'),
  ]);
  return response;
}

test('E2: la ADMIN encuentra por título el documento recién cargado, sin fragmento', async ({
  page,
  request,
}) => {
  const document = await createVentasDocument(request, `[e2e] Manual de facturación ${RUN}`);

  const response = await searchAs(page, 'admin', `facturacion ${RUN}`);

  expect(response.status()).toBe(200);
  const card = page.getByRole('article').filter({ hasText: document.title });
  await expect(card.getByRole('link', { name: document.title })).toHaveAttribute(
    'href',
    `/documentos/${document.id}`,
  );
  await expect(card.locator('mark')).toHaveCount(0);
  await expect(page.getByText(`1 resultado para «facturacion ${RUN}»`)).toBeVisible();
});

test('R3: el EMPLOYEE de Operaciones no encuentra un documento de Ventas', async ({ page, request }) => {
  await createVentasDocument(request, `[e2e] Manual de cobranzas ${RUN}`);

  const response = await searchAs(page, 'empleadoOperaciones', `cobranzas ${RUN}`);

  expect(response.status()).toBe(200);
  await expect(page.getByText(`No encontramos documentos para «cobranzas ${RUN}»`)).toBeVisible();
});
