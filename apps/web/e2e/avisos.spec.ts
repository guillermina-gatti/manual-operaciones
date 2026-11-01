// Escenarios de los avisos de vencimiento en el navegador, con la API simulada (spec 005, T24;
// plan 005, sección 8.4). Corren en escritorio y en celular (F6). La pantalla no calcula el estado:
// muestra el que manda la API (D16).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DocumentResponse, DocumentSummary, ReviewStatus } from '../lib/api';
import { FIXTURE_USERS } from '../lib/directory/fixtures';
import {
  apiError,
  documentDetail,
  listResponse,
  mockApi,
  pendingReviewHandler,
} from './support/mock-api';
import type { ApiHandlers, Reply } from './support/mock-api';
import { loginAs } from './support/session';
import type { TestUser } from './support/session';

// Una fecha válida en cualquier día que corra el test.
const FAR = '2099-05-09';

const review = (status: ReviewStatus | null, lastReviewedById: string | null = null) => ({
  status,
  lastReviewedAt: lastReviewedById ? '2026-11-10T02:30:00.000Z' : null,
  lastReviewedById,
});

// Un documento de Ventas cuya responsable es la EMPLOYEE de Ventas.
const owned = (title: string, reviewDate: string, status: ReviewStatus): DocumentResponse =>
  documentDetail({
    title,
    ownerId: FIXTURE_USERS.empleadoVentas.id,
    reviewDate,
    archivedAt: null,
    review: review(status),
  });
const summaryOf = ({ currentVersion, ...fields }: DocumentResponse): DocumentSummary => ({
  ...fields,
  currentVersion: {
    id: currentVersion.id,
    versionNumber: currentVersion.versionNumber,
    originalFileName: currentVersion.originalFileName,
    mimeType: currentVersion.mimeType,
    processingStatus: currentVersion.processingStatus,
  },
});
const withoutReview = (document: DocumentResponse): DocumentResponse => {
  const copy = { ...document };
  delete copy.review;
  return copy;
};

const cards = (page: Page) => page.getByRole('article');
const cardTitled = (page: Page, title: string) =>
  cards(page).filter({ has: page.getByRole('link', { name: title }) });
const dateField = (page: Page) => page.getByLabel('Próxima fecha de revisión');
const markButton = (page: Page) => page.getByRole('button', { name: 'Marcar como revisado' });

// Abre el detalle de un documento con una API simulada con estado: "Marcar como revisado" cambia el
// documento y el detalle devuelve cómo quedó. `markReply` fuerza otra respuesta (400, 403, 409).
async function openDetail(
  page: Page,
  user: TestUser,
  document: DocumentResponse,
  markReply?: () => Reply,
) {
  await loginAs(page, user);
  let current = document;
  const handlers: ApiHandlers = {
    detail: () => ({ status: 200, body: current }),
    versions: () => ({ status: 200, body: { data: [] } }),
    markReviewed: (request) => {
      if (markReply) return markReply();
      const { reviewDate } = JSON.parse(request.body!.toString('utf8')) as { reviewDate: string };
      current = { ...current, reviewDate, review: review('UP_TO_DATE', FIXTURE_USERS[user].id) };
      return { status: 200, body: current };
    },
  };
  const api = await mockApi(page, handlers);
  await page.goto(`/documentos/${document.id}`);
  await expect(page.getByRole('heading', { level: 1, name: document.title })).toBeVisible();
  return api;
}

