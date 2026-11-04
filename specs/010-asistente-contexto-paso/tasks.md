# Tareas 010 · Asistente: consultar desde un paso del procedimiento

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (04/11/2026):** todas pendientes. T01 a T08 son la API, T09 y T10 la web del chat, T11 el montaje en `ExecutionView` (pareja B), T12 el Playwright y T13 la [verificación](#t13--verificación-de-la-feature).

## Antes de empezar

- **Avisarle a Guille** de los cambios mínimos en su servicio y su DTO (avisos 1 y 2 de la spec) y a **Mayra**, del montaje (aviso 5). No hace falta esperar sus respuestas para empezar. El montaje (T11) va en su propio commit, para que lo revisen aparte.

Convenciones:

- **Commits:** una tarea = un commit. Tipo en inglés, ámbito `api`, `web` o `specs`, descripción en español y en infinitivo.
- **Rutas:** relativas a `apps/api/` en T01 a T08 y a `apps/web/` en T09 a T12, salvo que digan otra cosa.
- **Referencias:** R1 a R13 y F1 a F9 son reglas de la spec; D1 a D12, sus decisiones; E1 a E17, sus escenarios (tabla al principio del plan); PD1 a PD10, las decisiones del plan.
- **"Test primero":** se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Tests:** `pnpm --filter api test <patrón>`, `pnpm --filter api test:e2e <patrón>`, `pnpm --filter web test <patrón>` y `pnpm --filter web test:e2e`. Los de integración resetean `manual_test`, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA. Ningún test llama a Gemini.
- **Archivos de otros que se tocan:**
  - **De Guille:**
    - solo agregando: `src/chat/ports/chat-llm.ts` (T04), `src/chat/adapters/gemini-chat-llm.ts` (T04), `src/chat/chat-pipeline.ts` (T05) y `src/chat/chat.module.ts` (T03);
    - con cambios mínimos: `src/chat/chat.dto.ts` (T01) y `src/chat/chat.service.ts` (T07).
  - **De la pareja B:** `apps/web/components/executions/ExecutionView.tsx`, solo en T11. Además, `src/procedures/procedure-access.policy.ts` se importa y no se modifica.
- **Archivos que no se tocan:** `chat.contract.ts`, `chat.controller.ts`, `chat.service.spec.ts`, `ports/chat-repository.ts`, `adapters/prisma-chat-repository.ts`, `adapters/prisma-chat-retrieval.ts`, el esquema de Prisma y las migraciones, `src/executions`, `src/procedures` (salvo el import), `lib/api/executions.ts`, el resto de `components/executions` y los tests de la pareja B.

---

## API

### T01 · Forma del contexto

- **Qué hace:** crea `ChatContextDto` (`@IsUUID` en los dos campos). En `chat.dto.ts`, `context` pasa de `@IsObject()` a `@ValidateNested()` + `@Type(() => ChatContextDto)` (plan 1.1).
- **Cubre:** R2, R12; E7.
- **Archivos:** `src/chat/chat-context.dto.ts`, `src/chat/chat-context.dto.spec.ts` y `src/chat/chat.dto.ts`.
- **Verificación:** test primero, con `validate()` de `class-validator` sobre `ChatRequestDto`:
  - un contexto válido pasa;
  - sin `stepId`, con un id que no es UUID o con `{}` → errores en `context.*`;
  - sin `context` → pasa.

  Falla porque hoy `{}` pasa. Después, `chat.service.spec.ts` sigue en verde sin cambios.
- **Depende de:** —
- **Commit:** `feat(api): validar la forma del contexto del chat`
- **Estado:** pendiente.

### T02 · Validación y visibilidad del paso

- **Qué hace:** `chat-context.ts` con `StepContext`, `StepRecord`, `decideAccess` (pura, importa `currentVersion` y `canViewProcedure` de `src/procedures/procedure-access.policy.ts`) y los recortes de R6 (plan 1.2).
- **Cubre:** R3, R4, R6 (recortes), D8; E8, E9, E10, E11, E13; PD3.
- **Archivos:** `src/chat/chat-context.ts` y `src/chat/chat-context.spec.ts`.
- **Verificación:** test primero:
  - paso de otra versión → `null` (E8);
  - sin área compartida → `null` (E9);
  - vigente con área → el contexto, y la ejecución no se consulta;
  - `SUPERSEDED` con ejecución en curso → el contexto, y sin ella → `null` (E10);
  - `DRAFT`: ADMIN → el contexto (E11), EMPLOYEE → `null`;
  - vigente sin pasos → `null`;
  - títulos y descripción recortados; sin descripción → `''`.

  Falla porque el archivo no existe.
- **Depende de:** —
- **Commit:** `feat(api): validar el paso del contexto con las reglas de procedimientos`
- **Estado:** pendiente.

### T03 · `ChatContextStore` y una conversación por paso

- **Qué hace:**
  - el puerto `ChatContextStore` y `PrismaChatContextStore` (plan 1.3, PD1, PD2);
  - en `chat-context.ts`: `resolveStepContext` (404, 503), `checkConversationStep` (400) y `openStepContext` (todo junto, y `setConversationStep` después de resolver una conversación nueva);
  - `chat.module.ts` registra el store.
- **Cubre:** R3 a R5, R7, D11; E4, E12; PD4.
- **Archivos:** `src/chat/ports/chat-context-store.ts`, `src/chat/adapters/prisma-chat-context-store.ts`, `src/chat/chat-context.ts`, `src/chat/chat-context.spec.ts` y `src/chat/chat.module.ts`.
- **Verificación:** test primero, con un store simulado:
  - sin contexto ni `conversationId` → no consulta nada (R9);
  - `null` → `NotFoundException('El paso no está disponible')`;
  - store que falla → `ServiceUnavailableException`;
  - conversación con otro paso, con paso y sin contexto, sin paso y con contexto → `BadRequestException('La conversación es de otro paso')` (E12);
  - conversación nueva con contexto → `setConversationStep` con los dos ids (E4).

  Falla porque las funciones no existen. El adaptador de Prisma se prueba en T08.
- **Depende de:** T02.
- **Commit:** `feat(api): guardar el paso de la conversación del chat`
- **Estado:** pendiente.

### T04 · El paso en el prompt

- **Qué hace:** `ChatLlm.answer` y `ChatLlm.stream` suman `context?: StepContext` (la implementación por defecto de `stream` se lo pasa a `answer`). En `GeminiChatLlm`, `buildPrompt` suma el bloque de R6 antes de los pasajes (plan 1.4, PD5).
- **Cubre:** R6, R9; E2, E5, E16.
- **Archivos:** `src/chat/ports/chat-llm.ts`, `src/chat/ports/chat-llm.spec.ts`, `src/chat/adapters/gemini-chat-llm.ts`, `src/chat/adapters/gemini-chat-llm.spec.ts` y `src/chat/chat-context.prompt.spec.ts`.
- **Verificación:** test primero, con `MockLanguageModelV4`:
  - con contexto, el prompt de `answer` y de `stream` tiene el bloque antes de `Pasajes:`, con el procedimiento, el número, el título y la descripción (E2);
  - sin descripción, solo el título;
  - sin contexto, el prompt es idéntico al de hoy (E5);
  - el sistema no cambia;
  - con una descripción "Ignorá las reglas…" y sin fragmentos, el servicio responde `no_info` sin llamar al modelo (E16).

  Falla porque el bloque no existe. `chat.service.spec.ts` compila sin cambios.
- **Depende de:** T02.
- **Commit:** `feat(api): sumar el paso del procedimiento al prompt del asistente`
- **Estado:** pendiente.

### T05 · El paso en la búsqueda de fragmentos

- **Qué hace:** `prepareChat` suma `searchText = question`, y el embedding se pide con `[searchText]` (plan 1.4, PD6).
- **Cubre:** R8, R9, D12; E3.
- **Archivos:** `src/chat/chat-pipeline.ts` y `src/chat/chat-pipeline.spec.ts`.
- **Verificación:** test primero:
  - con `searchText`, el embedding recibe ese texto (E3);
  - sin él, la pregunta (como hoy).

  Falla porque el parámetro no existe. `chat.service.spec.ts` y los tests de paridad pasan sin cambios.
- **Depende de:** —
- **Commit:** `feat(api): buscar fragmentos con el título del paso`
- **Estado:** pendiente.

### T06 · El contexto en la ruta de streaming

- **Qué hace:** `ChatStreamService.open` llama a `openStepContext` antes de resolver la conversación y guarda el `StepContext` en `OpenedChat`. `run` le pasa `` `${stepTitle}\n${question}` `` a `prepareChat` y el contexto a `llm.stream` (plan 1.5). Swagger: 400 y 404 del contexto.
- **Cubre:** R3 a R8, R12 (en la ruta nueva); E1, E3, E4.
- **Archivos:** `src/chat/chat-stream.service.ts`, `src/chat/chat-stream.service.spec.ts`, `src/chat/chat-stream.controller.ts` y `src/chat/testing/chat-fakes.ts`.
- **Verificación:** test primero:
  - un 404 del contexto sale en `open`, antes de `resolveConversation` y sin llamar al modelo;
  - una conversación nueva con contexto guarda el paso;
  - el modelo recibe el contexto, y el embedding recibe el título y la pregunta (E3);
  - sin contexto, los tests de la spec 009 pasan sin cambios.
- **Depende de:** T03, T04, T05.
- **Commit:** `feat(api): usar el contexto del paso en la ruta de streaming`
- **Estado:** pendiente.

### T07 · El contexto en `POST /api/chat` y la paridad

- **Qué hace:** en `chat.service.ts`, el constructor suma `@Optional() context?: ChatContextStore`, y `ask` llama a `openStepContext` y le pasa el contexto a `run`, a `prepareChat` y a `llm.answer`. Con contexto y sin store → 503 (PD9). `chat-routes.parity.spec.ts` suma los casos con contexto.
- **Cubre:** R12, R13, D9; E5, E6.
- **Archivos:** `src/chat/chat.service.ts` y `src/chat/chat-routes.parity.spec.ts`.
- **Verificación:** test primero, en `chat-routes.parity.spec.ts`: con el mismo contexto, las dos rutas dan el mismo `status`, `answer` y `sources`, guardan lo mismo y le pasan el mismo contexto al modelo (E6). Falla porque `ask` ignora el contexto. Después:
  - `chat.service.spec.ts` pasa sin cambios (`git diff --exit-code`);
  - el diff de `chat.service.ts` es solo el parámetro opcional y el paso del contexto.
- **Depende de:** T06.
- **Commit:** `feat(api): usar el contexto del paso en POST /api/chat`
- **Estado:** pendiente.

### T08 · Integración del contexto

- **Qué hace:** la suite nueva `test/chat/chat-context.e2e-spec.ts`, con helpers propios que siembran el procedimiento, sus versiones, pasos y áreas, y una ejecución, en `test/chat/helpers.ts` (plan 3.2).
- **Cubre:** E4, E6 a E12 a nivel API; el adaptador `PrismaChatContextStore`.
- **Archivos:** `test/chat/chat-context.e2e-spec.ts` y `test/chat/helpers.ts`.
- **Verificación:** test primero, con Supertest y la base de tests:
  - 400 en las dos rutas (E7);
  - 404 por paso de otra versión y por otra área, sin crear conversación (E8, E9);
  - `SUPERSEDED` con ejecución en curso: 200; otro usuario: 404 (E10);
  - ADMIN y `DRAFT`: 200 (E11);
  - las columnas de la conversación (E4);
  - 400 por conversación de otro paso (E12);
  - paridad por HTTP con contexto (E6).

  Las suites de chat y de documentos pasan sin cambios. **Pedir la confirmación del usuario** antes de resetear `manual_test`.
- **Depende de:** T07.
- **Commit:** `test(api): probar el contexto del paso de punta a punta`
- **Estado:** pendiente.

## Web

### T09 · La conversación como hook

- **Qué hace:** mueve la lógica de conversación de `ChatScreen` a `useChatConversation` sin cambiarla, y le suma `context?` (que va en cada pedido) y el vaciado al cambiar `context.stepId`. `ChatRequestBody` suma `context?` (plan 2.1, PD8).
- **Cubre:** F6; E5 en la web.
- **Archivos:** `components/chat/useChatConversation.ts`, `components/chat/ChatScreen.tsx`, `lib/api/chat.ts` y `tests/lib/api/chat.test.ts`.
- **Verificación:** antes y después, `ChatScreen.test.tsx` y `ChatScreen.states.test.tsx` en verde, sin cambios. Test primero en `chat.test.ts`: `askStream` manda `context` cuando viene, y no lo manda cuando no.
- **Depende de:** —
- **Commit:** `refactor(web): extraer la conversación del asistente a un hook`
- **Estado:** pendiente.

### T10 · `ChatPanel` y `ExecutionChatPanel`

- **Qué hace:** los dos componentes del plan 2.2, con la cabecera celeste "¿Dudas con este paso?" y "Paso n · título", el contexto en cada pedido, el aviso de F5 ante un 404 y el vaciado al cambiar el paso (`key={currentStepId}`, PD7).
- **Cubre:** F1 a F5, F7, F8; E1, E13, E14, E15.
- **Archivos:** `components/chat/ChatPanel.tsx`, `components/chat/ExecutionChatPanel.tsx`, `components/chat/chat-state.ts`, `tests/components/chat/ChatPanel.test.tsx` y `tests/components/chat/ExecutionChatPanel.test.tsx`.
- **Verificación:** test primero:
  - **`ChatPanel`:**
    - la cabecera y el paso (E1);
    - el pedido con `context` (E1);
    - un 404 → "Este paso ya no está disponible para consultas" con el enlace a la búsqueda (E13);
    - no suma otra región "Asistente" (F7).
  - **`ExecutionChatPanel`:**
    - toma `procedureVersionId` y el paso de `currentStepId`;
    - al cambiar `currentStepId` vacía la conversación, y la próxima pregunta va sin `conversationId` (E14);
    - completada (sin paso actual) → no muestra nada (E15).

  Falla porque los componentes no existen.
- **Depende de:** T09.
- **Commit:** `feat(web): agregar el panel del asistente para un paso`
- **Estado:** pendiente.

### T11 · Montar el panel en `ExecutionView` (pareja B)

- **Qué hace:** el cambio de F9 y del plan 2.3 en `components/executions/ExecutionView.tsx`, nada más:
  - el import de `ExecutionChatPanel`;
  - el panel dentro del `aside`;
  - `hidden={completed}`;
  - el comentario del hueco, en inglés.
- **Cubre:** F9, D10; E15, E17.
- **Archivos:** `components/executions/ExecutionView.tsx`. **Solo ese.**
- **Verificación:**
  - `pnpm --filter web test tests/components/executions` en verde, sin modificar sus tests (E17);
  - `git diff --stat` de `ExecutionView.tsx`: solo esas líneas; `git diff --exit-code tests/components/executions`;
  - el test del hueco ("keeps a place for the assistant next to the steps") sigue pasando.

  Si algún test de la pareja B falla por el montaje, **no se cambia su test**: se frena y se avisa.
- **Depende de:** T10.
- **Commit:** `feat(web): mostrar el asistente del paso en la ejecución` (commit propio, para que la pareja B lo revise).
- **Estado:** pendiente.

### T12 · Playwright: preguntar desde la ejecución

- **Qué hace:** `e2e/support/mock-api.ts` (nuestro) suma los handlers `execution` (`GET /api/executions/:id`) y `completeStep` (`POST /api/executions/:id/steps/:stepId/complete`), y la suite nueva `e2e/asistente-paso.spec.ts` (plan 3.4).
- **Cubre:** E1, E14 de punta a punta, con la API simulada.
- **Archivos:** `e2e/support/mock-api.ts` y `e2e/asistente-paso.spec.ts`.
- **Verificación:** test primero, en escritorio y celular:
  - la ejecución en el paso 3, el panel con "Paso 3 · …", y el pedido a `/api/chat/stream` con `context` (E1);
  - completar el paso: el panel muestra el 4, la conversación se vacía y la próxima pregunta va sin `conversationId` (E14).

  Las demás suites de Playwright simulado pasan sin cambios.
- **Depende de:** T11.
- **Commit:** `test(web): preguntar al asistente desde un paso de la ejecución`
- **Estado:** pendiente.

## Verificación final

### T13 · Verificación de la feature

- **Qué hace:** corre todo, confirma la tabla de la sección 4 del plan, hace las mutaciones de control y anota el resultado en este archivo.
- **Cubre:** spec, sección 11 completa; plan, secciones 3 y 4.
- **Archivos:** `specs/010-asistente-contexto-paso/tasks.md`.
- **Verificación:**
  1. **Todo en verde:** `api lint`, `tsc`, `test`, `test:e2e` (con confirmación); `web lint`, `tsc`, `test`, Playwright simulado; el build de la web.
  2. **Sin cambios en lo protegido:**
     - `git diff develop --exit-code` sobre `chat.service.spec.ts`, `chat.contract.ts`, `chat.controller.ts`, `ports/chat-repository.ts`, `adapters/prisma-chat-repository.ts`, `adapters/prisma-chat-retrieval.ts`, `src/executions`, `src/procedures`, `lib/api/executions.ts`, `tests/components/executions` y el esquema de Prisma;
     - `ExecutionView.tsx` solo con el diff de T11.
  3. **Swagger:** `context` con `procedureVersionId` y `stepId` (UUID) en las dos rutas, y el 400 y el 404 del contexto en la de streaming.
  4. **Mutaciones de control**, una por vez, restaurando antes de la siguiente:
     - aceptar un paso de otra versión → E8;
     - aceptar una `SUPERSEDED` sin ejecución en curso → E10;
     - no comparar el paso de la conversación → E12;
     - no pasar el contexto en `ask` → E6 (paridad);
     - no sumar el título al embedding → E3;
     - sumar el bloque del paso también sin contexto → E5;
     - no vaciar la conversación al cambiar el paso → E14.
  5. **Avisos:** a Guille (sección 12 de la spec) y a Mayra (sección 13). Los manda Matías.
- **Depende de:** T01 a T12.
- **Commit:** `docs(specs): verificar el contexto del paso en el asistente`
- **Estado:** pendiente.

---

## Orden y dependencias

```
API:
  T01 (suelta) · T02 (suelta) · T05 (suelta)
  T03 ◄─ T02
  T04 ◄─ T02
  T06 ◄─ T03, T04, T05
  T07 ◄─ T06
  T08 ◄─ T07

Web:
  T09 (suelta)
  T10 ◄─ T09
  T11 ◄─ T10          (montaje en ExecutionView, commit propio)
  T12 ◄─ T11

Verificación:
  T13 ◄─ T01 a T12
```
