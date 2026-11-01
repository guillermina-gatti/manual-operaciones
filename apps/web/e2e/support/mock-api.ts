// API simulada en el navegador (plan 002, sección 7.2): intercepta /api/** con page.route, así los
// escenarios corren sin backend, sin base y sin S3, y pueden forzar respuestas como el 409 o el 503.
import type { Page } from "@playwright/test";
import type {
  DocumentListResponse,
  DocumentResponse,
  DocumentSearchResponse,
  DocumentSearchResult,
  DocumentSummary,
  DownloadUrl,
  PendingReviewResponse,
  SearchFragment,
  VersionHistoryItem,
  VersionHistoryResponse,
} from "../../lib/api";
import { AREAS, AREA_IDS, FIXTURE_USERS } from "../../lib/directory/fixtures";
import { filterOwnerCandidates } from "../../lib/documents/owner-candidates";
import {
  DEV_FIXTURE_PASSWORD,
  devEmail,
} from "../../lib/session/dev-credentials";
import { accessTokenFor } from "./session";
import type { TestUser } from "./session";

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
type Handler = (
  request: ApiRequest,
  id?: string,
  versionId?: string,
) => Reply | Promise<Reply>;

export interface ApiHandlers {
  areas?: Handler; // GET /api/areas (T28)
  users?: Handler; // GET /api/users?areaIds=... (T29)
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
  // Spec 004 (T16): la búsqueda.
  search?: Handler; // GET /api/documents/search
  // Spec 005 (T23): los avisos de vencimiento. Sin `pendingReview`, ver DEFAULT_PENDING_REVIEW.
  pendingReview?: Handler; // GET /api/documents/pending-review
  markReviewed?: Handler; // POST /api/documents/:id/review
}

// Spec 005 (T23): el listado pide en segundo plano la cantidad de "Por revisar" (F2). Un test que no
// simula `pendingReview` no está probando eso: la API simulada responde que el usuario no es revisor
// (el acceso no aparece) y ese pedido no se anota en `requests` ni en `unhandled`, así los tests de las
// specs 002 a 004 siguen viendo solo sus pedidos. Decidido con el usuario el 30/10/2026.
const PENDING_REVIEW_PATH = "/api/documents/pending-review";
const DEFAULT_PENDING_REVIEW = {
  data: [],
  total: 0,
  page: 1,
  limit: 1,
  isReviewer: false,
};

export interface MockedApi {
  // Todos los pedidos a /api, en orden, menos los de /api/auth.
  requests: ApiRequest[];
  // Los pedidos de la sesión a /api/auth (login, refresh y logout), en orden.
  auth: ApiRequest[];
  // Los que ningún handler atendió (respondidos con 501): un test puede exigir que no haya.
  unhandled: string[];
}

const ID = "([^/]+)";
const ROUTES: { name: keyof ApiHandlers; method: string; path: RegExp }[] = [
  { name: "areas", method: "GET", path: /^\/api\/areas$/ },
  { name: "users", method: "GET", path: /^\/api\/users$/ },
  { name: "list", method: "GET", path: /^\/api\/documents$/ },
  { name: "upload", method: "POST", path: /^\/api\/documents$/ },
  // Antes que el detalle: /api/documents/search también coincide con /api/documents/:id.
  { name: "search", method: "GET", path: /^\/api\/documents\/search$/ },
  // Spec 005: lo mismo con /api/documents/pending-review.
  {
    name: "pendingReview",
    method: "GET",
    path: /^\/api\/documents\/pending-review$/,
  },
  {
    name: "markReviewed",
    method: "POST",
    path: new RegExp(`^/api/documents/${ID}/review$`),
  },
  {
    name: "download",
    method: "GET",
    path: new RegExp(`^/api/documents/${ID}/download$`),
  },
  { name: "detail", method: "GET", path: new RegExp(`^/api/documents/${ID}$`) },
  {
    name: "changeAreas",
    method: "PATCH",
    path: new RegExp(`^/api/documents/${ID}/areas$`),
  },
  {
    name: "uploadVersion",
    method: "POST",
    path: new RegExp(`^/api/documents/${ID}/versions$`),
  },
  {
    name: "archive",
    method: "POST",
    path: new RegExp(`^/api/documents/${ID}/archive$`),
  },
  {
    name: "versions",
    method: "GET",
    path: new RegExp(`^/api/documents/${ID}/versions$`),
  },
  {
    name: "versionDownload",
    method: "GET",
    path: new RegExp(`^/api/documents/${ID}/versions/${ID}/download$`),
  },
];

