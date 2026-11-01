// Avisos de vencimiento contra la API real (spec 005, T25; plan 005, sección 8.4): E1, E6 y E8 de punta
// a punta. Mismo arreglo que T28 de la spec 003: web en el 3001, rewrite de /api, API en el 3000 contra
// la base de tests y PostgreSQL en Docker.
//
//   DATABASE_URL=<la TEST_DATABASE_URL de apps/api/.env> pnpm dev:api
//   pnpm --filter api seed:fixtures
//   pnpm --filter web test:e2e:integracion
//
// Un documento vencido no se puede crear desde la API (la fecha tiene que ser desde mañana): E2 de punta
// a punta queda en la integración de la API (T11). Las fechas se calculan en Buenos Aires, a 10 días y a
// 6 meses: lejos de cualquier borde, así la hora de la corrida no cambia el resultado.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { DocumentResponse } from '../../lib/api';
import { AREA_IDS } from '../../lib/directory/fixtures';
import { COMPANY_TIME_ZONE } from '../../lib/documents/format';
import { tomorrowIn } from '../../lib/documents/review-date';
import { pdfFile } from '../support/files';
import { authHeadersFor, loginAs, userId } from '../support/session';

const API_URL = 'http://localhost:3000';
// Única por proceso: dos procesos de Playwright pueden arrancar en el mismo milisegundo.
const RUN = `${Date.now()}-${randomUUID().slice(0, 8)}`;

// Días desde hoy en Buenos Aires, como YYYY-MM-DD (mañana + days - 1).
function daysFromToday(days: number): string {
  const [year, month, day] = tomorrowIn(COMPANY_TIME_ZONE, new Date()).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days - 1)).toISOString().slice(0, 10);
}

// Si la API no está levantada, se avisa enseguida en vez de esperar al tiempo límite.
test.beforeAll(async ({ request }) => {
  const response = await request.get(`${API_URL}/api/documents`).catch(() => null);
  if (response?.status() !== 401) {
    throw new Error(
      `La API no responde en ${API_URL} (se esperaba 401 sin sesión). Levantala con Docker y "pnpm dev:api".`,
    );
  }
});

// Un documento de Ventas que vence dentro de 10 días, con la ADMIN como responsable.
async function createDueSoonDocument(request: APIRequestContext, name: string): Promise<DocumentResponse> {
  const response = await request.post('/api/documents', {
    headers: await authHeadersFor(request, 'admin'),
    multipart: {
      file: pdfFile('manual.pdf', 2048),
      title: `[e2e] ${name} ${RUN}`,
      areaIds: AREA_IDS.ventas,
      ownerId: userId('admin'),
      reviewDate: daysFromToday(10),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

const card = (page: Page, document: DocumentResponse) =>
  page.getByRole('article').filter({ has: page.getByRole('link', { name: document.title }) });
const heading = (page: Page, document: DocumentResponse) =>
  page.getByRole('heading', { level: 1, name: document.title });

test('E1, E6 y E8: la ADMIN ve "Vence pronto", lo encuentra en "Por revisar" y lo marca como revisado', async ({
  page,
  request,
}) => {
  const document = await createDueSoonDocument(request, 'Aviso de vencimiento');
  await loginAs(page, 'admin');

  // E1: la etiqueta en el listado (el más nuevo está en la página 1).
  await page.goto('/documentos');
  await expect(card(page, document)).toContainText('Vence pronto');

  // E6: el acceso con la cantidad lleva a la lista, donde está el documento.
  await page.getByRole('link', { name: /^Por revisar: / }).click();
  await expect(page).toHaveURL(/\/documentos\/por-revisar$/);
  await expect(card(page, document)).toContainText('Vence pronto');

  // E8: marca como revisado con una fecha dentro de 6 meses.
  await card(page, document).getByRole('link', { name: document.title }).click();
  await expect(heading(page, document)).toBeVisible();
  await page.getByLabel('Próxima fecha de revisión').fill(daysFromToday(180));
  await page.getByRole('button', { name: 'Marcar como revisado' }).click();

  await expect(page.getByText('Revisión registrada')).toBeVisible();
  await expect(page.getByText(/por Ana Administradora/)).toBeVisible();
  await expect(heading(page, document).locator('..')).not.toContainText(/Vencido|Vence pronto/);
});

test('E5: una EMPLOYEE de Ventas que no es responsable no ve la etiqueta ni "Marcar como revisado"', async ({
  page,
  request,
}) => {
  const document = await createDueSoonDocument(request, 'Aviso ajeno');
  await loginAs(page, 'empleadoVentas');

  await page.goto(`/documentos/${document.id}`);

  await expect(heading(page, document)).toBeVisible();
  await expect(page.getByText(/Vencido|Vence pronto/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar como revisado' })).toHaveCount(0);
});
