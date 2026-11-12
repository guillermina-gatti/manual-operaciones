// El asistente desde un paso de la ejecución (spec 010, T12), con la API simulada, en escritorio y
// celular. Que corte la respuesta en curso al cambiar de paso se prueba en Vitest.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ExecutionResponse } from '../lib/api';
import { mockApi, sseReply } from './support/mock-api';
import { loginAs } from './support/session';

const EXECUTION_ID = '22222222-2222-4222-8222-000000000001';
const VERSION_ID = '22222222-2222-4222-8222-000000000002';
const stepId = (order: number) => `22222222-2222-4222-8222-1000000000${String(order).padStart(2, '0')}`;
const TITLES = ['Abrir la caja', 'Contar el efectivo', 'Anotar el total', 'Cerrar la caja'];

// La ejecución con `done` pasos terminados: el actual es el siguiente.
function execution(done: number): ExecutionResponse {
  return {
    id: EXECUTION_ID,
    procedureId: '22222222-2222-4222-8222-000000000003',
    procedureVersionId: VERSION_ID,
    status: 'IN_PROGRESS',
    startedAt: '2026-11-04T10:00:00.000Z',
    finishedAt: null,
    currentStepId: stepId(done + 1),
    steps: TITLES.map((title, index) => ({
      stepId: stepId(index + 1),
      order: index + 1,
      title,
      startedAt: index <= done ? '2026-11-04T10:00:00.000Z' : null,
      finishedAt: index < done ? '2026-11-04T10:05:00.000Z' : null,
      durationMs: index < done ? 300_000 : null,
    })),
  };
}

const answer = (conversationId: string) =>
  sseReply([
    ['start', { conversationId }],
    ['delta', { text: 'Contá dos veces.' }],
    [
      'done',
      { conversationId, messageId: 'msg-1', status: 'answered', answer: 'Contá dos veces.', sources: [] },
    ],
  ]);

const assistant = (page: Page) => page.getByRole('complementary', { name: 'Asistente' });

async function ask(page: Page, text: string) {
  const box = assistant(page).getByRole('textbox', { name: 'Tu pregunta' });
  await box.fill(text);
  await box.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'empleadoVentas');
});

test('E1 y E14: el panel pregunta con el paso actual y empieza otra conversación al completarlo', async ({
  page,
}) => {
  const api = await mockApi(page, {
    execution: () => ({ status: 200, body: execution(2) }),
    completeStep: () => ({ status: 200, body: execution(3) }),
    chatStream: () => answer('conv-1'),
  });
  const chatBodies = () =>
    api.requests
      .filter((r) => r.path === '/api/chat/stream')
      .map((r) => JSON.parse(r.body!.toString('utf8')) as Record<string, unknown>);

  await page.goto(`/ejecuciones/${EXECUTION_ID}`);

  // E1: el paso 3 en la cabecera y el contexto en el pedido.
  await expect(assistant(page).getByRole('heading', { level: 2, name: '¿Dudas con este paso?' })).toBeVisible();
  await expect(assistant(page).getByText('Paso 3 · Anotar el total')).toBeVisible();
  await ask(page, '¿Dónde lo anoto?');
  const conversation = assistant(page).getByRole('list', { name: 'Conversación' });
  await expect(conversation.getByText('Contá dos veces.')).toBeVisible();
  expect(chatBodies()).toEqual([
    { message: '¿Dónde lo anoto?', context: { procedureVersionId: VERSION_ID, stepId: stepId(3) } },
  ]);

  // E14: al completar el paso, el panel muestra el 4, vacío, y la pregunta siguiente va sin conversationId.
  await page.getByRole('button', { name: 'Terminé este paso' }).click();
  await expect(assistant(page).getByText('Paso 4 · Cerrar la caja')).toBeVisible();
  await expect(conversation.getByText('¿Dónde lo anoto?')).toHaveCount(0);
  await ask(page, '¿Y ahora?');
  await expect(conversation.getByText('Contá dos veces.')).toBeVisible();
  expect(chatBodies()[1]).toEqual({
    message: '¿Y ahora?',
    context: { procedureVersionId: VERSION_ID, stepId: stepId(4) },
  });
  expect(api.unhandled).toEqual([]);
});

// El ancho del panel (12/11/2026): desde 1280 px, la columna del chat mide entre 360 y 400 px y la tarjeta de
// la fuente deja el título con espacio (antes quedaba con una letra por renglón). Por debajo, el panel va
// abajo de los pasos. Solo en el proyecto de escritorio: el ancho de la ventana es parte del caso.
test.describe('el ancho del panel y de la tarjeta de la fuente', () => {
  const withSource = (conversationId: string) =>
    sseReply([
      ['start', { conversationId }],
      ['delta', { text: 'No se puede devolver [S1].' }],
      [
        'done',
        {
          conversationId,
          messageId: 'msg-1',
          status: 'answered',
          answer: 'No se puede devolver [S1].',
          sources: [
            {
              documentId: '33333333-3333-4333-8333-000000000001',
              documentTitle: 'Política de devoluciones',
              versionNumber: 1,
              section: 'Productos sin cambio ni devolución',
              chunkId: '33333333-3333-4333-8333-000000000002',
              validFrom: '2026-10-01',
              url: '',
            },
          ],
        },
      ],
    ]);

  async function answerWithSource(page: Page, width: number) {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, {
      execution: () => ({ status: 200, body: execution(2) }),
      chatStream: () => withSource('conv-1'),
    });
    await page.goto(`/ejecuciones/${EXECUTION_ID}`);
    await ask(page, '¿Se puede devolver ropa interior?');
    const card = assistant(page).getByRole('list', { name: 'Fuentes' }).getByRole('link');
    await expect(card).toBeVisible();
    return card;
  }

  for (const width of [1280, 1440]) {
    test(`a ${width} px: la columna mide entre 360 y 400 px y el título de la fuente tiene más de 100 px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'escritorio', 'El ancho de la ventana es parte del caso');
      const card = await answerWithSource(page, width);

      const column = await assistant(page).boundingBox();
      expect(column!.width).toBeGreaterThanOrEqual(360);
      expect(column!.width).toBeLessThanOrEqual(400);
      // La columna del título: "FUENTE", el número con el título y "Vigente desde…".
      const title = await card.locator(':scope > span').nth(1).boundingBox();
      expect(title!.width).toBeGreaterThan(100);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  }

  test('a 1100 px: el panel va abajo de los pasos, a todo el ancho', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'escritorio', 'El ancho de la ventana es parte del caso');
    await answerWithSource(page, 1100);

    const steps = await page.getByRole('button', { name: 'Terminé este paso' }).boundingBox();
    const column = await assistant(page).boundingBox();
    expect(column!.y).toBeGreaterThan(steps!.y);
    expect(column!.width).toBeGreaterThan(600);
  });
});
