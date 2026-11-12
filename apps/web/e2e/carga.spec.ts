// Escenarios de carga en el navegador, con la API simulada (T25; plan 002, sección 7.2).
// El formulario se usa como lo usaría una persona. Corren en escritorio y en celular (F10).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TestFile } from './support/files';
import { docxFile, megabytes, pdfFile } from './support/files';
import { apiError, documentDetail, mockApi } from './support/mock-api';
import type { MockedApi } from './support/mock-api';
import { accessTokenFor, loginAs, userId } from './support/session';

const REVIEW_DATE = '2030-01-15';
const NOTICE = 'El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro';

const owner = (page: Page) => page.getByRole('combobox', { name: 'Responsable' });
const submit = (page: Page) => page.getByRole('button', { name: /Cargar documento|Cargando…/ });
const uploads = (api: MockedApi) =>
  api.requests.filter((r) => r.method === 'POST' && r.path === '/api/documents');

async function openForm(page: Page) {
  await loginAs(page, 'admin');
  await page.goto('/documentos/nuevo');
  await expect(page.getByRole('group', { name: 'Áreas' })).toBeVisible();
}

// Espera a que el responsable ofrezca a esa persona (los candidatos llegan del directorio).
async function chooseOwner(page: Page, label: string) {
  await expect(owner(page).locator('option', { hasText: label })).toHaveCount(1);
  await owner(page).selectOption({ label });
}

async function fillForm(
  page: Page,
  file: TestFile,
  { areas = ['Ventas'], ownerLabel = 'Sergio Supervisor de Ventas (Supervisor)' } = {},
) {
  await page.getByLabel('Archivo').setInputFiles(file);
  await page.getByLabel('Título').fill('Manual de caja');
  for (const area of areas) await page.getByRole('checkbox', { name: area }).check();
  await chooseOwner(page, ownerLabel);
  await page.getByLabel('Fecha de revisión').fill(REVIEW_DATE);
}