test.describe('etiquetas en el listado y el detalle (F1)', () => {
  const dueSoon = owned('Manual de caja', '2026-11-19', 'DUE_SOON');
  const overdue = owned('Procedimiento de cierre', '2026-11-04', 'OVERDUE');
  const upToDate = owned('Instructivo de devoluciones', '2027-02-07', 'UP_TO_DATE');

  test('E1, E2 y E3: "Vence pronto", "Vencido" y al día sin etiqueta, en las tarjetas', async ({ page }) => {
    await loginAs(page, 'empleadoVentas');
    const api = await mockApi(page, {
      list: () => ({
        status: 200,
        body: listResponse([dueSoon, overdue, upToDate].map(summaryOf)),
      }),
      pendingReview: pendingReviewHandler([overdue, dueSoon].map(summaryOf)),
    });

    await page.goto('/documentos');

    await expect(cardTitled(page, 'Manual de caja')).toContainText('Vence pronto');
    await expect(cardTitled(page, 'Procedimiento de cierre')).toContainText('Vencido');
    await expect(cardTitled(page, 'Instructivo de devoluciones')).not.toContainText(
      /Vencido|Vence pronto/,
    );
    expect(api.unhandled).toEqual([]);
  });

  test('E2: el ADMIN ve "Vencido" en el detalle', async ({ page }) => {
    await openDetail(page, 'admin', overdue);

    await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText('Vencido');
  });

  test('E4: un documento que vence hoy se ve "Vence pronto" (lo decide la API)', async ({ page }) => {
    await openDetail(page, 'empleadoVentas', owned('Vence hoy', '2026-11-09', 'DUE_SOON'));

    await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText('Vence pronto');
  });
});

