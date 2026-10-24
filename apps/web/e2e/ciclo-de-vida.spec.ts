// Escenarios del ciclo de vida en el navegador, con la API simulada (spec 003, T26 y T27;
// plan 003, sección 7.4). Corren en escritorio y en celular (F10 del plan 002).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DocumentResponse } from '../lib/api';
import { AREA_IDS, FIXTURE_USERS } from '../lib/directory/fixtures';
import { pdfFile } from './support/files';
import type { TestFile } from './support/files';
import { apiError, documentDetail, mockApi, versionHistory } from './support/mock-api';
import type { ApiHandlers, ApiRequest, Reply } from './support/mock-api';
import { loginAs } from './support/session';
import type { TestUser } from './support/session';

const R14 =
  '¿Seguro que querés archivar este documento? Va a dejar de verse para los demás usuarios y no se puede deshacer.';
// Archivado el 23/10/2026 a las 15:00 de Buenos Aires.
const ARCHIVED_AT = '2026-10-23T18:00:00.000Z';
const ACTIONS = ['Cambiar áreas', 'Subir versión nueva', 'Archivar'];

// Una API simulada con estado: las acciones cambian el documento y el detalle devuelve cómo quedó,
// como hace la API real. `overrides` reemplaza handlers (por ejemplo, para forzar un 409 o un 503) y
// recibe los de por defecto, para delegar en ellos.
async function openDocument(
  page: Page,
  {
    user = 'admin',
    document: initial = {},
    versions = 1,
    overrides = () => ({}),
  }: {
    user?: TestUser;
    document?: Partial<DocumentResponse>;
    versions?: number;
    overrides?: (defaults: ApiHandlers) => ApiHandlers;
  } = {},
) {
  await loginAs(page, user);
  const state = {
    document: documentDetail({
      ownerId: FIXTURE_USERS.admin.id,
      archivedAt: null,
      ...initial,
      currentVersion: { ...documentDetail().currentVersion, versionNumber: versions, ...initial.currentVersion },
    }),
  };
  const ok = (): Reply => ({ status: 200, body: state.document });

  const defaults: ApiHandlers = {
    detail: ok,
    changeAreas: (request) => {
      const body = JSON.parse(request.body!.toString('utf8')) as { areaIds: string[]; ownerId?: string };
      state.document = { ...state.document, areaIds: body.areaIds, ownerId: body.ownerId ?? state.document.ownerId };
      return ok();
    },
    uploadVersion: (request) => {
      const reviewDate = multipartField(request, 'reviewDate');
      const number = state.document.currentVersion.versionNumber + 1;
      state.document = {
        ...state.document,
        ...(reviewDate && { reviewDate }),
        currentVersion: {
          ...state.document.currentVersion,
          id: `44444444-4444-4444-8444-${String(number).padStart(12, '0')}`,
          versionNumber: number,
          originalFileName: 'manual-v2.pdf',
          processingStatus: 'PENDING',
        },
      };
      return { status: 201, body: state.document };
    },
    archive: () => {
      state.document = { ...state.document, status: 'ARCHIVED', archivedAt: ARCHIVED_AT };
      return ok();
    },
    versions: () => ({
      status: 200,
      body: versionHistory(state.document, state.document.currentVersion.versionNumber),
    }),
  };
  const api = await mockApi(page, { ...defaults, ...overrides(defaults) });

  await page.goto(`/documentos/${state.document.id}`);
  await expect(page.getByRole('heading', { level: 1, name: state.document.title })).toBeVisible();
  return { api, state };
}

// Un campo de texto del cuerpo multipart, o null si no vino.
function multipartField(request: ApiRequest, name: string): string | null {
  const body = request.body?.toString('latin1') ?? '';
  const match = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(body);
  return match ? match[1] : null;
}

const requestsTo = (requests: ApiRequest[], method: string, suffix: string) =>
  requests.filter((request) => request.method === method && request.path.endsWith(suffix));