// Lo completado sigue igual, incluido el archivo elegido (F4).
async function expectFormKept(page: Page, file: TestFile) {
  await expect(page.getByLabel('Título')).toHaveValue('Manual de caja');
  await expect(page.getByRole('checkbox', { name: 'Ventas' })).toBeChecked();
  await expect(owner(page)).toHaveValue(userId('supervisorVentas'));
  await expect(page.getByLabel('Fecha de revisión')).toHaveValue(REVIEW_DATE);
  expect(await page.getByLabel('Archivo').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe(
    file.name,
  );
}

test.describe('E1 · El admin carga un documento', () => {
  test('con un PDF de 2 MB y todos los campos, va al detalle con el procesamiento "Pendiente"', async ({
    page,
  }) => {
    const created = documentDetail({ title: 'Manual de caja' });
    const api = await mockApi(page, {
      upload: () => ({ status: 201, body: created, delayMs: 800 }),
      detail: () => ({ status: 200, body: created }),
    });
    await openForm(page);
    const file = pdfFile('manual.pdf', megabytes(2));
    await fillForm(page, file, { areas: ['Ventas', 'Operaciones'] });

    await submit(page).click();

    // F5: mientras sube, un solo envío posible.
    await expect(submit(page)).toBeDisabled();
    await expect(submit(page)).toHaveText('Cargando…');

    // F13: al detalle del documento creado, con el estado que ve la ADMIN (F6).
    await page.waitForURL(new RegExp(`/documentos/${created.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Manual de caja' })).toBeVisible();
    await expect(page.getByText('Pendiente')).toBeVisible();

    // El pedido: multipart, un areaIds por área, el archivo y la sesión.
    const [request] = uploads(api);
    expect(uploads(api)).toHaveLength(1);
    expect(request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(request.headers.authorization).toBe(`Bearer ${accessTokenFor('admin')}`);
    const body = request.body?.toString('latin1') ?? '';
    expect(body.match(/name="areaIds"/g)).toHaveLength(2);
    expect(body).toContain('filename="manual.pdf"');
    expect(body).toContain(`name="ownerId"\r\n\r\n${userId('supervisorVentas')}`);
    expect(api.unhandled).toEqual([]);

    // D4: al volver al formulario después de una carga correcta, empieza vacío.
    await page.goBack();
    await expect(page.getByLabel('Título')).toHaveValue('');
    expect(await page.getByLabel('Archivo').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  });
});

test.describe('E3 · El responsable se elige entre quienes pueden ver el documento', () => {
  test('con Ventas no aparece el EMPLOYEE de Operaciones y sí la ADMIN', async ({ page }) => {
    await mockApi(page, {});
    await openForm(page);

    await page.getByRole('checkbox', { name: 'Ventas' }).check();

    await expect(owner(page).locator('option', { hasText: 'Ana Administradora (Administrador)' })).toHaveCount(1);
    await expect(owner(page).locator('option', { hasText: 'Elena Empleada de Ventas (Empleado)' })).toHaveCount(1);
    await expect(owner(page).locator('option', { hasText: 'Emilio Empleado de Operaciones' })).toHaveCount(0);
  });
});

test.describe('E4 · El responsable deja de ser válido al cambiar las áreas', () => {
  test('con Ventas y un responsable de Ventas, al pasar a Operaciones la elección se borra', async ({
    page,
  }) => {
    await mockApi(page, {});
    await openForm(page);
    await page.getByRole('checkbox', { name: 'Ventas' }).check();
    await chooseOwner(page, 'Sergio Supervisor de Ventas (Supervisor)');

    await page.getByRole('checkbox', { name: 'Ventas' }).uncheck();
    await page.getByRole('checkbox', { name: 'Operaciones' }).check();

    await expect(owner(page)).toHaveValue('');
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(owner(page).locator('option', { hasText: 'Emilio Empleado de Operaciones' })).toHaveCount(1);
  });
});

test.describe('E5 · Archivo inválido antes de subir', () => {
  test('un .docx y un archivo de 11 MB muestran el error junto al campo y no se envía nada', async ({
    page,
  }) => {
    const api = await mockApi(page, {});
    await openForm(page);
    const fileInput = page.getByLabel('Archivo');

    await fileInput.setInputFiles(docxFile());
    await expect(fileInput).toHaveAccessibleDescription(/El archivo tiene que ser PDF, \.txt o \.md\./);

    await fileInput.setInputFiles(pdfFile('manual.pdf', megabytes(11)));
    await expect(fileInput).toHaveAccessibleDescription(/El archivo pesa más de 10 MB\./);

    // Aunque complete lo demás y envíe, el formulario no se envía (F2).
    await page.getByLabel('Título').fill('Manual de caja');
    await submit(page).click();
    await expect(fileInput).toBeFocused();
    expect(uploads(api)).toHaveLength(0);
  });
});

test.describe('E6 · Archivo duplicado', () => {
  test('con 409, mensaje y enlace al documento existente; al volver, el formulario sigue completo', async ({
    page,
  }) => {
    const existing = documentDetail({ title: 'Manual de caja (el que ya estaba)' });
    const api = await mockApi(page, {
      upload: () =>
        apiError(409, 'Ya hay un documento vigente con el mismo archivo', {
          existingDocumentId: existing.id,
        }),
      detail: () => ({ status: 200, body: existing }),
    });
    await openForm(page);
    const file = pdfFile('manual.pdf', megabytes(2));
    await fillForm(page, file);

    await submit(page).click();

    const banner = page.getByRole('alert').filter({ hasText: 'Ya existe un documento con este mismo archivo.' });
    await expect(banner).toBeVisible();
    await expectFormKept(page, file);

    await banner.getByRole('link', { name: 'Ver el documento existente' }).click();
    await page.waitForURL(new RegExp(`/documentos/${existing.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: existing.title })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/documentos\/nuevo$/);
    await expectFormKept(page, file);
    expect(uploads(api)).toHaveLength(1);
  });
});

test.describe('E7 · La API no está disponible', () => {
  test('con 503, "probá de nuevo en unos minutos" y el formulario sigue; un segundo envío funciona', async ({
    page,
  }) => {
    const created = documentDetail({ title: 'Manual de caja' });
    let attempts = 0;
    const api = await mockApi(page, {
      upload: () => {
        attempts += 1;
        return attempts === 1 ? apiError(503, 'Service Unavailable') : { status: 201, body: created };
      },
      detail: () => ({ status: 200, body: created }),
    });
    await openForm(page);
    const file = pdfFile('manual.pdf', megabytes(2));
    await fillForm(page, file);

    await submit(page).click();

    await expect(page.getByText('El servicio no está disponible. Probá de nuevo en unos minutos.')).toBeVisible();
    await expectFormKept(page, file);

    await submit(page).click();

    await page.waitForURL(new RegExp(`/documentos/${created.id}$`));
    expect(uploads(api)).toHaveLength(2);
    // El segundo envío manda el mismo archivo, sin volver a elegirlo.
    expect(uploads(api)[1].body?.toString('latin1')).toContain('filename="manual.pdf"');
    expect(api.unhandled).toEqual([]);
  });
});