test.describe('E5 · Un empleado que no es responsable no ve avisos', () => {
  test('sin etiquetas, sin "Por revisar" y sin "Marcar como revisado"', async ({ page }) => {
    // La API no le manda `review` (R4).
    const document = withoutReview(owned('Manual de caja', '2026-11-04', 'OVERDUE'));
    await loginAs(page, 'supervisorVentas');
    const api = await mockApi(page, {
      list: () => ({ status: 200, body: listResponse([summaryOf(document)]) }),
      detail: () => ({ status: 200, body: document }),
      pendingReview: pendingReviewHandler([], false),
    });

    await page.goto('/documentos');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).not.toContainText(/Vencido|Vence pronto/);
    await expect(page.getByRole('link', { name: /Por revisar/ })).toHaveCount(0);

    await cards(page).getByRole('link', { name: 'Manual de caja' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Manual de caja' })).toBeVisible();
    await expect(page.getByText(/Vencido|Vence pronto/)).toHaveCount(0);
    await expect(markButton(page)).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });
});

test.describe('"Por revisar" (F2, F3)', () => {
  test('E6: el acceso con la cantidad lleva a la lista, con los vencidos primero', async ({ page }) => {
    const overdue = owned('Procedimiento de cierre', '2026-11-04', 'OVERDUE');
    const dueSoon = owned('Manual de caja', '2026-11-19', 'DUE_SOON');
    await loginAs(page, 'empleadoVentas');
    const api = await mockApi(page, {
      list: () => ({ status: 200, body: listResponse([dueSoon, overdue].map(summaryOf)) }),
      pendingReview: pendingReviewHandler([overdue, dueSoon].map(summaryOf)),
    });

    await page.goto('/documentos');
    await page.getByRole('link', { name: 'Por revisar: 2 documentos' }).click();

    await expect(page).toHaveURL(/\/documentos\/por-revisar$/);
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText('Procedimiento de cierre');
    await expect(cards(page).nth(0)).toContainText('Vencido');
    await expect(cards(page).nth(0)).toContainText('04/11/2026');
    await expect(cards(page).nth(1)).toContainText('Vence pronto');
    expect(api.unhandled).toEqual([]);
  });

  test('E7: el ADMIN ve los pendientes de distintos responsables', async ({ page }) => {
    const ofSergio = documentDetail({
      title: 'De Sergio',
      ownerId: FIXTURE_USERS.supervisorVentas.id,
      reviewDate: '2026-11-19',
      review: review('DUE_SOON'),
    });
    const ofEmilio = documentDetail({
      title: 'De Emilio',
      ownerId: FIXTURE_USERS.empleadoOperaciones.id,
      reviewDate: '2026-11-20',
      review: review('DUE_SOON'),
    });
    await loginAs(page, 'admin');
    await mockApi(page, { pendingReview: pendingReviewHandler([ofSergio, ofEmilio].map(summaryOf)) });

    await page.goto('/documentos/por-revisar');

    await expect(cards(page)).toHaveCount(2);
    await expect(cardTitled(page, 'De Sergio')).toContainText('Sergio Supervisor de Ventas');
    await expect(cardTitled(page, 'De Emilio')).toContainText('Emilio Empleado de Operaciones');
  });

  test('E13: sin pendientes, "No tenés documentos para revisar"', async ({ page }) => {
    await loginAs(page, 'empleadoVentas');
    await mockApi(page, {
      list: () => ({ status: 200, body: listResponse([]) }),
      pendingReview: pendingReviewHandler([], true),
    });

    await page.goto('/documentos');
    await page.getByRole('link', { name: 'Por revisar: ningún documento' }).click();

    await expect(page.getByText('No tenés documentos para revisar')).toBeVisible();
  });
});

test.describe('"Marcar como revisado" (F4, F5)', () => {
  const overdue = owned('Manual de caja', '2026-11-04', 'OVERDUE');

  test('E8: la responsable elige la fecha, marca, ve "Revisión registrada" y la etiqueta desaparece', async ({ page }) => {
    const api = await openDetail(page, 'empleadoVentas', overdue);
    await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText('Vencido');

    await dateField(page).fill(FAR);
    await markButton(page).click();

    await expect(page.getByText('Revisión registrada')).toBeVisible();
    await expect(page.getByText(/Vencido|Vence pronto/)).toHaveCount(0);
    await expect(page.getByText('Última revisión')).toBeVisible();
    await expect(page.getByText(/por Elena Empleada de Ventas/)).toBeVisible();
    const marked = api.requests.filter((request) => request.path.endsWith('/review'));
    expect(marked).toHaveLength(1);
    expect(JSON.parse(marked[0].body!.toString('utf8'))).toEqual({ reviewDate: FAR });
  });

  test('E9: 400 → el error junto al campo, con la fecha intacta', async ({ page }) => {
    await openDetail(page, 'empleadoVentas', overdue, () =>
      apiError(400, ['reviewDate tiene que ser posterior a hoy (2099-05-08)']),
    );

    await dateField(page).fill(FAR);
    await markButton(page).click();

    await expect(page.getByText('La fecha de revisión tiene que ser a partir de mañana.')).toBeVisible();
    await expect(dateField(page)).toHaveValue(FAR);
  });

  test('E10: 403 → "No tenés permiso para marcar este documento como revisado.", con la fecha intacta', async ({ page }) => {
    await openDetail(page, 'empleadoVentas', overdue, () => apiError(403, 'Forbidden'));

    await dateField(page).fill(FAR);
    await markButton(page).click();

    await expect(page.getByRole('alert').filter({ hasText: 'No tenés permiso' })).toHaveText(
      'No tenés permiso para marcar este documento como revisado.',
    );
    await expect(dateField(page)).toHaveValue(FAR);
  });

  test('E11: 409 ARCHIVED → "El documento fue archivado…", con la fecha intacta', async ({ page }) => {
    await openDetail(page, 'admin', overdue, () =>
      apiError(409, 'El documento está archivado', { reason: 'ARCHIVED' }),
    );

    await dateField(page).fill(FAR);
    await markButton(page).click();

    await expect(page.getByText('El documento fue archivado. Ya no se puede modificar.')).toBeVisible();
    await expect(dateField(page)).toHaveValue(FAR);
  });
});

test.describe('celular (F6)', () => {
  test('sin desplazamiento horizontal en el listado, el detalle y "Por revisar"', async ({ page }) => {
    const longTitle = owned(
      'Procedimiento-de-cierre-de-caja-diario-con-supervisor-y-arqueo-completo',
      '2026-11-04',
      'OVERDUE',
    );
    await loginAs(page, 'empleadoVentas');
    await mockApi(page, {
      list: () => ({ status: 200, body: listResponse([summaryOf(longTitle)]) }),
      detail: () => ({ status: 200, body: longTitle }),
      pendingReview: pendingReviewHandler([summaryOf(longTitle)]),
    });
    const noHorizontalScroll = async () =>
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);

    await page.goto('/documentos');
    await expect(cards(page)).toHaveCount(1);
    await noHorizontalScroll();

    await page.goto(`/documentos/${longTitle.id}`);
    await expect(markButton(page)).toBeVisible();
    await noHorizontalScroll();

    await page.goto('/documentos/por-revisar');
    await expect(cards(page)).toHaveCount(1);
    await noHorizontalScroll();
  });
});
