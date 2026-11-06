# Tareas 009 · Asistente: respuesta en streaming y respaldo con la búsqueda

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (04/11/2026):** T01 a T14 hechas, sin commits; falta T15 (verificación). **Actualizado el 06/11/2026:** la prueba manual con Gemini real (parte del paso 4 de T15, y HU36) está hecha; el resto de T15 sigue pendiente. T01 a T09 son la API, T10 a T14 la web y T15, la [verificación](#t15--verificación-de-la-feature).

## Antes de empezar

- **Traer `develop`** a la rama de trabajo: la rama local no tiene el PR #39 (el chat real de Guille).
- **Avisarle a Guille** que T01 mueve la orquestación de su `chat.service.ts` (aviso 7 de la spec). No hace falta esperar su respuesta para empezar.
- **Nada bloquea por terceros.** `searchUrl` en `POST /api/chat` (Guille) y el enlace del menú (pareja A) son pedidos aparte.

Convenciones:

- **Commits:** una tarea = un commit. Tipo en inglés, ámbito `api`, `web` o `specs`, descripción en español y en infinitivo.
- **Rutas:** relativas a `apps/api/` en T01 a T09 y a `apps/web/` en T10 a T14, salvo que digan otra cosa.
- **Referencias:** R1 a R15 y F1 a F10 son reglas de la spec; D1 a D14, sus decisiones; E1 a E17, sus escenarios (tabla al principio del plan); PD1 a PD13, las decisiones del plan.
- **"Test primero":** se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Tests:** `pnpm --filter api test <patrón>`, `pnpm --filter api test:e2e <patrón>`, `pnpm --filter web test <patrón>` y `pnpm --filter web test:e2e`.
  - Los de integración resetean `manual_test`, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA.
  - Ningún test llama a Gemini.
- **Archivos de otros que se tocan** (sección 9 de la spec):
  - de Guille: `src/chat/chat.service.ts` (solo T01), `src/chat/ports/chat-llm.ts` (T02), `src/chat/adapters/gemini-chat-llm.ts` (T03) y `src/chat/chat.module.ts` (T08);
  - compartido: `apps/web/lib/api/client.ts` (solo se agrega `stream`, T10).
- **Archivos que no se tocan:** `chat.contract.ts`, `chat.controller.ts`, `chat.dto.ts`, `chat.service.spec.ts`, los adaptadores de Prisma del chat, `src/processing/**` y los archivos de las parejas A y B.

---

## API

### T01 · Extraer la orquestación del chat

- **Qué hace:** crea `src/chat/chat-pipeline.ts` y mueve ahí, sin cambiar el código salvo para exportarlo y recibir las dependencias por parámetro:
  - las constantes y el tipo `ChatUser`;
  - `Outcome`, `unavailable`, `citedChunks` y `toSources`;
  - `prepareChat`, `finishChat` y `saveResult` (plan 1.1).

  `ChatService.ask` y `run` las llaman en el mismo orden de antes. `chat.service.ts` vuelve a exportar lo que exportaba.
- **Cubre:** R14, D8; E3; plan 1.1, PD1.
- **Archivos:** `src/chat/chat-pipeline.ts`, `src/chat/chat-pipeline.spec.ts` y `src/chat/chat.service.ts`.
- **Verificación:**
  1. Antes de tocar nada, `pnpm --filter api test chat.service` en verde (8 tests).
  2. Test primero, `chat-pipeline.spec.ts`:
     - `prepareChat` sin áreas → `no_info`;
     - con el embedding que falla → `ai_unavailable`, sin recuperar;
     - con fragmentos lejanos → `no_info`;
     - con fragmentos cercanos → los pasajes `S1`, `S2` en orden;
     - `finishChat` con `NO_INFO` → `no_info`, sin fragmentos;
     - con `[S2]` → solo el segundo fragmento; sin citas → todos;
     - `saveResult` guarda los campos de hoy y arma el `ChatResult`.

     Falla porque el archivo no existe.
  3. Después de mover: `chat.service.spec.ts` sigue en verde, y `git diff --exit-code src/chat/chat.service.spec.ts` no muestra cambios.
- **Depende de:** traer `develop`.
- **Commit:** `refactor(api): extraer la orquestación del chat sin cambiar su comportamiento`
- **Estado:** hecha (04/11/2026), sin commit.
  - **Antes:** `chat.service.spec.ts` en verde (8 tests).
  - **Test primero:** `chat-pipeline.spec.ts` falló porque el archivo no existía; ahora pasan sus 13 tests.
  - **Después:** `chat.service.spec.ts` sigue en verde sin cambios (`git diff --exit-code` vacío). `api test`: 93 suites, 1402 tests; `tsc` y `lint` en verde.
  - **Además de lo pedido:** `saveResult` recibe el inicio (`startedAt`) y mide la latencia en el mismo punto que antes (al guardar); `prepareChat` recibe el `logger` de `ChatService`, así el aviso del embedding sale con el mismo contexto.

### T02 · Método de streaming en el puerto del modelo

- **Qué hace:** `ports/chat-llm.ts` suma `LlmStream` y `ChatLlm.stream(question, passages, signal)`. El método no es abstracto y su implementación por defecto usa `answer` y entrega el texto en una parte (plan 1.2). `answer` no cambia.
- **Cubre:** R12.
- **Archivos:** `src/chat/ports/chat-llm.ts` y `src/chat/ports/chat-llm.spec.ts`.
- **Verificación:** test primero, con una clase que extiende `ChatLlm` e implementa solo `answer`:
  - `stream` entrega una sola parte igual al texto;
  - `final` es igual a `answer`;
  - con la señal ya abortada, rechaza sin llamar a `answer`.

  Falla porque el método no existe. Después, `chat.service.spec.ts` sigue compilando y pasando sin cambios.
- **Depende de:** —
- **Commit:** `feat(api): agregar el streaming al puerto del modelo del chat`
- **Estado:** hecha (04/11/2026), sin commit. 3 tests; fallaron primero (el método no existía). `chat.service.spec.ts` compila y pasa sin cambios.

### T03 · Streaming con Gemini

- **Qué hace:** `GeminiChatLlm.stream` con `streamText`. Usa el mismo modelo, el mismo `SYSTEM_PROMPT`, el armado de los pasajes en una función `buildPrompt` que también usa `answer` (mismo texto), y `abortSignal: signal` con `maxRetries: 1`. `final` lleva el texto y los tokens (plan 1.2).
- **Cubre:** R13.
- **Archivos:** `src/chat/adapters/gemini-chat-llm.ts` y `src/chat/adapters/gemini-chat-llm.spec.ts`.
- **Verificación:** test primero, con `MockLanguageModelV4` y `simulateReadableStream` (`ai/test`):
  - las partes llegan en orden;
  - el prompt y el sistema que recibe el modelo son los mismos que con `answer` (se compara el `doStream` con el `doGenerate`);
  - la señal llega al modelo, y abortarla corta;
  - `final` trae `modelName` y los tokens;
  - un error a mitad rechaza `final`.

  Falla porque el método no existe.
- **Depende de:** T02.
- **Commit:** `feat(api): transmitir la respuesta de Gemini en partes`
- **Estado:** hecha, sin commit. 4 tests con `MockLanguageModelV4`; fallaron primero (usaba el método por defecto). `streamText` no lanza los errores: llegan como partes de `fullStream`, y el adaptador los convierte en rechazo de las partes y de `final`. El test no importa `@ai-sdk/provider` (no es dependencia directa de la API).

### T04 · Enlace a la búsqueda

- **Qué hace:** `chat-search-url.ts` con `buildSearchUrl(question)` (plan 1.3), y `chat-stream.types.ts` con `ChatStreamDone` y los tipos de los eventos.
- **Cubre:** R8, D9; E7, E12; PD6.
- **Archivos:** `src/chat/chat-search-url.ts`, `src/chat/chat-search-url.spec.ts` y `src/chat/chat-stream.types.ts`.
- **Verificación:** test primero, con la tabla de casos:

  | Pregunta | Enlace |
  | --- | --- |
  | `"¿Cómo cierro la caja?"` | `/documentos?q=%C2%BFC%C3%B3mo%20cierro%20la%20caja%3F` |
  | `"  caja \n diaria  "` | `/documentos?q=caja%20diaria` |
  | `"ok"` | `/documentos` |
  | 1.500 caracteres con espacios | recortada en un espacio, de 100 caracteres como mucho |
  | 150 caracteres sin espacios | los primeros 100 |
  | `"a&b #1"` | `/documentos?q=a%26b%20%231` |

  La tabla se copia en T11, para la web. Falla porque el archivo no existe.
- **Depende de:** —
- **Commit:** `feat(api): armar el enlace a la búsqueda cuando la IA no responde`
- **Estado:** hecha, sin commit. 9 tests; fallaron primero.

### T05 · Servicio de streaming: eventos y guardado

- **Qué hace:** `ChatStreamService` con `open` y `run`, y la interfaz `ChatEventSink` (plan 1.4, pasos 1, 2 y 4 a 9), sin los temporizadores de T06. Usa `prepareChat`, `finishChat`, `saveResult` y `buildSearchUrl`.
- **Cubre:** R2, R3 (orden de eventos), R4, R5, R6, R7, R10; E1, E4, E5, E6, E7, E13; PD2, PD3, PD7.
- **Archivos:** `src/chat/chat-stream.service.ts` y `src/chat/chat-stream.service.spec.ts`.
- **Verificación:** test primero, con los mismos simulados que el spec de Guille (copiados, no importados) y un `ChatLlm` que transmite en partes:
  - orden: `start`, `delta`…, `done`; un solo evento final;
  - `answered`: los `delta` unidos forman el `answer`, y las fuentes son las citadas;
  - sin áreas, umbral y `NO_INFO` (también con espacios antes): ningún `delta` y `done` con `no_info`;
  - "Normalmente…": el primer `delta` sale a los 7 caracteres; "Sí [S1]": un solo `delta` al terminar;
  - embedding que falla: `ai_unavailable` con `searchUrl`, sin recuperar;
  - el modelo falla después de dos partes: `done` con `ai_unavailable`, sin fuentes, con `searchUrl`, y se guarda así;
  - `open` con una conversación ajena: `NotFoundException`; con la base caída: 503;
  - error al guardar: un evento `error` con 503 y ningún `done`.

  Falla porque el servicio no existe.
- **Depende de:** T01, T02, T04.
- **Commit:** `feat(api): transmitir la respuesta del asistente con eventos`
- **Estado:** hecha, sin commit. 18 tests; fallaron primero. Los simulados están en `src/chat/testing/chat-fakes.ts` (copias de los de Guille más un modelo que transmite en partes). Además de la tarea: una falla de la recuperación después de abrir la transmisión es un evento `error` con 503.

### T06 · Tiempos de espera y corte del cliente

- **Qué hace:** suma a `ChatStreamService` el `AbortController` propio con los tres tiempos del modelo (`FIRST_TEXT_TIMEOUT_MS`, `IDLE_TIMEOUT_MS` y `TOTAL_TIMEOUT_MS`), `withTimeout` para el embedding y el corte del cliente: sin guardar ni mandar más eventos (plan 1.4, pasos 3, 7 y 9).
- **Cubre:** R9, R11, D12, D13; E8, E9, E11; PD4, PD5.
- **Archivos:** `src/chat/chat-stream.service.ts` y `src/chat/chat-stream.service.spec.ts`.
- **Verificación:** test primero, con temporizadores simulados de Jest:
  - sin primer texto a los 15 s: la señal del modelo se aborta y `done` llega con `ai_unavailable`;
  - una parte y después 15 s sin nada: igual, y se guarda `ai_unavailable`;
  - una parte cada 10 s: no se corta por inactividad, pero sí a los 60 s;
  - embedding que no responde en 15 s: `ai_unavailable`, sin recuperar;
  - el cliente aborta a mitad: la señal del modelo se aborta, no hay `done` ni `error`, y `saveMessage` no se llama;
  - al terminar no quedan temporizadores pendientes.

  Falla porque no hay tiempos.
- **Depende de:** T05.
- **Commit:** `feat(api): cortar la respuesta del asistente por tiempo o si el usuario se va`
- **Estado:** hecha, sin commit. 8 tests en `chat-stream.timeouts.spec.ts`; fallaron 7 primero (no había tiempos). Además de la tarea: si el cliente corta durante el embedding, no se llama al modelo.

### T07 · Las dos rutas responden lo mismo

- **Qué hace:** `chat-routes.parity.spec.ts`, un test parametrizado que corre `ChatService.ask` y `ChatStreamService` (`open` + `run`) con los mismos simulados.
- **Cubre:** R4, D8; E2.
- **Archivos:** `src/chat/chat-routes.parity.spec.ts`.
- **Verificación:** en cada caso, el mismo `status`, `answer` y `sources`, y `saveMessage` con los mismos datos salvo `latencyMs`. Los casos:
  - `answered` con `[S2]`;
  - `answered` sin citas;
  - umbral;
  - `NO_INFO`;
  - sin áreas;
  - embedding caído;
  - modelo caído antes de la primera parte.

  `done` además trae `searchUrl` solo con `ai_unavailable`. Como T05 ya está hecha, no hay corrida en rojo: se comprueba con una mutación (cambiar `MAX_COSINE_DISTANCE` en el servicio nuevo hace fallar el caso del umbral) y se restaura.
- **Depende de:** T06.
- **Commit:** `test(api): comparar las respuestas de las dos rutas del chat`
- **Estado:** hecha, sin commit. 7 casos. Como `prepareChat` es compartida, el umbral no se puede cambiar solo en el servicio nuevo: la mutación de control fue devolver todos los fragmentos en vez de los citados, que hizo fallar 2 casos; se restauró.

### T08 · Ruta `POST /api/chat/stream`

- **Qué hace:**
  - `sse-writer.ts`: `formatEvent` y `sseSink`;
  - `chat-stream.controller.ts`: guard, `ValidationPipe`, `open` antes de los encabezados, encabezados de R3, `flushHeaders`, `res.on('close')` y Swagger (plan 1.5);
  - `chat.module.ts` suma el controlador y el servicio.
- **Cubre:** R1, R2, R3, R15; E4, E13; PD8.
- **Archivos:** `src/chat/sse-writer.ts`, `src/chat/sse-writer.spec.ts`, `src/chat/chat-stream.controller.ts` y `src/chat/chat.module.ts`.
- **Verificación:** test primero, `sse-writer.spec.ts`:
  - cada evento es `event:`, `data:` con JSON en una línea, y una línea vacía;
  - un texto con saltos de línea queda escapado dentro del JSON;
  - después de `end` no escribe.

  Falla porque el archivo no existe. La ruta se prueba de punta a punta en T09. `pnpm --filter api exec tsc --noEmit` y `lint` en verde.
- **Depende de:** T06.
- **Commit:** `feat(api): exponer POST /api/chat/stream con eventos SSE`
- **Estado:** hecha, sin commit. 4 tests del escritor; la ruta se prueba en T09. `tsc` y `lint` en verde.

### T09 · Integración de la ruta nueva

- **Qué hace:**
  - `test/documents/helpers.ts`: `createDocumentsTestApp` suma `configure?(builder)` (PD11);
  - la suite nueva `test/chat/chat-stream.e2e-spec.ts`, con un `ChatLlm` simulado que transmite en partes, un `EmbeddingProvider` simulado de 768 dimensiones y fragmentos sembrados con su embedding.
- **Cubre:** R1 a R4, R7; E2, E3, E4, E13, E14 a nivel API; plan 3.2.
- **Archivos:** `test/documents/helpers.ts` y `test/chat/chat-stream.e2e-spec.ts`.
- **Verificación:** test primero, con Supertest y la base de tests:
  - 200, encabezados de R3, y `start`, `delta`…, `done` en orden (E4);
  - sin sesión → 401 JSON; `message` vacío → 400 JSON; `conversationId` de otro usuario → 404 JSON, sin `text/event-stream` (E13);
  - una segunda pregunta con el `conversationId` de `start` queda en la misma conversación (E14);
  - el mensaje queda en `messages` con el estado de `done`;
  - **paridad por HTTP:** la misma pregunta por `POST /api/chat` y `POST /api/chat/stream` da el mismo `status`, `answer` y `sources` (E2), y `POST /api/chat` responde como siempre (E3).

  Las suites de documentos pasan sin cambios. **Pedir la confirmación del usuario** antes de resetear `manual_test`.
- **Depende de:** T08.
- **Commit:** `test(api): probar la ruta de streaming del asistente de punta a punta`
- **Estado:** hecha, sin commit. 7 tests; pasaron en la primera corrida (T08 ya estaba hecha), con la confirmación del usuario para resetear `manual_test`. `test:e2e "chat|documents"`: 15 suites, 275 tests.

## Web

### T10 · `client.stream`

- **Qué hace:** `lib/api/client.ts` suma `stream(path, init)` a `ApiClient` (plan 2.1, PD10): exige el prefijo, pone los encabezados de sesión con `Accept: text/event-stream`, renueva una vez tras un 401, lanza `ApiError` si no es `ok` y devuelve la `Response`. `request` y `send` no cambian.
- **Cubre:** F9, D10; E13 en la web.
- **Archivos:** `lib/api/client.ts` y su test en `tests/lib/api/`.
- **Verificación:** test primero:
  - ruta sin `/api/` → error;
  - encabezados de sesión y `Accept`;
  - 401 → renueva y repite, una vez;
  - 404 con JSON → `ApiError` con su mensaje;
  - 200 → la `Response` sin leer.

  Falla porque el método no existe. Los tests de `request` pasan sin cambios, y `git diff` de `client.ts` solo muestra líneas agregadas.
- **Depende de:** —
- **Commit:** `feat(web): agregar al cliente HTTP la lectura de transmisiones`
- **Estado:** hecha, sin commit. 8 tests en `client-stream.test.ts`; fallaron primero. **Diferencias con el plan:** `stream` se agrega en una interfaz nueva, `StreamingApiClient extends ApiClient`, porque varios tests (también los de Ejecuciones, de la pareja B) arman un `ApiClient` a mano con solo `request`; la única línea cambiada de `client.ts` es el tipo que devuelve `createApiClient`. `stream` reusa `send` sin cambiarlo, así que el pedido lleva `Accept: application/json` (la API no lo mira); no se agregó `Accept: text/event-stream` para no tocar `send`. `lib/api/index.ts` suma el export del tipo.

### T11 · Lector SSE, `askStream`, enlace y citas

- **Qué hace:** `lib/chat/sse.ts`, `lib/api/chat.ts` (`askStream`, `ChatStreamError` y los tipos), `lib/chat/search-url.ts` y `lib/chat/citations.ts` (plan 2.2).
- **Cubre:** R3 (lectura), R8, F4, F5 (corte), D14; E10, E12, E15; PD9.
- **Archivos:** `lib/chat/sse.ts`, `lib/chat/search-url.ts`, `lib/chat/citations.ts`, `lib/api/chat.ts` y sus tests en `tests/lib/chat/` y `tests/lib/api/`.
- **Verificación:** test primero:
  - `sse`: un evento partido en tres fragmentos; `\r\n`; comentarios; eventos desconocidos; dos eventos en un fragmento;
  - `askStream` con un `ReadableStream`: `onStart`, `onDelta` y `done`; evento `error` → `ChatStreamError('error')`; cuerpo que termina sin evento final → `'cut'` (E10); abort → `AbortError`;
  - `search-url`: la tabla de T04 (E12);
  - `citations`: `[S2]` y `[S5]` → citas 1 y 2 (E15); una marca repetida es la misma cita; sin marcas → solo texto; `[S9]` con dos fuentes → texto sin marcas.

  Falla porque los archivos no existen.
- **Depende de:** T10.
- **Commit:** `feat(web): leer la transmisión del asistente`
- **Estado:** hecha, sin commit. 28 tests; fallaron primero. `lib/api/index.ts` exporta `askStream`, `ChatStreamError` y los tipos del chat. Al quitar marcas sin cruce también se quita el espacio anterior ("Ver [S1] y [S9]." → "Ver y.").

### T12 · Pantalla `/asistente`: mensajes y transmisión

- **Qué hace:**
  - `app/asistente/page.tsx`;
  - `components/chat/`: `ChatScreen`, `ChatHeader`, `ChatMessage` (sin las fuentes ni los estados de T13), `ChatComposer` y `design.tsx` (plan 2.3).
  - Funciona así: la pregunta a la derecha, el texto que crece con `aria-busy`, el anuncio final, el `conversationId` entre preguntas, "Nueva conversación", Enter y Shift+Enter, el botón deshabilitado y el abort al desmontar.
- **Cubre:** F1 (ruta), F2, F3, F6, F7, F8, F10; E1, E11, E14, E17.
- **Archivos:** `app/asistente/page.tsx`, `components/chat/{ChatScreen,ChatHeader,ChatMessage,ChatComposer,design}.tsx` y `tests/components/chat/ChatScreen.test.tsx`.
- **Verificación:** test primero, con `askStream` real sobre un `fetch` simulado que devuelve un `ReadableStream` controlado:
  - después del primer `delta` y antes de `done`, el texto parcial está en pantalla (E1);
  - la burbuja tiene `aria-busy` y la región `aria-live` está vacía; con `done`, la región trae la respuesta (E17);
  - la segunda pregunta lleva el `conversationId`, y con "Nueva conversación" no (E14);
  - desmontar aborta el `fetch` (E11);
  - Enter envía, Shift+Enter no; vacío no envía; el botón está deshabilitado mientras transmite.

  Falla porque la pantalla no existe.
- **Depende de:** T11.
- **Commit:** `feat(web): agregar la pantalla del asistente con la respuesta de a partes`
- **Estado:** hecha, sin commit. 9 tests; fallaron primero. El estado de la conversación está en `components/chat/chat-state.ts`.

### T13 · Fuentes, citas y estados de la respuesta

- **Qué hace:** `ChatSources` y, en `ChatMessage`:
  - las citas numeradas con `linkCitations`;
  - `no_info` en una caja punteada;
  - `ai_unavailable`, corte y error con el enlace a la búsqueda (`searchUrl` o, si falta, el armado por la web) y "Volver a preguntar";
  - el texto parcial borrado (F4, F5).
- **Cubre:** F4, F5; E5, E7, E9, E10, E15 en pantalla.
- **Archivos:** `components/chat/{ChatSources,ChatMessage}.tsx` y `tests/components/chat/ChatScreen.test.tsx`.
- **Verificación:** test primero:
  - `answered` con `[S2]` y dos fuentes: la cita 1 y el botón "1 Manual de compras · v2 · Aprobaciones" con `href` `/documentos/<id>` (E15);
  - `no_info` en caja punteada, sin fuentes (E5);
  - `ai_unavailable` con `searchUrl`: el enlace "Buscar «…» en los documentos" (E7);
  - dos `delta` y después `done` con `ai_unavailable`: el texto parcial desaparece (E9);
  - cuerpo sin evento final: "Se cortó la respuesta", el enlace armado por la web y "Volver a preguntar", que repite la pregunta (E10);
  - un 404: el mensaje, y la próxima pregunta sin `conversationId`.

  Falla porque no hay fuentes ni estados.
- **Depende de:** T12.
- **Commit:** `feat(web): mostrar las fuentes y el respaldo con la búsqueda en el asistente`
- **Estado:** hecha, sin commit. 10 tests en `ChatScreen.states.test.tsx`. La primera corrida en rojo no valía (al test le faltaba el `render`); después del verde se comprobó con la versión de T12 de `ChatMessage`: fallan 8 de 10. Se corrigió el nombre accesible del botón de fuente (faltaba el espacio entre el número y el título).

### T14 · Acceso desde `/documentos` y Playwright

- **Qué hace:**
  - `DocumentList` suma el enlace "Preguntale al asistente" a `/asistente` (plan 2.4);
  - `e2e/support/mock-api.ts` suma la respuesta SSE (`contentType` y `rawBody`) y el handler `chatStream` (PD12);
  - la suite nueva `e2e/asistente.spec.ts`.
- **Cubre:** F1 (acceso), D11; E1, E7, E16 de punta a punta con la API simulada.
- **Archivos:** `components/documents/DocumentList.tsx`, `tests/components/documents/DocumentList.test.tsx`, `e2e/support/mock-api.ts` y `e2e/asistente.spec.ts`.
- **Verificación:** test primero:
  - `DocumentList.test.tsx`: el enlace existe para un EMPLOYEE y para el ADMIN (E16);
  - `asistente.spec.ts`, en escritorio y celular:
    - desde `/documentos` al chat (E16);
    - una respuesta con la cita y la fuente que abre el detalle (E1);
    - `ai_unavailable` con el enlace que abre `/documentos?q=…` con resultados (E7).

  Las demás suites de Playwright simulado pasan sin cambios.
- **Depende de:** T13.
- **Commit:** `feat(web): abrir el asistente desde Documentos`
- **Estado:** hecha, sin commit. 3 tests nuevos en `DocumentList.test.tsx` (2 fallaron primero) y 3 en `asistente.spec.ts`, en escritorio y celular. Playwright simulado completo: 114 tests.

## Verificación final

### T15 · Verificación de la feature

- **Qué hace:** corre todo, confirma que cada escenario tiene sus tests (tabla de la sección 4 del plan), hace las mutaciones de control, prueba la transmisión real y anota el resultado en este archivo.
- **Cubre:** spec, sección 11 completa; plan, secciones 3 y 4.
- **Archivos:** `specs/009-asistente-streaming/tasks.md`.
- **Verificación:**
  1. **Todo en verde:** `pnpm --filter api lint`, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api test`, `pnpm --filter api test:e2e` (con confirmación), `pnpm --filter web lint`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web test` y Playwright simulado. Los errores que ya estaban en `HEAD` en archivos de otras parejas se anotan y no se tocan.
  2. **Los tests de Guille sin cambios:** `git diff develop -- apps/api/src/chat/chat.service.spec.ts apps/api/src/chat/chat.contract.ts apps/api/src/chat/chat.controller.ts apps/api/src/chat/chat.dto.ts apps/api/src/chat/adapters/prisma-*` vacío.
  3. **Swagger:** `/api/docs` muestra `POST /api/chat/stream` con `text/event-stream` y los errores de R2.
  4. **Transmisión real:**
     - con la API y la web levantadas, la clave de Gemini de desarrollo y un documento procesado, una pregunta en `/asistente` muestra texto antes de terminar;
     - en la pestaña de red, los eventos llegan de a uno a través del proxy de Next;
     - se mide el tiempo hasta el primer texto contra `POST /api/chat` (sección 9 de la spec).

     Sin clave, se anota y se hace cuando la haya.
  5. **Mutaciones de control**, una por vez, restaurando antes de la siguiente; cada una tiene que hacer fallar al menos un test:
     - mandar los `delta` sin el retén de la marca → E6;
     - no reiniciar el tiempo de inactividad con cada parte → E9 (el caso de una parte cada 10 s);
     - guardar aunque el cliente haya cortado → E11;
     - cambiar el umbral en el servicio nuevo → E2 (paridad);
     - en `citedChunks` del archivo extraído, devolver siempre todos → `chat.service.spec.ts` (E3);
     - no recortar `searchUrl` a 100 → E12;
     - en la web, no borrar el texto parcial con `ai_unavailable` → E9;
     - cruzar las citas sin ordenar las marcas → E15.
  6. **Tabla:** cada fila de la sección 4 del plan tiene sus tests, buscados por nombre, y pasan.
  7. **Avisos:** a Guille, los de la sección 12 de la spec (qué se movió, `searchUrl` en su ruta y lo que queda para corregir); a la pareja A (Camila), el enlace del menú (sección 13). Los manda Matías.
- **Depende de:** T01 a T14.
- **Commit:** `docs(specs): verificar el streaming del asistente`
- **Estado:** pendiente, salvo la prueba manual con Gemini real.
- **Prueba manual con Gemini real (06/11/2026): hecha** por Matías, con la clave de desarrollo:
  - **Streaming (paso 4):** en `/asistente`, la respuesta sale de a partes, con la fuente, y la fuente abre el documento.
  - **HU36:** con una clave inválida, aparece el aviso "El asistente no está disponible" con el enlace a la búsqueda, que abre la búsqueda con la pregunta.
  - **Del paso 4 queda sin hacer:** ver en la pestaña de red que los eventos llegan de a uno a través del proxy de Next, y medir el tiempo hasta el primer texto contra `POST /api/chat`.

---

## Orden y dependencias

```
API:
  T01 (extracción, commit propio) · T02 (suelta) · T04 (suelta) · T10 (web, suelta)
  T03 ◄─ T02
  T05 ◄─ T01, T02, T04
  T06 ◄─ T05
  T07 ◄─ T06
  T08 ◄─ T06
  T09 ◄─ T08

Web:
  T11 ◄─ T10
  T12 ◄─ T11
  T13 ◄─ T12
  T14 ◄─ T13

Verificación:
  T15 ◄─ T01 a T14
```

La web se puede escribir en paralelo con la API, con transmisiones simuladas. Se mergea junto con la API o después (plan, sección 6).
