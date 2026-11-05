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