// La sesión (plan 002, sección 3.1), como la API de la pareja A: el login con la contraseña de desarrollo
// da a cada usuario el token de accessTokenFor; el refresh responde 401 (al cargar la página no hay
// cookie, así que la web inicia sesión); el logout siempre responde 200.
function authReply(request: ApiRequest): Reply {
  if (request.method === "POST" && request.path === "/api/auth/login") {
    const { email, password } = JSON.parse(
      request.body?.toString() ?? "{}",
    ) as Record<string, string>;
    const key = (Object.keys(FIXTURE_USERS) as TestUser[]).find(
      (candidate) => devEmail(FIXTURE_USERS[candidate].id) === email,
    );
    if (!key || password !== DEV_FIXTURE_PASSWORD)
      return apiError(401, "Credenciales inválidas");
    const { id, name, role } = FIXTURE_USERS[key];
    return {
      status: 200,
      body: {
        accessToken: accessTokenFor(key),
        user: { id, name, email, role },
      },
    };
  }
  if (request.method === "POST" && request.path === "/api/auth/refresh") {
    return apiError(401, "Sesión inválida o expirada");
  }
  if (request.method === "POST" && request.path === "/api/auth/logout") {
    return { status: 200, body: { revoked: true } };
  }
  return apiError(404, "No existe");
}

export async function mockApi(
  page: Page,
  handlers: ApiHandlers,
): Promise<MockedApi> {
  const api: MockedApi = { requests: [], auth: [], unhandled: [] };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiRequest: ApiRequest = {
      method: request.method(),
      path: url.pathname,
      search: url.searchParams,
      headers: await request.allHeaders(),
      body: request.postDataBuffer(),
    };

    if (url.pathname.startsWith("/api/auth/")) {
      api.auth.push(apiRequest);
      const reply = authReply(apiRequest);
      await route.fulfill({
        status: reply.status,
        contentType: "application/json",
        body: JSON.stringify(reply.body),
      });
      return;
    }

    if (
      !handlers.pendingReview &&
      apiRequest.method === "GET" &&
      url.pathname === PENDING_REVIEW_PATH
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DEFAULT_PENDING_REVIEW),
      });
      return;
    }

    // Los E2E de Documentos existentes no prueban el directorio: devolvemos el catálogo de
    // fixtures sin contar este pedido. Un test de T28 puede pasar handlers.areas para controlarlo.
    if (
      !handlers.areas &&
      apiRequest.method === "GET" &&
      url.pathname === "/api/areas"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AREAS),
      });
      return;
    }

    // Los E2E anteriores usan usuarios de fixtures. Solo cuando ningún test configura
    // handlers.users respondemos el directorio de candidatos sin contar el pedido.
    if (
      !handlers.users &&
      apiRequest.method === "GET" &&
      url.pathname === "/api/users"
    ) {
      const ids = apiRequest.search.getAll("areaIds");
      const allowed = new Set<string>(
        AREAS.filter((area) => area.isActive).map((area) => area.id),
      );
      const valid =
        ids.length > 0 &&
        [...apiRequest.search.keys()].every((key) => key === "areaIds") &&
        ids.every((id) => allowed.has(id));
      const reply: Reply = valid
        ? {
            status: 200,
            body: filterOwnerCandidates(Object.values(FIXTURE_USERS), ids)
              .map(({ id, name, role }) => ({ id, name, role }))
              .sort(
                (a, b) =>
                  a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
              ),
          }
        : apiError(
            400,
            "areaIds: alguna de las áreas es inexistente o inactiva",
          );
      await route.fulfill({
        status: reply.status,
        contentType: "application/json",
        body: JSON.stringify(reply.body),
      });
      return;
    }

    api.requests.push(apiRequest);

    for (const { name, method, path } of ROUTES) {
      const match =
        apiRequest.method === method ? path.exec(url.pathname) : null;
      const handler = handlers[name];
      if (!match || !handler) continue;

      const reply = await handler(
        apiRequest,
        match[1] && decodeURIComponent(match[1]),
        match[2] && decodeURIComponent(match[2]),
      );
      if (reply.delayMs)
        await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      await route.fulfill({
        status: reply.status,
        contentType: "application/json",
        body: reply.body === undefined ? "" : JSON.stringify(reply.body),
      });
      return;
    }

    api.unhandled.push(`${apiRequest.method} ${url.pathname}${url.search}`);
    await route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 501,
        message: "No simulado en el test",
        error: "Not Implemented",
      }),
    });
  });

  return api;
}

