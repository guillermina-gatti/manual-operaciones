// Escenarios de consulta en el navegador, con la API simulada (T24; plan 002, sección 7.2).
// Corren en escritorio y en celular (F10).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  apiError,
  documentDetail,
  documentSummary,
  downloadUrl,
  listResponse,
  mockApi,
} from './support/mock-api';
import { accessTokenFor, loginAs } from './support/session';

const NOT_FOUND = 'No se encontró el documento.';

const cardTitles = (page: Page) => page.getByRole('article').locator('h2').allTextContents();

test.describe('E2 · Un empleado no ve la opción de cargar', () => {
  test('en el listado no está "Cargar documento"', async ({ page }) => {
    await loginAs(page, 'empleadoVentas');
    const api = await mockApi(page, {
      list: () => ({ status: 200, body: listResponse([documentSummary()]) }),
    });

    await page.goto('/documentos');
    await expect(page.getByRole('article')).toHaveCount(1);

    await expect(page.getByRole('link', { name: 'Cargar documento' })).toHaveCount(0);
    expect(api.requests[0].headers.authorization).toBe(`Bearer ${accessTokenFor('empleadoVentas')}`);
    expect(api.unhandled).toEqual([]);
  });

  test('si entra a /documentos/nuevo, ve que no tiene permiso y no aparece el formulario (F1)', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoVentas');
    const api = await mockApi(page, {});

    await page.goto('/documentos/nuevo');

    await expect(page.getByText('No tenés permiso para cargar documentos.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver a Documentos' }).last()).toHaveAttribute(
      'href',
      '/documentos',
    );
    await expect(page.getByLabel('Archivo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cargar documento' })).toHaveCount(0);
    expect(api.requests).toEqual([]);
  });
});

test.describe('E8 · Listado de un empleado', () => {
  test('muestra solo los documentos que devuelve la API, en su orden, y pagina por números', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoVentas');
    const firstPage = [
      documentSummary({ title: 'Política de devoluciones' }),
      documentSummary({ title: 'Manual de caja' }),
      documentSummary({ title: 'Apertura del local' }),
    ];
    const secondPage = [documentSummary({ title: 'Inventario mensual' })];
    const api = await mockApi(page, {
      list: (request) =>
        request.search.get('page') === '2'
          ? { status: 200, body: listResponse(secondPage, 45, 2) }
          : { status: 200, body: listResponse(firstPage, 45, 1) },
    });

    await page.goto('/documentos');
    await expect(page.getByRole('article')).toHaveCount(3);

    // El orden es el de la API (del más nuevo al más viejo): la web no reordena ni filtra.
    expect(await cardTitles(page)).toEqual([
      'Política de devoluciones',
      'Manual de caja',
      'Apertura del local',
    ]);
    expect(api.requests[0].search.get('page')).toBe('1');
    expect(api.requests[0].search.get('limit')).toBe('20');

    // 45 documentos de a 20 son 3 páginas.
    const pages = page.getByRole('navigation', { name: 'Páginas' });
    await expect(pages.getByRole('link', { name: /^Página \d+$/ })).toHaveCount(3);
    await pages.getByRole('link', { name: 'Página 2' }).click();

    await expect(page).toHaveURL(/\/documentos\?pagina=2$/);
    await expect(page.getByRole('article')).toHaveCount(1);
    expect(await cardTitles(page)).toEqual(['Inventario mensual']);
    expect(api.requests.at(-1)?.search.get('page')).toBe('2');
    await expect(pages.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E9 · Un empleado no ve el estado del procesamiento', () => {
  const document = documentDetail({ title: 'Manual de caja' });

  test('el EMPLOYEE no lo ve', async ({ page }) => {
    await loginAs(page, 'empleadoVentas');
    const api = await mockApi(page, { detail: () => ({ status: 200, body: document }) });

    await page.goto(`/documentos/${document.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Manual de caja' })).toBeVisible();

    await expect(page.getByText('Procesamiento')).toHaveCount(0);
    await expect(page.getByText('Pendiente')).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });

  test('el mismo documento, abierto por la ADMIN, sí lo muestra (F6)', async ({ page }) => {
    await loginAs(page, 'admin');
    await mockApi(page, { detail: () => ({ status: 200, body: document }) });

    await page.goto(`/documentos/${document.id}`);

    await expect(page.getByText('Procesamiento')).toBeVisible();
    await expect(page.getByText('Pendiente')).toBeVisible();
  });
});

test.describe('E10 · Lista vacía', () => {
  test('un usuario sin documentos en sus áreas ve "Todavía no hay documentos en tus áreas"', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoOperaciones');
    const api = await mockApi(page, { list: () => ({ status: 200, body: listResponse([]) }) });

    await page.goto('/documentos');

    await expect(page.getByText('Todavía no hay documentos en tus áreas')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E11 · Descarga', () => {
  test('el enlace se pide a la API en el momento del clic y el navegador descarga el archivo (F8)', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoVentas');
    const document = documentDetail({ title: 'Manual de caja' });
    let links = 0;
    const api = await mockApi(page, {
      detail: () => ({ status: 200, body: document }),
      download: () => {
        links += 1;
        return { status: 200, body: downloadUrl(`https://archivos.example.test/manual.pdf?firma=${links}`) };
      },
    });
    // Hace de S3: responde el archivo como adjunto, igual que el enlace firmado real.
    await page.route('https://archivos.example.test/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="manual-de-caja.pdf"' },
        body: '%PDF-1.4\n',
      }),
    );

    await page.goto(`/documentos/${document.id}`);
    const button = page.getByRole('button', { name: 'Descargar' });
    await expect(button).toBeVisible();
    // Al abrir el detalle no se pidió ningún enlace.
    expect(api.requests.filter((r) => r.path.endsWith('/download'))).toHaveLength(0);

    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);

    expect(download.suggestedFilename()).toBe('manual-de-caja.pdf');
    expect(api.requests.filter((r) => r.path.endsWith('/download'))).toHaveLength(1);
    // La página no cambió: se descarga sin salir del detalle.
    await expect(page).toHaveURL(new RegExp(`/documentos/${document.id}$`));

    // Un segundo clic pide un enlace nuevo: nunca se reutiliza el anterior.
    await expect(button).toBeEnabled();
    await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(api.requests.filter((r) => r.path.endsWith('/download'))).toHaveLength(2);
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E12 · Documento ajeno', () => {
  test('si la API responde 404, ve "No se encontró el documento"', async ({ page }) => {
    await loginAs(page, 'empleadoVentas');
    const id = documentDetail().id;
    const api = await mockApi(page, { detail: () => apiError(404, 'Not Found') });

    await page.goto(`/documentos/${id}`);

    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    expect(api.requests.map((r) => r.path)).toEqual([`/api/documents/${id}`]);
    expect(api.unhandled).toEqual([]);
  });

  test('con una dirección que no es un id válido, el mismo mensaje y sin pedir nada a la API (F9)', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoVentas');
    const api = await mockApi(page, {});

    await page.goto('/documentos/abc');

    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    expect(api.requests).toEqual([]);
  });
});

