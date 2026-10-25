// Test de humo de Playwright (T23): la configuración, la sesión simulada y la API simulada funcionan juntas.
import { expect, test } from '@playwright/test';
import {
  documentDetail,
  documentSummary,
  listResponse,
  mockApi,
  searchResponse,
  searchResult,
  versionHistory,
} from './support/mock-api';
import { loginAs } from './support/session';

test('con la sesión de la ADMIN y la API simulada, /documentos muestra la tarjeta', async ({ page }) => {
  await loginAs(page, 'admin');
  const document = documentSummary({ title: 'Manual de caja' });
  const api = await mockApi(page, { list: () => ({ status: 200, body: listResponse([document]) }) });

  await page.goto('/documentos');

  const card = page.getByRole('article');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('link', { name: 'Manual de caja' })).toHaveAttribute(
    'href',
    `/documentos/${document.id}`,
  );
  expect(api.requests[0].headers['x-user-role']).toBe('ADMIN');
  expect(api.unhandled).toEqual([]);
});

// Spec 003 (T25): la API simulada también atiende el ciclo de vida.
test('con versions simulado, la ADMIN abre el historial en el detalle y ve las versiones', async ({ page }) => {
  await loginAs(page, 'admin');
  const document = documentDetail({ title: 'Manual de caja' });
  const api = await mockApi(page, {
    detail: () => ({ status: 200, body: document }),
    versions: () => ({ status: 200, body: versionHistory(document, 2) }),
  });

  await page.goto(`/documentos/${document.id}`);
  await page.getByRole('button', { name: 'Historial de versiones' }).click();

  const rows = page.getByRole('list', { name: 'Versiones' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Versión 2');
  await expect(rows.first()).toContainText('Vigente');
  await expect(rows.last()).toContainText('Reemplazada');
  expect(api.unhandled).toEqual([]);
});

// Spec 004 (T16): la API simulada también atiende la búsqueda, antes que el detalle (/api/documents/:id).
test('con search simulado, el EMPLOYEE busca "caja" y ve un resultado', async ({ page }) => {
  await loginAs(page, 'empleadoVentas');
  const result = searchResult({ title: 'Manual de caja' }, [
    { text: 'el ', match: false },
    { text: 'caja', match: true },
  ]);
  const api = await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({ status: 200, body: searchResponse([result]) }),
  });

  await page.goto('/documentos');
  await page.getByRole('searchbox', { name: 'Buscar documentos' }).fill('caja');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page).toHaveURL(/\/documentos\?q=caja$/);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').locator('mark')).toHaveText('caja');
  expect(api.unhandled).toEqual([]);
});
