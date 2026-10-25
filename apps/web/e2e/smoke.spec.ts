// Test de humo de Playwright (T23): la configuración, la sesión simulada y la API simulada funcionan juntas.
import { expect, test } from '@playwright/test';
import {
  documentDetail,
  documentSummary,
  listResponse,
  mockApi,
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