// Diseño de la tarjeta de la vista Tarjetas (11/11/2026): una sola fila, con el título a la izquierda y
// el bloque del tipo de archivo (48×56) y la versión a la derecha, que no se achica ni se superpone.
test.describe('Vista Tarjetas · el bloque del archivo no se achica ni se superpone', () => {
  test('con un título largo, el ícono mide 48×56, queda a la derecha del título y no hay desplazamiento horizontal', async ({
    page,
  }) => {
    await loginAs(page, 'empleadoVentas');
    const title =
      'Procedimiento de cierre de caja diario con arqueo, conteo de billetes y registro de diferencias del turno noche';
    const api = await mockApi(page, {
      list: () => ({
        status: 200,
        body: listResponse([documentSummary({ title, currentVersion: { versionNumber: 3 } as never })]),
      }),
    });

    await page.goto('/documentos?vista=tarjetas');
    const card = page.getByRole('article');
    await expect(card).toHaveCount(1);

    const icon = card.locator('svg[viewBox="0 0 40 48"]');
    const heading = await card.getByRole('heading', { level: 2 }).boundingBox();
    const iconBox = await icon.boundingBox();
    const chip = await card.getByText('v3', { exact: true }).boundingBox();
    expect(heading && iconBox && chip).toBeTruthy();
    expect(Math.round(iconBox!.width)).toBe(48);
    expect(Math.round(iconBox!.height)).toBe(56);
    // El título termina antes del ícono; la versión, debajo del ícono y centrada.
    expect(heading!.x + heading!.width).toBeLessThanOrEqual(iconBox!.x);
    expect(chip!.y).toBeGreaterThanOrEqual(iconBox!.y + iconBox!.height);
    expect(Math.abs(chip!.x + chip!.width / 2 - (iconBox!.x + iconBox!.width / 2))).toBeLessThanOrEqual(1);
    await expect(card.getByText('Archivo PDF')).toHaveClass(/sr-only/);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    expect(api.unhandled).toEqual([]);
  });
});
