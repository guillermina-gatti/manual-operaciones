// El asistente en el navegador (spec 009, T14), con la API simulada, en escritorio y celular.
// La API simulada manda los eventos SSE juntos: que el texto aparezca de a partes se prueba en Vitest.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  documentDetail,
  documentSummary,
  listResponse,
  mockApi,
  searchResponse,
  searchResult,
  sseReply,
} from './support/mock-api';
import { loginAs } from './support/session';

const DOC_ID = '11111111-1111-4111-8111-000000000001';

const question = (page: Page) => page.getByRole('textbox', { name: 'Tu pregunta' });

async function ask(page: Page, text: string) {
  await question(page).fill(text);
  await question(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'empleadoVentas');
});

test('E16: desde /documentos, "Preguntale al asistente" abre /asistente', async ({ page }) => {
  await mockApi(page, { list: () => ({ status: 200, body: listResponse([documentSummary()]) }) });

  await page.goto('/documentos');
  await page.getByRole('link', { name: 'Preguntale al asistente' }).click();

  await expect(page).toHaveURL(/\/asistente$/);
  await expect(page.getByRole('heading', { level: 1, name: 'El hornero' })).toBeVisible();
});

test('E1: una respuesta con su cita y la fuente que abre el detalle del documento', async ({ page }) => {
  const api = await mockApi(page, {
    chatStream: () =>
      sseReply([
        ['start', { conversationId: 'conv-1' }],
        ['delta', { text: 'El plazo es de ' }],
        ['delta', { text: '5 días [S1].' }],
        [
          'done',
          {
            conversationId: 'conv-1',
            messageId: 'msg-1',
            status: 'answered',
            answer: 'El plazo es de 5 días [S1].',
            sources: [
              {
                documentId: DOC_ID,
                documentTitle: 'Manual de compras',
                versionNumber: 2,
                section: 'Aprobaciones',
                chunkId: 'chunk-1',
                validFrom: '2026-10-01',
                url: '',
              },
            ],
          },
        ],
      ]),
    detail: () => ({ status: 200, body: documentDetail({ id: DOC_ID, title: 'Manual de compras' }) }),
  });

  await page.goto('/asistente');
  await ask(page, '¿Cuál es el plazo?');

  const conversation = page.getByRole('list', { name: 'Conversación' });
  await expect(conversation.getByText('¿Cuál es el plazo?')).toBeVisible();
  await expect(conversation.getByRole('link', { name: 'Fuente 1: Manual de compras' })).toBeVisible();
  const chatRequest = api.requests.find((r) => r.path === '/api/chat/stream');
  expect(JSON.parse(chatRequest!.body!.toString('utf8'))).toEqual({ message: '¿Cuál es el plazo?' });

  await conversation.getByRole('link', { name: /1 Manual de compras · v2 · Aprobaciones/ }).click();
  await expect(page).toHaveURL(new RegExp(`/documentos/${DOC_ID}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Manual de compras' })).toBeVisible();
});

test('E7: con la IA caída, el enlace abre /documentos con la búsqueda hecha', async ({ page }) => {
  await mockApi(page, {
    chatStream: () =>
      sseReply([
        ['start', { conversationId: 'conv-1' }],
        [
          'done',
          {
            conversationId: 'conv-1',
            messageId: 'msg-1',
            status: 'ai_unavailable',
            answer: 'El asistente no está disponible en este momento. Podés buscar directamente en los documentos.',
            sources: [],
            searchUrl: '/documentos?q=cierre%20de%20caja',
          },
        ],
      ]),
    list: () => ({ status: 200, body: listResponse([]) }),
    search: () => ({
      status: 200,
      body: searchResponse([searchResult({ title: 'Manual de caja' })]),
    }),
  });

  await page.goto('/asistente');
  await ask(page, 'cierre de caja');

  await page.getByRole('link', { name: 'Buscar «cierre de caja» en los documentos' }).click();

  await expect(page).toHaveURL(/\/documentos\?q=cierre(%20|\+)de(%20|\+)caja$/);
  await expect(page.getByRole('searchbox', { name: 'Buscar documentos' })).toHaveValue('cierre de caja');
  await expect(page.getByRole('article')).toHaveCount(1);
});
