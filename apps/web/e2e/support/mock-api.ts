// API simulada en el navegador (plan 002, sección 7.2): intercepta /api/** con page.route, así los
// escenarios corren sin backend, sin base y sin S3, y pueden forzar respuestas como el 409 o el 503.
import type { Page } from '@playwright/test';
import type {
  DocumentListResponse,
  DocumentResponse,
  DocumentSummary,
  DownloadUrl,
  VersionHistoryItem,
  VersionHistoryResponse,
} from '../../lib/api';
import { AREA_IDS, FIXTURE_USERS } from '../../lib/directory/fixtures';

export interface Reply {
  status: number;
  body?: unknown;
  // Para simular una respuesta lenta (por ejemplo, para ver "Cargando…").
  delayMs?: number;
}

// Lo que el test necesita del pedido para decidir y para comprobar.
export interface ApiRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  headers: Record<string, string>;
  // El cuerpo tal como lo mandó el navegador: multipart en la carga y la versión nueva, JSON en el
  // cambio de áreas.
  body: Buffer | null;
}

// id: el documento de la ruta; versionId: solo en la descarga de una versión (spec 003).
type Handler = (request: ApiRequest, id?: string, versionId?: string) => Reply | Promise<Reply>;

export interface ApiHandlers {
  list?: Handler; // GET /api/documents
  detail?: Handler; // GET /api/documents/:id
  download?: Handler; // GET /api/documents/:id/download
  upload?: Handler; // POST /api/documents
  // Spec 003 (T25): el ciclo de vida.
  changeAreas?: Handler; // PATCH /api/documents/:id/areas
  uploadVersion?: Handler; // POST /api/documents/:id/versions
  archive?: Handler; // POST /api/documents/:id/archive
  versions?: Handler; // GET /api/documents/:id/versions
  versionDownload?: Handler; // GET /api/documents/:id/versions/:versionId/download
}

export interface MockedApi {
  // Todos los pedidos a /api, en orden.
  requests: ApiRequest[];
  // Los que ningún handler atendió (respondidos con 501): un test puede exigir que no haya.
  unhandled: string[];
}

const ID = '([^/]+)';
const ROUTES: { name: keyof ApiHandlers; method: string; path: RegExp }[] = [
  { name: 'list', method: 'GET', path: /^\/api\/documents$/ },
  { name: 'upload', method: 'POST', path: /^\/api\/documents$/ },
  { name: 'download', method: 'GET', path: new RegExp(`^/api/documents/${ID}/download$`) },
  { name: 'detail', method: 'GET', path: new RegExp(`^/api/documents/${ID}$`) },
  { name: 'changeAreas', method: 'PATCH', path: new RegExp(`^/api/documents/${ID}/areas$`) },
  { name: 'uploadVersion', method: 'POST', path: new RegExp(`^/api/documents/${ID}/versions$`) },
  { name: 'archive', method: 'POST', path: new RegExp(`^/api/documents/${ID}/archive$`) },
  { name: 'versions', method: 'GET', path: new RegExp(`^/api/documents/${ID}/versions$`) },
  {
    name: 'versionDownload',
    method: 'GET',
    path: new RegExp(`^/api/documents/${ID}/versions/${ID}/download$`),
  },
];

export async function mockApi(page: Page, handlers: ApiHandlers): Promise<MockedApi> {
  const api: MockedApi = { requests: [], unhandled: [] };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiRequest: ApiRequest = {
      method: request.method(),
      path: url.pathname,
      search: url.searchParams,
      headers: await request.allHeaders(),
      body: request.postDataBuffer(),
    };
    api.requests.push(apiRequest);

    for (const { name, method, path } of ROUTES) {
      const match = apiRequest.method === method ? path.exec(url.pathname) : null;
      const handler = handlers[name];
      if (!match || !handler) continue;

      const reply = await handler(
        apiRequest,
        match[1] && decodeURIComponent(match[1]),
        match[2] && decodeURIComponent(match[2]),
      );
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      await route.fulfill({
        status: reply.status,
        contentType: 'application/json',
        body: reply.body === undefined ? '' : JSON.stringify(reply.body),
      });
      return;
    }

    api.unhandled.push(`${apiRequest.method} ${url.pathname}${url.search}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 501, message: 'No simulado en el test', error: 'Not Implemented' }),
    });
  });

  return api;
}

// ---- Datos de ejemplo con la forma de la API (plan 001, sección 3) ----

let counter = 0;
const nextId = () => {
  counter += 1;
  return `11111111-1111-4111-8111-${String(counter).padStart(12, '0')}`;
};

export function documentDetail(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  const id = overrides.id ?? nextId();
  return {
    id,
    title: 'Manual de caja',
    description: null,
    status: 'ACTIVE',
    areaIds: [AREA_IDS.ventas],
    ownerId: FIXTURE_USERS.supervisorVentas.id,
    reviewDate: '2027-03-01',
    createdById: FIXTURE_USERS.admin.id,
    createdAt: '2026-10-23T15:00:00.000Z',
    ...overrides,
    currentVersion: {
      id: `22222222-2222-4222-8222-${id.slice(-12)}`,
      versionNumber: 1,
      status: 'CURRENT',
      originalFileName: 'manual-de-caja.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2 * 1024 * 1024,
      processingStatus: 'PENDING',
      createdAt: '2026-10-23T15:00:00.000Z',
      ...overrides.currentVersion,
    },
  };
}

export function documentSummary(overrides: Partial<DocumentResponse> = {}): DocumentSummary {
  const { currentVersion, ...fields } = documentDetail(overrides);
  return {
    ...fields,
    currentVersion: {
      id: currentVersion.id,
      versionNumber: currentVersion.versionNumber,
      originalFileName: currentVersion.originalFileName,
      mimeType: currentVersion.mimeType,
      processingStatus: currentVersion.processingStatus,
    },
  };
}

export function listResponse(
  data: DocumentSummary[],
  total = data.length,
  page = 1,
): DocumentListResponse {
  return { data, total, page, limit: 20 };
}

// Spec 003: el historial de un documento con `count` versiones, de la más nueva a la más vieja.
// La más nueva es la vigente del documento; las demás, reemplazadas y procesadas.
export function versionHistory(document: DocumentResponse, count = 3): VersionHistoryResponse {
  const current = document.currentVersion;
  const data: VersionHistoryItem[] = [];
  for (let number = count; number >= 1; number -= 1) {
    const isCurrent = number === count;
    data.push({
      ...current,
      id: isCurrent
        ? current.id
        : `33333333-3333-4333-8333-${String(number).padStart(4, '0')}${document.id.slice(-8)}`,
      versionNumber: number,
      status: isCurrent ? 'CURRENT' : 'REPLACED',
      originalFileName: isCurrent ? current.originalFileName : `manual-v${number}.pdf`,
      processingStatus: isCurrent ? current.processingStatus : 'READY',
      uploadedById: FIXTURE_USERS.admin.id,
      createdAt: `2026-10-${String(10 + number).padStart(2, '0')}T15:00:00.000Z`,
    });
  }
  return { data };
}

export function downloadUrl(url: string): DownloadUrl {
  return { url, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
}

// El formato de error de Nest.
export function apiError(status: number, message: string | string[], extra: object = {}): Reply {
  return { status, body: { statusCode: status, message, error: 'Error', ...extra } };
}
