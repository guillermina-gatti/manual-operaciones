// Las alertas de documentos contradictorios en el navegador (spec 011, T14), con la API simulada, en
// escritorio y celular. La API simulada tiene estado: "Marcar como resuelta" cambia la alerta y la lista
// devuelve cómo quedó.
import { expect, test } from '@playwright/test';
import type { ConflictAlert } from '../lib/api';
import { FIXTURE_USERS } from '../lib/directory/fixtures';
import { documentSummary, listResponse, mockApi } from './support/mock-api';
import type { ApiHandlers } from './support/mock-api';
import { loginAs } from './support/session';

const ALERT_ID = '0c000000-0000-4000-8000-000000000001';

function openAlert(): ConflictAlert {
  return {
    id: ALERT_ID,
    status: 'OPEN',
    documents: [
      {
        id: '11111111-1111-4111-8111-000000000001',
        title: 'Manual de compras',
        status: 'ACTIVE',
        versionNumber: 2,
        section: 'Aprobaciones',
        isCurrentVersion: true,
      },
      {
        id: '11111111-1111-4111-8111-000000000002',
        title: 'Política de gastos',
        status: 'ACTIVE',
        versionNumber: 1,
        section: 'Sin sección',
        isCurrentVersion: true,
      },
    ],
    question: '¿Quién aprueba una compra de $800.000?',
    firstDetectedAt: '2026-11-05T13:00:00.000Z',
    lastDetectedAt: '2026-11-07T13:00:00.000Z',
    occurrences: 3,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };
}

// La API de las alertas, con una sola alerta que empieza abierta.
function alertsApi(): ApiHandlers {
  let alert = openAlert();
  return {
    list: () => ({ status: 200, body: listResponse([documentSummary()]) }),
    conflictAlerts: (request) => {
      const status = request.search.get('status') ?? 'OPEN';
      const data = alert.status === status ? [alert] : [];
      const limit = Number(request.search.get('limit') ?? 20);
      return {
        status: 200,
        body: {
          data,
          total: data.length,
          openTotal: alert.status === 'OPEN' ? 1 : 0,
          page: Number(request.search.get('page') ?? 1),
          limit,
        },
      };
    },
    resolveConflictAlert: (request) => {
      const { note } = JSON.parse(request.body!.toString('utf8')) as { note?: string };
      const { id, name } = FIXTURE_USERS.admin;
      alert = {
        ...alert,
        status: 'RESOLVED',
        resolvedAt: '2026-11-08T15:00:00.000Z',
        resolvedBy: { id, name, isActive: true },
        resolutionNote: note ?? null,
      };
      return { status: 200, body: alert };
    },
  };
}

test('E11, E13: el ADMIN entra a "Alertas", ve la tarjeta y la marca como resuelta con una nota', async ({
  page,
}) => {
  await loginAs(page, 'admin');
  const api = await mockApi(page, alertsApi());

  await page.goto('/documentos');
  await page.getByRole('link', { name: 'Alertas: 1 abierta' }).click();

  await expect(page).toHaveURL(/\/documentos\/alertas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Alertas' })).toBeVisible();
  const card = page.getByRole('article');
  await expect(card.getByRole('link', { name: 'Manual de compras' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Política de gastos' })).toBeVisible();
  await expect(card.getByText('«¿Quién aprueba una compra de $800.000?»')).toBeVisible();
  await expect(
    card.getByText('Detectada el 05/11/2026 · Se detectó 3 veces · Última vez el 07/11/2026'),
  ).toBeVisible();

  await card.getByRole('button', { name: 'Marcar como resuelta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar la alerta como resuelta' });
  await dialog.getByRole('textbox', { name: 'Nota (opcional)' }).fill('Corregida la política en la v2');
  await dialog.getByRole('button', { name: 'Marcar como resuelta' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(/No hay alertas abiertas/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abiertas (0)' })).toBeVisible();
  const resolve = api.requests.find((r) => r.method === 'POST' && r.path.endsWith('/resolve'));
  expect(JSON.parse(resolve!.body!.toString('utf8'))).toEqual({ note: 'Corregida la política en la v2' });

  await page.getByRole('link', { name: 'Resueltas' }).click();
  await expect(page).toHaveURL(/\/documentos\/alertas\?estado=resueltas$/);
  const resolved = page.getByRole('article');
  await expect(resolved.getByText(`Resuelta el 08/11/2026 por ${FIXTURE_USERS.admin.name}`)).toBeVisible();
  await expect(resolved.getByText('Nota: Corregida la política en la v2')).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test('E12: un EMPLOYEE no ve el acceso, y en /documentos/alertas no tiene permiso', async ({ page }) => {
  await loginAs(page, 'empleadoVentas');
  const api = await mockApi(page, alertsApi());

  await page.goto('/documentos');
  await expect(page.getByRole('link', { name: 'Preguntale al asistente' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Alertas/ })).toHaveCount(0);

  await page.goto('/documentos/alertas');
  await expect(page.getByText('No tenés permiso para ver las alertas.')).toBeVisible();
  expect(api.requests.filter((r) => r.path === '/api/conflict-alerts')).toEqual([]);
});
