// Búsqueda en el navegador (spec 004, T17), con la API simulada, en escritorio y celular.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  documentSummary,
  listResponse,
  mockApi,
  searchResponse,
  searchResult,
} from './support/mock-api';
import { loginAs } from './support/session';

const box = (page: Page) => page.getByRole('searchbox', { name: 'Buscar documentos' });

async function searchFor(page: Page, text: string) {
  await box(page).fill(text);
  await box(page).press('Enter');
}

const searchRequests = (api: { requests: { path: string; search: URLSearchParams }[] }) =>
  api.requests.filter((request) => request.path === '/api/documents/search');

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'empleadoVentas');
});

test('E1: busca por contenido y ve el fragmento con las palabras resaltadas y la página', async ({ page }) => {
  const result = searchResult(
    { title: 'Manual de caja' },
    [
      { text: '… se hace el ', match: false },
      { text: 'cierre', match: true },
      { text: ' de ', match: false },
      { text: 'caja', match: true },
      { text: ' diario …', match: false },
    ],
    4,
  );
  const api = await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({ status: 200, body: searchResponse([result]) }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'cierre de caja');

  const card = page.getByRole('article');
  await expect(card).toHaveCount(1);
  await expect(card.locator('mark')).toHaveText(['cierre', 'caja']);
  await expect(card.getByText('Página 4')).toBeVisible();
  await expect(page.getByText('1 resultado para «cierre de caja»')).toBeVisible();
  expect(searchRequests(api)[0].search.get('q')).toBe('cierre de caja');
  expect(api.unhandled).toEqual([]);
});

test('E2: un resultado por título no tiene fragmento', async ({ page }) => {
  await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({
      status: 200,
      body: searchResponse([searchResult({ title: 'Manual de facturación' })]),
    }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'facturación');

  const card = page.getByRole('article');
  await expect(card.getByRole('link', { name: 'Manual de facturación' })).toBeVisible();
  await expect(card.locator('mark')).toHaveCount(0);
  await expect(card.getByText(/Página/)).toHaveCount(0);
});

test('E9: con "ca" avisa y no pide nada a la API de búsqueda', async ({ page }) => {
  const api = await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({ status: 200, body: searchResponse([]) }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'ca');

  // Dentro del formulario: Next tiene su propio role="alert" (el anunciador de rutas).
  await expect(page.getByRole('search').getByRole('alert')).toHaveText(
    'Escribí al menos 3 caracteres para buscar.',
  );
  await expect(page).toHaveURL(/\/documentos$/);
  expect(searchRequests(api)).toEqual([]);
});

test('E10: los caracteres especiales viajan codificados y se ven los resultados', async ({ page }) => {
  const api = await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({
      status: 200,
      body: searchResponse([
        searchResult({ title: 'Caja chica' }, [{ text: 'caja', match: true }]),
      ]),
    }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'caja & | ! :');

  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page).toHaveURL(/\?q=caja%20%26%20%7C%20!%20%3A$/);
  expect(searchRequests(api)[0].search.get('q')).toBe('caja & | ! :');
});

test('E11 y F6: sin resultados, "Borrar búsqueda" vuelve al listado completo', async ({ page }) => {
  await mockApi(page, {
    list: () => ({
      status: 200,
      body: listResponse([documentSummary({ title: 'Manual de caja' })]),
    }),
    search: () => ({ status: 200, body: searchResponse([]) }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'xyzxyz');

  await expect(page.getByText('No encontramos documentos para «xyzxyz»')).toBeVisible();
  await page.getByRole('link', { name: 'Borrar búsqueda' }).click();

  await expect(page).toHaveURL(/\/documentos$/);
  await expect(page.getByRole('link', { name: 'Manual de caja' })).toBeVisible();
  await expect(box(page)).toHaveValue('');
});

test('E12: el HTML del fragmento se ve como texto y no se ejecuta', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });
  await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({
      status: 200,
      body: searchResponse([
        searchResult({ title: 'Manual' }, [
          { text: '<script>alert(1)</script> <img src=x onerror=alert(2)> ', match: false },
          { text: 'caja', match: true },
        ]),
      ]),
    }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'caja');

  const card = page.getByRole('article');
  await expect(card.getByText('<script>alert(1)</script> <img src=x onerror=alert(2)>')).toBeVisible();
  await expect(card.locator('script, img')).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test('E13: la búsqueda queda en la dirección: recargar la mantiene y "atrás" vuelve al listado', async ({ page }) => {
  const api = await mockApi(page, {
    list: () => ({
      status: 200,
      body: listResponse([documentSummary({ title: 'Listado completo' })]),
    }),
    search: () => ({
      status: 200,
      body: searchResponse([searchResult({ title: 'Manual de caja' }, [{ text: 'caja', match: true }])]),
    }),
  });

  await page.goto('/documentos');
  await expect(page.getByRole('link', { name: 'Listado completo' })).toBeVisible();
  await searchFor(page, 'caja');
  await expect(page.getByRole('link', { name: 'Manual de caja' })).toBeVisible();
  // En next dev, React StrictMode monta dos veces y cada montaje pide: se compara antes y después.
  const beforeReload = searchRequests(api).length;

  await page.reload();
  await expect(page.getByRole('link', { name: 'Manual de caja' })).toBeVisible();
  await expect(box(page)).toHaveValue('caja');
  expect(searchRequests(api).length).toBeGreaterThan(beforeReload);
  expect(searchRequests(api).at(-1)?.search.get('q')).toBe('caja');

  await page.goBack();
  await expect(page).toHaveURL(/\/documentos$/);
  await expect(page.getByRole('link', { name: 'Listado completo' })).toBeVisible();
});

test('F3: abrir /documentos?q=caja&pagina=2 pide la página 2', async ({ page }) => {
  const api = await mockApi(page, {
    search: () => ({
      status: 200,
      body: searchResponse(
        Array.from({ length: 5 }, (_, i) => searchResult({ title: `Caja ${i}` })),
        25,
        2,
      ),
    }),
  });

  await page.goto('/documentos?q=caja&pagina=2');

  await expect(page.getByRole('article')).toHaveCount(5);
  expect(searchRequests(api)[0].search.get('page')).toBe('2');
  await expect(page.getByRole('link', { name: 'Página 1' })).toHaveAttribute(
    'href',
    '/documentos?q=caja',
  );
});

test('F7: un fragmento con palabras largas no genera desplazamiento horizontal', async ({ page }) => {
  // Sin "/", "-" ni espacios: el navegador no tiene dónde cortarla si no fuera por break-words.
  const longWord = 'procedimientodecierredecajadiario'.repeat(8);
  await mockApi(page, {
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({
      status: 200,
      body: searchResponse([
        searchResult({ title: 'Manual' }, [
          { text: `${longWord} `, match: false },
          { text: 'caja', match: true },
        ]),
      ]),
    }),
  });

  await page.goto('/documentos');
  await searchFor(page, 'caja');
  await expect(page.getByRole('article')).toHaveCount(1);

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
