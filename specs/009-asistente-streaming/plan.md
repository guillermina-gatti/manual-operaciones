# Plan 009 · Asistente: respuesta en streaming y respaldo con la búsqueda

- **Spec:** [spec.md](./spec.md) (HU20 y la parte de HU36 que faltaba)
- **Planes de referencia:** [plan 002](../002-pantallas-documentos/plan.md) (cliente HTTP y pantallas), [plan 004](../004-busqueda-documentos/plan.md) (búsqueda y `?q=`) y [plan 008](../008-documentos-referencias-historicas/plan.md) (formato y arnés de integración). El chat de HU17 (PR #38 y #39 de Guille) no tiene plan en `specs/`: se cita por archivo.
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** escrito el 04/11/2026, para revisar. Sin código. Las decisiones están en la sección 7.1; no quedan preguntas abiertas (sección 7.2).

En este plan, R1 a R15 y F1 a F10 son reglas de la spec; D1 a D14, sus decisiones (spec, sección 10); E1 a E17, sus escenarios (sección 11, en el orden en que aparecen); y PD1 a PD13, las decisiones de este plan (sección 7.1).

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | La respuesta aparece de a partes | E10 | Se corta la conexión |
| E2 | Las dos rutas responden lo mismo | E11 | El usuario sale de la pantalla |
| E3 | La ruta actual no cambia | E12 | Enlace con una pregunta larga |
| E4 | Formato de la transmisión | E13 | Errores antes de transmitir |
| E5 | Sin información | E14 | La conversación sigue |
| E6 | La marca NO_INFO nunca se ve | E15 | Citas por orden |
| E7 | La IA no está disponible | E16 | Acceso al chat |
| E8 | El modelo tarda demasiado | E17 | Accesible con lector de pantalla |
| E9 | El modelo deja de mandar texto | | |

## 0. Punto de partida

**El chat de Guille (`apps/api/src/chat`, en `develop` desde el PR #39)**

- `ChatController`: `POST /api/chat` con `JwtAuthGuard`, `@HttpCode(200)` y `ValidationPipe({ whitelist: true })` sobre `ChatRequestDto`. Llama a `ChatService.ask(user, body)`.
- `ChatService(embeddings, retrieval, llm, repository)`:
  - `ask` resuelve la conversación (404 si no es del usuario), llama a `run`, guarda el mensaje (`saveMessage`, con la latencia desde el principio) y arma el `ChatResult`.
  - `run`:
    1. sin áreas → `no_info`;
    2. `embeddings.embedMany([question])` en un `try`, que si falla da `ai_unavailable`;
    3. `retrieval.search(vector, areaIds, TOP_K)` y el filtro por `MAX_COSINE_DISTANCE`, que sin fragmentos da `no_info`;
    4. los pasajes `S1…`;
    5. `llm.answer` en un `try`, que si falla da `ai_unavailable`;
    6. si el texto empieza con `NO_INFO` → `no_info`;
    7. si no, `answered` con `citedChunks`.
  - `citedChunks`, `toSources` y `unavailable` son funciones del archivo, sin exportar.
- `ChatLlm` (abstracta): `answer(question, passages)`. `GeminiChatLlm` la implementa con `generateText`, un `SYSTEM_PROMPT` local, el armado de los pasajes y `AbortSignal.timeout(CHAT_TIMEOUT_MS = 15_000)`, con `maxRetries: 1`.
- `ChatModule` importa `ProcessingModule` (que exporta `EmbeddingProvider`) y registra `ChatService`, `PrismaChatRetrieval`, `PrismaChatRepository` y `GeminiChatLlm` (con `google(CHAT_MODEL_ID)`).
- `chat.service.spec.ts`: 8 tests con `FakeEmbeddings`, `FakeRetrieval`, `FakeLlm` (extiende `ChatLlm` e implementa solo `answer`) y `FakeRepository`. Importa de `./chat.service`: `ChatService`, `MAX_COSINE_DISTANCE`, `NO_INFO_TEXT` y `UNAVAILABLE_TEXT`.
- No hay tests de integración del chat ni Swagger en `ChatController`.

**Plataforma:** NestJS 12 sobre Express (`@nestjs/platform-express`), AI SDK `ai@7.0.140` (con `streamText`, y `MockLanguageModelV4` y `simulateReadableStream` en `ai/test`) y `@ai-sdk/google@4.0.102`.

**La web**

- `lib/api/client.ts` (plan 002): `createApiClient(getAuthHeaders, refreshAuth)` devuelve `{ request }`.
  - `send(path, init)` pone `Accept: application/json` y los encabezados de sesión, y convierte un error de red en `ApiError(0)`.
  - `request` exige el prefijo `/api/`, renueva una vez después de un 401 y lee JSON.
  - Lo usan Documentos, Ejecuciones y Métricas.
- El rewrite de Next (`next.config`) manda `/api/:path*` a la API.
- No hay pantalla ni cliente del chat. El menú es `SessionControls` (pareja A).
- La búsqueda: `/documentos?q=…`, con `SEARCH_MIN = 3` y `SEARCH_MAX = 100` (`lib/documents/search-rules.ts`).

**Pruebas:** Jest en la API (`pnpm --filter api test`, `test:e2e`); Vitest y Testing Library en la web; Playwright con la API simulada (`e2e/support/mock-api.ts`) y contra la API real (`e2e/integracion`).

## 1. La API

### 1.1 Extracción de la orquestación (`chat-pipeline.ts`, nuevo; R14, D8)

Se mueve el código tal cual. Solo se agrega `export` y las dependencias pasan a ser parámetros:

```ts
// Movidas de chat.service.ts, sin cambios:
export const TOP_K = 6;
export const MAX_COSINE_DISTANCE = 0.45;
export const NO_INFO_MARKER = 'NO_INFO';
export const NO_INFO_TEXT = '…';
export const UNAVAILABLE_TEXT = '…';
export interface ChatUser { id: string; areaIds: string[] }
export interface Outcome { status; answer; chunks: RetrievedChunk[]; llm?: LlmAnswer }
export function unavailable(): Outcome;
export function citedChunks(text: string, chunks: RetrievedChunk[]): RetrievedChunk[];
export function toSources(chunks: RetrievedChunk[]): ChatSource[];

// Pasos 1 a 4 de run: o un resultado final, o los fragmentos y los pasajes.
export type Prepared =
  | { kind: 'done'; outcome: Outcome }
  | { kind: 'ready'; chunks: RetrievedChunk[]; passages: Passage[] };
export async function prepareChat(
  embeddings: EmbeddingProvider, retrieval: ChatRetrieval, user: ChatUser, question: string, logger: Logger,
): Promise<Prepared>;

// Pasos 6 y 7 de run.
export function finishChat(llm: LlmAnswer, chunks: RetrievedChunk[]): Outcome;

// De ask, después de run: saveMessage con los mismos campos y la latencia desde startedAt, y el ChatResult.
export async function saveResult(
  repository: ChatRepository, conversationId: string, question: string, outcome: Outcome, startedAt: number,
): Promise<ChatResult>;
```

`chat.service.ts` queda así:
- `ask` hace `started = Date.now()` y resuelve la conversación (con el mismo 404); después hace `outcome = await this.run(...)` y `return saveResult(...)`.
- `run` hace `prepareChat`; si da `done`, devuelve ese resultado. Si no, `llm.answer` con el mismo `try/catch` y el mismo `logger.warn`, y `finishChat`.
- Vuelve a exportar `TOP_K`, `MAX_COSINE_DISTANCE`, `NO_INFO_MARKER`, `NO_INFO_TEXT`, `UNAVAILABLE_TEXT` y `ChatUser` desde `chat-pipeline`.

El `logger` se pasa como parámetro para que los mensajes de aviso salgan con el mismo contexto (`ChatService`) que hoy (PD1).

**Comprobación de que no cambia nada:**
- `chat.service.spec.ts` se corre antes de tocar el archivo y después, sin cambios (`git diff` del spec vacío).
- `chat-pipeline.spec.ts` (nuevo) prueba cada función.

### 1.2 Puerto y adaptador (R12, R13)

```ts
// ports/chat-llm.ts: se agrega, sin tocar answer.
export interface LlmStream {
  textStream: AsyncIterable<string>; // las partes, en orden
  final: Promise<LlmAnswer>;         // al terminar: texto completo, modelo y tokens
}
export abstract class ChatLlm {
  abstract answer(question: string, passages: Passage[]): Promise<LlmAnswer>;
  // No abstracto (R12): por defecto, answer en una sola parte.
  stream(question: string, passages: Passage[], signal: AbortSignal): LlmStream { … }
}
```

- **Implementación por defecto:** `final = this.answer(question, passages)` y `textStream` entrega `(await final).text` en una parte. La señal se respeta antes de empezar.
- **`GeminiChatLlm.stream`:** `streamText({ model, system: SYSTEM_PROMPT, prompt, abortSignal: signal, maxRetries: 1 })`.
  - El prompt sale de una función local `buildPrompt(question, passages)`, que también usa `answer`. Es el mismo texto de hoy.
  - `textStream` es el `textStream` del resultado.
  - `final` arma `LlmAnswer` con `await result.text` y `await result.usage`.
  - **No** usa `CHAT_TIMEOUT_MS`: los tiempos los maneja el servicio con la señal (PD4).
  - Un error del modelo hace fallar `textStream` o `final`, y el servicio lo trata como `ai_unavailable`.

### 1.3 `searchUrl` (`chat-search-url.ts`, nuevo; R8, D9)

`buildSearchUrl(question: string): string`, pura y exportada, para que Guille la reutilice en su ruta (aviso 6). Pasos:
1. Reemplaza `/\s+/g` por un espacio y saca los espacios de los extremos.
2. Si el texto pasa de 100 caracteres, lo corta en el último espacio dentro de los primeros 100; si no hay espacios, en el carácter 100. Después vuelve a sacar los espacios de los extremos.
3. Con menos de 3 caracteres devuelve `/documentos`; si no, `/documentos?q=${encodeURIComponent(texto)}`.

Usa constantes propias `SEARCH_MIN = 3` y `SEARCH_MAX = 100`, con un comentario que apunta a la spec 004: la API no tiene esas constantes de la web.

El tipo de la ruta nueva va en `chat-stream.types.ts`: `ChatStreamDone = ChatResult & { searchUrl?: string }`, más los tipos de los eventos. `chat.contract.ts` no cambia.

### 1.4 Servicio de streaming (`chat-stream.service.ts`, nuevo)

`ChatStreamService` es un provider de `ChatModule` (PD2), con los mismos puertos que `ChatService`: `EmbeddingProvider`, `ChatRetrieval`, `ChatLlm` y `ChatRepository`. Tiene dos pasos, para que los errores de R2 salgan antes de abrir la transmisión:

```ts
// 1. Antes de transmitir: resolver la conversación. NotFoundException pasa; cualquier otro error es
//    503 "El asistente no está disponible en este momento" (R2; PD7).
open(user: ChatUser, request: ChatRequest): Promise<{ conversationId: string; startedAt: number }>;

// 2. Transmitir: manda los eventos a `sink` y termina siempre con un done o un error,
//    salvo que `clientSignal` se aborte (R11).
run(user, request, opened, sink: ChatEventSink, clientSignal: AbortSignal): Promise<void>;
```

`ChatEventSink` es una interfaz `{ start(id); delta(text); done(result); error(body) }`. El controlador la implementa sobre la respuesta HTTP y los tests, con un arreglo (PD3).

Algoritmo de `run`:

1. `sink.start(conversationId)`.
2. `prepareChat(withTimeout(embeddings, 15 s), retrieval, user, question, logger)` (PD5). Con `done` → `saveResult` y `sink.done({ ...result, searchUrl? })` → fin.
3. Un `AbortController` propio, que se aborta por cualquiera de estas causas:
   - el cliente cortó (`clientSignal`);
   - 15 s sin el primer texto;
   - 15 s sin texto nuevo (se reinicia con cada parte);
   - 60 s en total.

   Las constantes van exportadas: `FIRST_TEXT_TIMEOUT_MS`, `IDLE_TIMEOUT_MS` y `TOTAL_TIMEOUT_MS`.
4. `llm.stream(question, passages, controller.signal)`. Se recorre `textStream` con un **retén de la marca** (R6):
   - se acumula el texto;
   - mientras el texto sin espacios iniciales tenga menos caracteres que `NO_INFO_MARKER` y el modelo no haya terminado, no se manda nada;
   - al alcanzar ese largo, si empieza con la marca, se deja de mandar (pero se sigue leyendo hasta `final`);
   - si no empieza con la marca, se manda lo acumulado sin los espacios iniciales y, desde ahí, cada parte como `delta`.
5. `await final`, y `finishChat(final, chunks)` decide el estado con el texto completo, igual que la ruta actual (R4).
6. Si algo falla en los pasos 4 y 5 (error del modelo o un tiempo de espera), queda `unavailable()`, aunque ya se hayan mandado `delta` (R10).
7. Si `clientSignal` está abortado: no se guarda ni se manda nada más (R11, D13), y fin.
8. `saveResult(...)` y `sink.done(...)`, con `searchUrl: buildSearchUrl(question)` si el estado es `ai_unavailable`. Si `saveResult` falla → `sink.error({ statusCode: 503, message: UNAVAILABLE_TEXT })`.
9. En un `finally`: se limpian los temporizadores y se aborta el controlador propio.

`withTimeout` es una función local que envuelve `embedMany` con `Promise.race` contra un temporizador. No cambia el `EmbeddingProvider` de procesamiento.

### 1.5 Controlador y formato (`chat-stream.controller.ts`, nuevo; R1 a R3)

- `@Controller('chat')`, `@UseGuards(JwtAuthGuard)` y `@Post('stream')`. Los errores de R2 salen antes de que corra el handler: el `ValidationPipe({ whitelist: true })` sobre el mismo `ChatRequestDto` da 400 y el guard, 401.
- El handler recibe `@Res() res: Response` y `@Req() req` (Express):
  1. `opened = await service.open(...)`. Si lanza, Nest responde JSON: 404 o 503.
  2. `res.status(200)`, los encabezados de R3 y `res.flushHeaders()`.
  3. Un `AbortController` del cliente que se aborta con `res.on('close')` si `!res.writableEnded`.
  4. `await service.run(..., sseSink(res), clientAbort.signal)` y `res.end()`.
- `sse-writer.ts` (nuevo): `formatEvent(event, data) = "event: <e>\ndata: <JSON.stringify(data)>\n\n"` y `sseSink(res)`. Si `res.writableEnded`, no escribe.
- **Swagger:** `@ApiTags('Asistente')`, `@ApiBearerAuth()`, `@ApiBody({ type: ChatRequestDto })` y la respuesta 200 con `content: { 'text/event-stream': … }`, describiendo los cuatro eventos. También 400, 401, 404 y 503.
- `chat.module.ts`: suma `ChatStreamController` a `controllers` y `ChatStreamService` a `providers`. Nada más.

## 2. La web

### 2.1 `client.stream` (`lib/api/client.ts`; D10, F9)

Se agrega un segundo método al objeto que devuelve `createApiClient`; `request` y `send` no cambian:

```ts
export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  // Nuevo: la respuesta sin leer, para transmisiones (spec 009).
  stream(path: string, init?: RequestInit): Promise<Response>;
}
```

- Exige el prefijo `/api/`, como `request`.
- Llama a `send` con `Accept: text/event-stream` en `init.headers`. `send` pone `Accept: application/json` con `headers.set`, así que para no cambiar `send`, `stream` arma sus propios encabezados con la misma función de sesión (PD10).
- Renueva una vez después de un 401, como `request`.
- Si la respuesta no es `ok`, lanza el mismo `ApiError` que `request`, con el cuerpo JSON del error. Si es `ok`, devuelve la `Response`.

Los tests existentes del cliente pasan sin cambios, y se suman los de `stream`.

### 2.2 Lectura de la transmisión (`lib/chat/`, `lib/api/chat.ts`; nuevos)

- **`lib/chat/sse.ts`:** `createSseParser(onEvent)` devuelve `push(chunk: string)` y `end()`.
  - Separa los eventos por línea vacía (acepta `\n` y `\r\n`).
  - Junta las líneas `data:` e ignora los comentarios (`:`) y los eventos desconocidos.
  - Es puro e incremental: un evento puede venir partido en varios fragmentos.
- **`lib/api/chat.ts`:** `askStream(client, body, { signal, onStart, onDelta })` devuelve `Promise<ChatStreamDone>`.
  - Lee `response.body` con `getReader()` y `TextDecoder` (`stream: true`).
  - Resuelve con `done`.
  - Lanza `ChatStreamError` con `kind`:
    - `'error'`, con el cuerpo del evento `error`;
    - `'cut'`, si el cuerpo termina sin evento final o falla la lectura;
    - `'http'`, con el `ApiError` de `stream`.
  - Un `AbortError` pasa tal cual.
  - Los tipos `ChatResult`, `ChatSource` y `ChatStreamDone` se copian del contrato de la API, como el resto de `lib/api`.
- **`lib/chat/search-url.ts`:** la misma regla que `buildSearchUrl` de la API (R8), con `SEARCH_MIN` y `SEARCH_MAX` de `lib/documents/search-rules.ts`. Los dos tests usan la misma tabla de casos (sección 3).
- **`lib/chat/citations.ts`:** `linkCitations(answer, sources)` devuelve los segmentos de texto y de cita (`{ type: 'text' | 'cite', … }`) con la regla de F4 y D14:
  - marcas `[Sn]` sin repetir, de menor a mayor, en ese orden contra `sources`;
  - si la cantidad no coincide, el texto sin marcas y sin citas.

### 2.3 Pantalla `/asistente` (F1 a F10)

- **`app/asistente/page.tsx`:** componente de servidor sin datos, con `metadata` "Asistente · Manual de operaciones", que monta `<ChatScreen />`. Sin `useSearchParams`, así que no necesita `Suspense`.
- **`components/chat/ChatScreen.tsx`** (cliente):
  - Un `useReducer` con la conversación: `conversationId`, la lista de mensajes y el estado de la transmisión (sección 7 de la spec).
  - Usa `useSession` para la sesión y el `ApiClient` de siempre.
  - Al enviar, crea un `AbortController` que se aborta al desmontar la pantalla (R11) y llama a `askStream`.
  - Con `onDelta`, agrega el texto a la burbuja.
  - Con `done`, reemplaza el texto por el final y guarda el estado.
  - Con un error, borra el texto parcial (F5).
- **`components/chat/ChatHeader.tsx`:** fondo `bg-celeste`, "El hornero" y la línea del alcance (F2).
- **`components/chat/ChatMessage.tsx`:**
  - Burbuja del usuario: `bg-bosque text-blanco`, a la derecha.
  - Burbuja de respuesta: tarjeta blanca, a la izquierda. Mientras se genera lleva `aria-busy`.
  - Con `answered`, el texto con las citas de `linkCitations` y `ChatSources`.
  - Con `no_info`, una caja `border-dashed`.
  - Con `ai_unavailable`, corte o error, el aviso y el enlace "Buscar «…» en los documentos". El enlace es `searchUrl` o, si falta, `buildSearchUrl` de la web.
- **`components/chat/ChatSources.tsx`:** un botón-enlace por fuente, "n Título · vN · Sección", a `/documentos/<id>`. Las citas en el texto son enlaces a la misma ruta, con `aria-label` "Fuente n: …".
- **`components/chat/ChatComposer.tsx`:**
  - Área de texto "Tu pregunta", de hasta 2.000 caracteres, con contador.
  - "Preguntar ✦" con `bg-naranja-boton text-blanco`.
  - Enter envía y Shift+Enter agrega una línea. Deshabilitado mientras hay una transmisión en curso.
  - "Nueva conversación" (secundario).
- **Anuncio:** una región `aria-live="polite"` fuera de las burbujas recibe el texto final con `done` o el error (F8).
- **Estilos:** con `components/documents/design.tsx` como referencia (botones, tarjetas, estados), pero sin importarlo desde `components/chat`. Las piezas que hagan falta en las dos pantallas se copian a `components/chat/design.tsx` (PD13).

### 2.4 Acceso desde `/documentos` (F1, D11)

`DocumentList` (nuestro) suma, junto a "Por revisar", un enlace secundario "Preguntale al asistente" a `/asistente`, para todos los roles con sesión. Cuando la pareja A agregue el enlace al menú, este se puede dejar o sacar en un PR aparte.

### 2.5 Lo que cambia en los tests y apoyos existentes

- `tests/components/documents/DocumentList*.test.tsx`: si alguno cuenta los enlaces de la cabecera, suma el nuevo.
- `e2e/support/mock-api.ts`: `Reply` suma `contentType?` y `rawBody?` para responder SSE en Playwright simulado, y un handler `chatStream` (PD12).
- `test/documents/helpers.ts`: `createDocumentsTestApp` suma una opción `configure?(builder)` para reemplazar `ChatLlm` y `EmbeddingProvider` en la integración del chat (PD11). Las suites de documentos no la usan.

## 3. Estrategia de pruebas

### 3.1 Unitarios (Jest, API)

| Qué se prueba | Casos |
| --- | --- |
| `chat.service.spec.ts` (de Guille) | **Sin cambios.** Se corre antes y después de la extracción |
| `chat-pipeline.spec.ts` | `prepareChat`: sin áreas, embedding que falla, umbral, pasajes `S1…`. `finishChat`: `NO_INFO`, citas, sin citas. `saveResult`: los campos guardados y la latencia |
| `chat-llm.spec.ts` | La implementación por defecto de `stream`: una sola parte, `final` igual a `answer`, señal abortada antes de empezar |
| `gemini-chat-llm.spec.ts` | Con `MockLanguageModelV4` y `simulateReadableStream`: las partes en orden, el mismo prompt que `answer`, la señal llega a `streamText`, `final` con tokens, error a mitad |
| `chat-search-url.spec.ts` | La tabla de R8: corta, larga con y sin espacios, menos de 3, saltos de línea, `&`, `#`, `¿`, tildes |
| `chat-stream.service.spec.ts` | Orden de eventos (E4); `answered` con los `delta` que forman el `answer` (E1); sin áreas, umbral y `NO_INFO` sin `delta` (E5, E6); "Normalmente…" y respuestas de menos de 7 caracteres; embedding que falla; error a mitad (R10); `searchUrl` (E7); 404 y 503 en `open`; error al guardar → `error`; tiempos con temporizadores simulados: primer texto, inactividad, total y embedding (E8, E9); cliente que corta: sin guardar ni eventos (E11) |
| `chat-routes.parity.spec.ts` | Para cada caso (answered con citas, sin citas, umbral, `NO_INFO`, sin áreas, embedding caído, modelo caído): `ChatService.ask` y `ChatStreamService` con los mismos simulados dan el mismo `status`, `answer` y `sources`, y guardan el mismo mensaje salvo la latencia (E2) |
| `sse-writer.spec.ts` | Formato de cada evento, JSON en una línea, nada después de `end` |

### 3.2 Integración (Supertest + PostgreSQL, API)

`test/chat/chat-stream.e2e-spec.ts` (nueva):
- **Arnés:** `createDocumentsTestApp({ configure })` con un `ChatLlm` simulado que transmite en partes y un `EmbeddingProvider` simulado de 768 dimensiones. Los fragmentos se siembran con `seedDocument` y `seedProcessedVersion`, y el embedding se fija con SQL.
- **Casos:**
  - encabezados y orden de eventos (E4);
  - 400, 401 y 404 en JSON, sin abrir la transmisión (E13);
  - `conversationId` de `start` reutilizado (E14);
  - el mensaje queda en `messages` con el mismo estado;
  - **paridad por HTTP:** la misma pregunta por `POST /api/chat` y `POST /api/chat/stream` da el mismo `status`, `answer` y `sources` (E2, E3).

Resetea `manual_test`: **se pide la confirmación del usuario** antes de correrla.

### 3.3 Web (Vitest + Testing Library)

| Qué se prueba | Casos |
| --- | --- |
| `tests/lib/api/client.test.ts` | Los de hoy, sin cambios; `stream`: prefijo, encabezados de sesión, renovación tras un 401, `ApiError` con el cuerpo del error, `Response` con `ok` |
| `tests/lib/chat/sse.test.ts` | Eventos partidos en varios fragmentos, `\r\n`, comentarios, eventos desconocidos, varios eventos en un fragmento |
| `tests/lib/api/chat.test.ts` | `askStream`: `onStart`, `onDelta` y `done`; `error`; corte sin evento final (E10); `AbortError` |
| `tests/lib/chat/search-url.test.ts` | La misma tabla que la API (E12) |
| `tests/lib/chat/citations.test.ts` | `[S2]` y `[S5]` → 1 y 2 (E15); marcas repetidas; sin marcas; `[S9]` que no coincide |
| `tests/components/chat/ChatScreen.test.tsx` | Con un `ReadableStream` controlado: el texto crece antes de `done` (E1); citas y fuentes con enlaces; `no_info` en caja punteada (E5); `ai_unavailable` con el enlace (E7); texto parcial borrado tras un error (E9); corte con "Volver a preguntar" (E10); desmontar aborta el pedido (E11); `conversationId` en la segunda pregunta y "Nueva conversación" (E14); `aria-busy` y anuncio final (E17); Enter y Shift+Enter; botón deshabilitado |
| `tests/components/documents/DocumentList.test.tsx` | El enlace "Preguntale al asistente" (E16) |

### 3.4 Playwright con la API simulada (`e2e/asistente.spec.ts`, nueva)

En escritorio y celular, con `mock-api.ts` respondiendo SSE:
- desde `/documentos`, "Preguntale al asistente" → `/asistente` (E16);
- una respuesta con citas y la fuente que abre el detalle (E1);
- `ai_unavailable` → el enlace abre `/documentos?q=…` con resultados (E7).

No hay Playwright contra la API real con Gemini: costaría tokens en cada corrida. La transmisión real a través del proxy de Next se comprueba a mano en la verificación final.

## 4. Escenario → test

| Escenario | Unitario (API) | Integración | Web / Playwright |
| --- | --- | --- | --- |
| E1 · De a partes | `chat-stream.service.spec.ts`, `gemini-chat-llm.spec.ts` | `chat-stream.e2e-spec.ts` | `ChatScreen`, `asistente.spec.ts` |
| E2 · Las dos rutas iguales | `chat-routes.parity.spec.ts` | `chat-stream.e2e-spec.ts` | — |
| E3 · La ruta actual no cambia | `chat.service.spec.ts` (sin cambios), `chat-pipeline.spec.ts` | `chat-stream.e2e-spec.ts` | — |
| E4 · Formato | `chat-stream.service.spec.ts`, `sse-writer.spec.ts` | `chat-stream.e2e-spec.ts` | `sse.test.ts` |
| E5 · Sin información | `chat-stream.service.spec.ts` | — | `ChatScreen` |
| E6 · NO_INFO nunca se ve | `chat-stream.service.spec.ts` | — | — |
| E7 · IA no disponible | `chat-stream.service.spec.ts`, `chat-search-url.spec.ts` | — | `ChatScreen`, `asistente.spec.ts` |
| E8 · Tarda demasiado | `chat-stream.service.spec.ts` | — | — |
| E9 · Deja de mandar texto | `chat-stream.service.spec.ts` | — | `ChatScreen` |
| E10 · Se corta la conexión | — | — | `chat.test.ts`, `ChatScreen` |
| E11 · Sale de la pantalla | `chat-stream.service.spec.ts` | — | `ChatScreen` |
| E12 · Pregunta larga | `chat-search-url.spec.ts` | — | `search-url.test.ts` |
| E13 · Errores antes de transmitir | `chat-stream.service.spec.ts` | `chat-stream.e2e-spec.ts` | `client.test.ts` |
| E14 · La conversación sigue | — | `chat-stream.e2e-spec.ts` | `ChatScreen` |
| E15 · Citas por orden | — | — | `citations.test.ts`, `ChatScreen` |
| E16 · Acceso al chat | — | — | `DocumentList`, `asistente.spec.ts` |
| E17 · Lector de pantalla | — | — | `ChatScreen` |

## 5. Dependencias nuevas

Ninguna. `streamText` y `ai/test` ya vienen con `ai@7.0.140`; `ReadableStream` y `TextDecoder` son del navegador y de Node.

## 6. Orden de merge

- La API (sección 1) se puede mergear sola: la ruta nueva no cambia nada visible.
- **La extracción (1.1) va en su propio commit,** antes de todo lo demás, para que Guille la revise aparte (aviso 7 de la spec).
- La web (sección 2) va después de la API, o en el mismo PR: sin la ruta nueva, la pantalla solo muestra errores.

## 7. Decisiones y preguntas abiertas

### 7.1 Decisiones

Propuestas al escribir el plan, el 04/11/2026:

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| PD1 · ¿Cómo quedan las funciones extraídas? | Funciones sueltas en `chat-pipeline.ts`, con las dependencias (y el `logger`) por parámetro; no un provider nuevo. Así `ChatService` no cambia su constructor ni sus tests | R14 |
| PD2 · ¿El servicio de streaming es un provider? | Sí, `ChatStreamService` en `ChatModule`, con los mismos cuatro puertos que `ChatService` | R15 |
| PD3 · ¿Cómo se prueba sin HTTP? | El servicio escribe en un `ChatEventSink`; el controlador lo implementa sobre Express y los tests, con un arreglo | 1.4, 1.5 |
| PD4 · ¿Dónde viven los tiempos? | En el servicio, con un `AbortController` y temporizadores; el adaptador solo respeta la señal. Constantes exportadas para los tests | R9 |
| PD5 · ¿Cómo se limita el embedding sin tocar procesamiento? | `withTimeout` local alrededor de `embedMany`; `EmbeddingProvider` no cambia | R9 |
| PD6 · ¿Dónde va `searchUrl`? | En `ChatStreamDone` (`chat-stream.types.ts`); `buildSearchUrl` en `chat-search-url.ts`, exportada para Guille | R8, D9 |
| PD7 · ¿Qué es un 503 antes de transmitir? | Cualquier error de `resolveConversation` que no sea una `HttpException` | R2 |
| PD8 · ¿Cómo se detecta que el cliente cortó? | `res.on('close')` sin `writableEnded`; aborta la señal del cliente | R11 |
| PD9 · ¿Quién interpreta el SSE en la web? | Un lector propio, puro e incremental; sin librerías | D2 |
| PD10 · ¿Cómo agrega `stream` el cliente sin cambiar `send`? | Arma sus encabezados con la misma función de sesión y `Accept: text/event-stream`, y repite la renovación tras un 401; `request` y `send` quedan iguales | D10, F9 |
| PD11 · ¿Cómo se reemplaza la IA en la integración? | `createDocumentsTestApp` suma `configure?(builder)`; la suite del chat reemplaza `ChatLlm` y `EmbeddingProvider` | 3.2 |
| PD12 · ¿Cómo responde SSE la API simulada de Playwright? | `Reply` suma `contentType` y `rawBody`; el cuerpo va entero, porque la transmisión de a partes se prueba en Vitest | 3.4 |
| PD13 · ¿La pantalla del chat importa piezas de Documentos? | No: `components/chat/design.tsx` con lo que haga falta, para no acoplar las dos pantallas | 2.3 |

### 7.2 Preguntas abiertas

Ninguna para empezar. Quedan pendientes de otros, sin bloquear:
- Guille: `searchUrl` en su ruta y la revisión de la extracción (avisos 6 y 7 de la spec).
- La pareja A: el enlace en el menú (aviso 14).