// ---- Datos de ejemplo con la forma de la API (plan 001, sección 3) ----

let counter = 0;
const nextId = () => {
  counter += 1;
  return `11111111-1111-4111-8111-${String(counter).padStart(12, "0")}`;
};

export function documentDetail(
  overrides: Partial<DocumentResponse> = {},
): DocumentResponse {
  const id = overrides.id ?? nextId();
  return {
    id,
    title: "Manual de caja",
    description: null,
    status: "ACTIVE",
    areaIds: [AREA_IDS.ventas],
    ownerId: FIXTURE_USERS.supervisorVentas.id,
    reviewDate: "2027-03-01",
    createdById: FIXTURE_USERS.admin.id,
    createdAt: "2026-10-23T15:00:00.000Z",
    ...overrides,
    currentVersion: {
      id: `22222222-2222-4222-8222-${id.slice(-12)}`,
      versionNumber: 1,
      status: "CURRENT",
      originalFileName: "manual-de-caja.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2 * 1024 * 1024,
      processingStatus: "PENDING",
      createdAt: "2026-10-23T15:00:00.000Z",
      ...overrides.currentVersion,
    },
  };
}

export function documentSummary(
  overrides: Partial<DocumentResponse> = {},
): DocumentSummary {
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
export function versionHistory(
  document: DocumentResponse,
  count = 3,
): VersionHistoryResponse {
  const current = document.currentVersion;
  const data: VersionHistoryItem[] = [];
  for (let number = count; number >= 1; number -= 1) {
    const isCurrent = number === count;
    data.push({
      ...current,
      id: isCurrent
        ? current.id
        : `33333333-3333-4333-8333-${String(number).padStart(4, "0")}${document.id.slice(-8)}`,
      versionNumber: number,
      status: isCurrent ? "CURRENT" : "REPLACED",
      originalFileName: isCurrent
        ? current.originalFileName
        : `manual-v${number}.pdf`,
      processingStatus: isCurrent ? current.processingStatus : "READY",
      uploadedById: FIXTURE_USERS.admin.id,
      createdAt: `2026-10-${String(10 + number).padStart(2, "0")}T15:00:00.000Z`,
    });
  }
  return { data };
}

// Spec 004: un resultado de búsqueda; sin `parts`, la coincidencia es solo en el título (sin fragmento).
export function searchResult(
  overrides: Partial<DocumentResponse> = {},
  parts?: SearchFragment["parts"],
  pageNumber: number | null = null,
): DocumentSearchResult {
  return {
    ...documentSummary(overrides),
    archivedAt: null,
    fragment: parts ? { parts, pageNumber } : null,
  };
}

export function searchResponse(
  data: DocumentSearchResult[],
  total = data.length,
  page = 1,
): DocumentSearchResponse {
  return { data, total, page, limit: 20 };
}

// Spec 005: la respuesta de "Por revisar". Los documentos traen su `review` (documentSummary con
// overrides). Con limit=1 es la que pide el acceso del listado; con 20, la lista.
export function pendingReviewResponse(
  data: DocumentSummary[],
  { total = data.length, page = 1, limit = 20, isReviewer = true } = {},
): PendingReviewResponse {
  return { data, total, page, limit, isReviewer };
}

// Responde "Por revisar" según el limit del pedido, como la API: el acceso pide 1 y la lista 20.
export function pendingReviewHandler(
  data: DocumentSummary[],
  isReviewer = true,
): (request: ApiRequest) => Reply {
  return (request) => {
    const limit = Number(request.search.get("limit") ?? 20);
    const page = Number(request.search.get("page") ?? 1);
    return {
      status: 200,
      body: pendingReviewResponse(
        data.slice((page - 1) * limit, page * limit),
        {
          total: data.length,
          page,
          limit,
          isReviewer,
        },
      ),
    };
  };
}

export function downloadUrl(url: string): DownloadUrl {
  return { url, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
}

// El formato de error de Nest.
export function apiError(
  status: number,
  message: string | string[],
  extra: object = {},
): Reply {
  return {
    status,
    body: { statusCode: status, message, error: "Error", ...extra },
  };
}
