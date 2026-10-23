// Test de humo de Playwright (T23): la configuración, la sesión simulada y la API simulada funcionan juntas.
import { expect, test } from '@playwright/test';
import { documentSummary, listResponse, mockApi } from './support/mock-api';
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