// Los errores se buscan dentro del panel: Next también tiene un role="alert" (el anuncio de rutas).
const versionPanel = (page: Page) => page.getByRole('region', { name: 'Subir versión nueva' });
const chooseFile = (page: Page, file: TestFile) => page.getByLabel('Archivo').setInputFiles(file);
const chosenFiles = (page: Page) =>
  page.getByLabel('Archivo').evaluate((input: HTMLInputElement) => input.files?.length ?? 0);

test.describe('E1 · Cambiar las áreas', () => {
  test('pasa a Operaciones: el PATCH lleva areaIds = [Operaciones] y el detalle lo muestra', async ({ page }) => {
    const { api } = await openDocument(page);

    await page.getByRole('button', { name: 'Cambiar áreas' }).click();
    await page.getByRole('checkbox', { name: 'Operaciones' }).check();
    await page.getByRole('checkbox', { name: 'Ventas' }).uncheck();
    await page.getByRole('button', { name: 'Guardar áreas' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Áreas actualizadas' })).toBeVisible();
    const [patch] = requestsTo(api.requests, 'PATCH', '/areas');
    expect(JSON.parse(patch.body!.toString('utf8'))).toEqual({ areaIds: [AREA_IDS.operaciones] });
    await expect(page.locator('dd').first()).toHaveText('Operaciones');
    await expect(page.getByRole('button', { name: 'Guardar áreas' })).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E2 · Subir una versión nueva', () => {
  test('sube un PDF: el pedido es multipart con file y el detalle muestra la versión 2 "Pendiente"', async ({
    page,
  }) => {
    const { api } = await openDocument(page, {
      document: { currentVersion: { processingStatus: 'READY' } as DocumentResponse['currentVersion'] },
    });
    await expect(page.getByText('Listo')).toBeVisible();

    await page.getByRole('button', { name: 'Subir versión nueva' }).click();
    await chooseFile(page, pdfFile('manual v2.pdf'));
    await page.getByRole('button', { name: 'Subir versión', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Versión 2 cargada' })).toBeVisible();
    const [post] = requestsTo(api.requests, 'POST', '/versions');
    expect(post.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(post.body!.toString('latin1')).toContain('name="file"; filename="manual v2.pdf"');
    expect(multipartField(post, 'reviewDate')).toBeNull();
    await expect(page.getByText('Pendiente')).toBeVisible();
    await expect(page.getByText('manual-v2.pdf')).toBeVisible();
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E3 · Versión idéntica a la vigente', () => {
  test('409 IDENTICAL_TO_CURRENT: su mensaje y el archivo sigue elegido', async ({ page }) => {
    await openDocument(page, {
      overrides: () => ({
        uploadVersion: () =>
          apiError(409, 'El archivo es igual a la versión vigente', { reason: 'IDENTICAL_TO_CURRENT' }),
      }),
    });

    await page.getByRole('button', { name: 'Subir versión nueva' }).click();
    await chooseFile(page, pdfFile('manual.pdf'));
    await page.getByRole('button', { name: 'Subir versión', exact: true }).click();

    await expect(versionPanel(page).getByRole('alert')).toHaveText('Este archivo es igual a la versión vigente.');
    expect(await chosenFiles(page)).toBe(1);
    await expect(page.getByText('manual.pdf', { exact: true })).toBeVisible();
  });
});

test.describe('E4 · Versión con fecha de revisión nueva', () => {
  test('con fecha, el pedido lleva reviewDate y el detalle la muestra', async ({ page }) => {
    const { api } = await openDocument(page);

    await page.getByRole('button', { name: 'Subir versión nueva' }).click();
    await chooseFile(page, pdfFile('manual v2.pdf'));
    await page.getByLabel('Nueva fecha de revisión (opcional)').fill('2030-01-15');
    await page.getByRole('button', { name: 'Subir versión', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Versión 2 cargada' })).toBeVisible();
    const [post] = requestsTo(api.requests, 'POST', '/versions');
    expect(multipartField(post, 'reviewDate')).toBe('2030-01-15');
    await expect(page.getByText('15/01/2030')).toBeVisible();
  });
});

test.describe('E5 · Falla al subir la versión', () => {
  test('503: mensaje y archivo conservado; un segundo envío funciona', async ({ page }) => {
    let attempts = 0;
    // El primer intento falla; el segundo lo atiende la API simulada con estado.
    const { api } = await openDocument(page, {
      overrides: (defaults) => ({
        uploadVersion: (request, id) => {
          attempts += 1;
          return attempts === 1
            ? apiError(503, 'Service Unavailable')
            : defaults.uploadVersion!(request, id);
        },
      }),
    });

    await page.getByRole('button', { name: 'Subir versión nueva' }).click();
    await chooseFile(page, pdfFile('manual v2.pdf'));
    const submit = page.getByRole('button', { name: 'Subir versión', exact: true });
    await submit.click();

    await expect(versionPanel(page).getByRole('alert')).toContainText('Probá de nuevo en unos minutos');
    expect(await chosenFiles(page)).toBe(1);
    await expect(page.getByText('manual v2.pdf', { exact: true })).toBeVisible();

    await submit.click();
    await expect(page.getByRole('status').filter({ hasText: 'Versión 2 cargada' })).toBeVisible();
    expect(attempts).toBe(2);
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E6 · El responsable perdería el acceso', () => {
  test('al pasar a Operaciones aparece "…Elegí otro" y no se envía hasta elegir', async ({ page }) => {
    const { api } = await openDocument(page, {
      document: { ownerId: FIXTURE_USERS.supervisorVentas.id },
    });

    await page.getByRole('button', { name: 'Cambiar áreas' }).click();
    await page.getByRole('checkbox', { name: 'Operaciones' }).check();
    await page.getByRole('checkbox', { name: 'Ventas' }).uncheck();

    await expect(
      page.getByText('El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Guardar áreas' }).click();
    await expect(page.getByText('Elegí un responsable.')).toBeVisible();
    expect(requestsTo(api.requests, 'PATCH', '/areas')).toHaveLength(0);

    await page
      .getByRole('combobox', { name: 'Responsable' })
      .selectOption(FIXTURE_USERS.supervisorOperaciones.id);
    await page.getByRole('button', { name: 'Guardar áreas' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Áreas actualizadas' })).toBeVisible();
    const [patch] = requestsTo(api.requests, 'PATCH', '/areas');
    expect(JSON.parse(patch.body!.toString('utf8'))).toEqual({
      areaIds: [AREA_IDS.operaciones],
      ownerId: FIXTURE_USERS.supervisorOperaciones.id,
    });
  });
});

test.describe('E7 · Archivar', () => {
  test('"Archivar" → diálogo con el texto de R14 → "Archivar" → "Archivado desde…" y sin acciones', async ({
    page,
  }) => {
    const { api } = await openDocument(page);

    await page.getByRole('button', { name: 'Archivar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Archivar documento' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(R14);
    // R14: el foco empieza en "Cancelar", para que un Enter apurado no archive.
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

    await dialog.getByRole('button', { name: 'Archivar' }).click();

    await expect(page.getByText('Archivado desde 23/10/2026')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Documento archivado' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    for (const name of ACTIONS) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    expect(requestsTo(api.requests, 'POST', '/archive')).toHaveLength(1);
  });
});

test.describe('E11 · Archivar sin confirmar', () => {
  test('"Archivar" → "Cancelar": ningún POST …/archive y el documento sigue con sus acciones', async ({
    page,
  }) => {
    const { api } = await openDocument(page);

    await page.getByRole('button', { name: 'Archivar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Archivar documento' });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await expect(dialog).toHaveCount(0);
    for (const name of ACTIONS) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    expect(requestsTo(api.requests, 'POST', '/archive')).toHaveLength(0);
  });

  test('Escape también cierra sin archivar', async ({ page }) => {
    const { api } = await openDocument(page);

    await page.getByRole('button', { name: 'Archivar' }).click();
    await expect(page.getByRole('dialog', { name: 'Archivar documento' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(requestsTo(api.requests, 'POST', '/archive')).toHaveLength(0);
  });
});

// ---- T27: lo que ve cada rol (R1, R11, R12) ----

test.describe('E8 · Un rol sin permiso no ve las acciones', () => {
  for (const user of ['empleadoVentas', 'supervisorVentas'] as const) {
    test(`${user}: no ve "Cambiar áreas", "Subir versión nueva" ni "Archivar"`, async ({ page }) => {
      const { api } = await openDocument(page, { user });

      await expect(page.getByRole('button', { name: 'Descargar' })).toBeVisible();
      for (const name of ACTIONS) {
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      }
      expect(api.unhandled).toEqual([]);
    });
  }
});

test.describe('E9 · Documento archivado', () => {
  test('el ADMIN ve "Archivado desde…", sin acciones, y puede ver el historial', async ({ page }) => {
    const { api } = await openDocument(page, {
      document: { status: 'ARCHIVED', archivedAt: ARCHIVED_AT },
      versions: 2,
    });

    await expect(page.getByText('Archivado desde 23/10/2026')).toBeVisible();
    for (const name of ACTIONS) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Descargar' })).toBeVisible();

    await page.getByRole('button', { name: 'Historial de versiones' }).click();
    await expect(page.getByRole('list', { name: 'Versiones' }).getByRole('listitem')).toHaveCount(2);
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('E12 · Un empleado no ve el historial', () => {
  test('no está "Historial de versiones" y no se pide nada a /versions', async ({ page }) => {
    const { api } = await openDocument(page, { user: 'empleadoVentas', versions: 3 });

    await expect(page.getByRole('button', { name: 'Descargar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Historial de versiones' })).toHaveCount(0);
    await expect(page.getByText('Versión 3')).toHaveCount(0);
    // Si hubiera un pedido de más, ya habría salido junto con el detalle.
    await page.waitForLoadState('networkidle');
    expect(api.requests.filter((request) => request.path.includes('/versions'))).toEqual([]);
  });
});

test.describe('E13 · Historial de versiones', () => {
  test('tres versiones en orden; "Descargar" de la versión 2 pide su enlace y el navegador descarga', async ({
    page,
  }) => {
    let links = 0;
    const { api, state } = await openDocument(page, {
      versions: 3,
      overrides: () => ({
        versionDownload: (_request, _id, versionId) => {
          links += 1;
          return {
            status: 200,
            body: { url: `https://archivos.example.test/${versionId}.pdf?firma=${links}`, expiresAt: ARCHIVED_AT },
          };
        },
      }),
    });
    const v2 = versionHistory(state.document, 3).data[1];
    // Hace de S3: responde el archivo como adjunto, igual que el enlace firmado real.
    await page.route('https://archivos.example.test/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': `attachment; filename="${v2.originalFileName}"` },
        body: '%PDF-1.4\n',
      }),
    );

    // Empieza cerrado: no se pidió el historial.
    expect(api.requests.filter((request) => request.path.endsWith('/versions'))).toHaveLength(0);
    await page.getByRole('button', { name: 'Historial de versiones' }).click();

    const rows = page.getByRole('list', { name: 'Versiones' }).getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.getByRole('heading')).toHaveText(['Versión 3', 'Versión 2', 'Versión 1']);
    await expect(rows.nth(0)).toContainText('Vigente');
    await expect(rows.nth(1)).toContainText('Reemplazada');
    await expect(rows.nth(1)).toContainText('Ana Administradora');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar la versión 2' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe(v2.originalFileName);
    const versionLinks = api.requests.filter((request) => request.path.endsWith('/download'));
    expect(versionLinks.map((request) => request.path)).toEqual([
      `/api/documents/${state.document.id}/versions/${v2.id}/download`,
    ]);
    await expect(page).toHaveURL(new RegExp(`/documentos/${state.document.id}$`));
    expect(api.unhandled).toEqual([]);
  });
});
