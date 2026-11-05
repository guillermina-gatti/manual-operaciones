# Tareas 011 · Asistente: documentos que se contradicen

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (05/11/2026):** todas pendientes.
  - T01 es la migración, **la hace Matías**.
  - T02 a T07 son el chat, T08 las alertas en documentos y T09 la integración de la API.
  - T10 a T13 son la web y T14 el Playwright.
  - T15 es la [verificación](#t15--verificación-de-la-feature).

## Antes de empezar

- **Avisarle a Guille** del cambio del prompt y de los cambios mínimos en su servicio (avisos 1 a 4 de la spec), y **a la pareja A** del enlace del menú (aviso 8). No hace falta esperar sus respuestas para empezar.
- **T01 va primero:** sin el modelo de Prisma, T06, T08 y T09 no compilan. T02 a T05 y T10 no dependen de la base y se pueden hacer antes.

Convenciones:

- **Commits:** una tarea = un commit. Tipo en inglés, ámbito `api`, `web` o `specs`, descripción en español y en infinitivo.
- **Rutas:** relativas a `apps/api/` en T01 a T09 y a `apps/web/` en T10 a T14, salvo que digan otra cosa.
- **Referencias:**
  - R1 a R21 y F1 a F10 son reglas de la spec, y D1 a D16 sus decisiones;
  - E1 a E18 son sus escenarios (tabla al principio del plan);
  - PD1 a PD12 son las decisiones del plan.
- **"Test primero":** se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Tests:**
  - `pnpm --filter api test <patrón>`, `pnpm --filter api test:e2e <patrón>`, `pnpm --filter web test <patrón>` y `pnpm --filter web test:e2e`;
  - los de integración resetean `manual_test`, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA;
  - ningún test llama a Gemini.
- **Archivos de otros que se tocan:**
  - **De Guille:**
    - solo agregando: `src/chat/chat-pipeline.ts` (T03), `src/chat/chat.module.ts` (T06) y `src/chat/chat-routes.parity.spec.ts` (T07);
    - con cambios mínimos: `src/chat/adapters/gemini-chat-llm.ts` (T04, el prompt de sistema) y `src/chat/chat.service.ts` (T07).
  - **De la pareja A:** ninguno. `components/session/RequireRole.tsx` se importa sin cambiarlo (T13).
  - **De la pareja B:** ninguno.
  - **Compartido:** `prisma/schema.prisma`, solo en la sección de la pareja C y en los modelos `Document` y `DocumentVersion` (T01).
- **Archivos que no se tocan:**
  - del chat: `chat.contract.ts`, `chat.controller.ts`, `chat.dto.ts`, `chat.service.spec.ts`, `ports/chat-repository.ts`, `adapters/prisma-chat-repository.ts` y `adapters/prisma-chat-retrieval.ts`;
  - del esquema: los modelos `Chunk`, `Message` y `Conversation`, y los de las parejas A y B;
  - de las migraciones: todas las anteriores;
  - de la web: `components/session`, `components/home`, `app/layout.tsx` y los tests de las parejas A y B.

---

## Datos

### T01 · Migración de la tabla de alertas (la hace Matías)

- **Qué hace:** el modelo `DocumentConflictAlert` y el enum `ConflictAlertStatus`, los campos de relación en `Document` y `DocumentVersion`, la migración con los tres `CHECK` a mano y su verificación (plan, sección 1).
- **Cubre:** sección 7.1 de la spec, R2, R11, R13, R15, D16; E18; PD7, PD12.
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<fecha>_add_document_conflict_alerts/migration.sql` y `test/documents/indexes.e2e-spec.ts`.
- **Pasos** (desde `apps/api`):
  1. **Test primero:** en `test/documents/indexes.e2e-spec.ts`, el `describe` "Alertas de contradicciones (spec 011)" del plan 1.4. Los `CHECK` y los índices existen, y los siete casos de `insertAlert` se aceptan o se rechazan con el nombre de cada restricción. Todavía no se corre: falla porque la tabla no existe.
  2. Editar `prisma/schema.prisma` como en el plan 1.1.
  3. `pnpm exec prisma migrate dev --create-only --name add_document_conflict_alerts`
  4. **Revisar el `migration.sql`:**
     - borrar todo `DROP INDEX` de índices escritos a mano en otras migraciones (`chunks_embedding_idx`, `chunks_content_fts_idx`, `chunks_content_fts_es_unaccent_idx`, si aparecen);
     - confirmar que solo quedan el `CREATE TYPE`, el `CREATE TABLE`, los cinco índices y las cuatro FK de la tabla nueva. Si hay otro `ALTER` o `DROP`, frenar.
  5. **Agregar al final** el SQL del plan 1.3, tal cual.
  6. `pnpm exec prisma migrate deploy`
  7. `pnpm exec prisma generate`
  8. **En la base de desarrollo,** las dos consultas del plan 1.4: tres `CHECK` y los tres índices de `chunks`.
  9. `pnpm --filter api test:e2e test/documents/indexes` (resetea `manual_test` y aplica todas las migraciones): en verde.
- **Verificación:**
  - el test del paso 9 en verde;
  - `pnpm --filter api exec tsc --noEmit` sin errores (el cliente tiene `documentConflictAlert`);
  - `git diff` del `schema.prisma`: solo la sección de la pareja C y los cuatro campos de relación.
- **Depende de:** —
- **Commit:** `feat(api): agregar la tabla de alertas de documentos contradictorios`
- **Estado:** pendiente.

## API · Chat

### T02 · Leer la marca de contradicción

- **Qué hace:** `chat-conflict.ts` con `CONFLICT_MARKER`, `readConflictMarker` y `keepOnlyRefs` (plan 2.1, PD1).
- **Cubre:** R2, R5, R6, R7 (citas), D10; E1, E6.
- **Archivos:** `src/chat/chat-conflict.ts` y `src/chat/chat-conflict.spec.ts`.
- **Verificación:** test primero:
  - `CONFLICT [S1] [S3]\nexplicación`, con pasajes de dos documentos → `conflict`, con los dos fragmentos en orden y el cuerpo (E1);
  - `CONFLICT [S3] [S1]` → los mismos fragmentos, en orden `S1`, `S3`;
  - mismo documento → `invalid` (E6);
  - `x === y`, `[S9]` con seis pasajes, texto de más en la línea, `conflict` en minúsculas o sin cuerpo → `invalid`, con su motivo;
  - espacios iniciales → se ignoran;
  - un texto que empieza con `NO_INFO` o con "Consultá" → `none`;
  - `keepOnlyRefs` quita `[S4]` y deja `[S1]` y `[S3]`.

  Falla porque el archivo no existe.
- **Depende de:** —
- **Commit:** `feat(api): leer la marca de contradicción del asistente`
- **Estado:** pendiente.

### T03 · `finishChat` reconoce la contradicción

- **Qué hace:** `Outcome` suma `conflict?`, y `finishChat` suma el `logger?` opcional y usa `readConflictMarker` después de `NO_INFO` (plan 2.2, PD2).
- **Cubre:** R5 a R7, R8 (las dos rutas comparten la función); E1, E6, E17.
- **Archivos:** `src/chat/chat-pipeline.ts` y `src/chat/chat-pipeline.spec.ts`.
- **Verificación:** test primero:
  - marca válida → `status: 'conflict'`, `answer` sin la línea ni marcas de otros pasajes, `chunks` = los dos en orden de pasaje y `conflict` lleno (E1);
  - inválida → `answered` sin la línea, `citedChunks` sobre el cuerpo y un `warn` con el motivo (E6);
  - inválida y sin cuerpo → `no_info` con `NO_INFO_TEXT`;
  - `NO_INFO` sigue primero;
  - sin marca → igual que hoy (E17).

  Falla porque `finishChat` no conoce la marca. Después, `chat.service.spec.ts` y los tests de paridad pasan sin cambios.
- **Depende de:** T02.
- **Commit:** `feat(api): responder conflict cuando el asistente marca una contradicción`
- **Estado:** pendiente.

### T04 · La regla de la marca en el prompt

- **Qué hace:** las tres líneas del plan 2.4 en `SYSTEM_PROMPT`, después de la de `NO_INFO`.
- **Cubre:** R3, R4, R18, R21.
- **Archivos:** `src/chat/adapters/gemini-chat-llm.ts` y `src/chat/adapters/gemini-chat-llm.spec.ts`.
- **Verificación:** test primero, con `MockLanguageModelV4`:
  - el sistema que reciben `answer` y `stream` trae las tres líneas, después de la de `NO_INFO`;
  - el resto del sistema y `buildPrompt` no cambian (con y sin el paso de la spec 010).

  Falla porque las líneas no están. El diff de `gemini-chat-llm.ts` es solo esas tres líneas.
- **Depende de:** —
- **Commit:** `feat(api): pedirle al asistente que marque las contradicciones`
- **Estado:** pendiente.

### T05 · El retén de las dos marcas

- **Qué hace:** `NoInfoGate` pasa a `MarkerGate`, que recibe los fragmentos y retiene `NO_INFO` y `CONFLICT` (plan 2.3, PD3). En `answer`, `finishChat(llm, prepared.chunks, this.logger)`.
- **Cubre:** R8, D9; E4, E6.
- **Archivos:** `src/chat/chat-stream.service.ts` y `src/chat/chat-stream.service.spec.ts`.
- **Verificación:** test primero, con el modelo simulado mandando partes:
  - la marca partida (`CON`, `FLICT [S`, `1] [S3]\n`, `explicación`) → ningún `delta`, y `done` con `conflict` y las dos fuentes (E4);
  - marca inválida → los `delta` unidos son el cuerpo e iguales al `answer` de `done`, con `answered` (E6);
  - "Consultá con tu supervisor" → sale entero;
  - `NO_INFO` partido en varias partes → como hoy.

  Falla porque el retén deja pasar la marca. Los tests de las specs 009 y 010 pasan sin cambios.
- **Depende de:** T03.
- **Commit:** `feat(api): no transmitir la marca de contradicción`
- **Estado:** pendiente.

### T06 · El puerto que registra la alerta

- **Qué hace:**
  - `orderConflictPair` en `src/documents/conflict-alerts/conflict-pair.ts` (PD8);
  - el puerto `ConflictAlertRecorder` y `PrismaConflictAlertRecorder`, con el `INSERT … ON CONFLICT` del plan 2.5 (PD4, PD5);
  - `recordConflictAlert` en `chat-conflict.ts` (PD6);
  - `FakeConflictAlertRecorder` en `testing/chat-fakes.ts`;
  - el proveedor en `chat.module.ts`.
- **Cubre:** R11 a R13, R19; E8, E16, E17.
- **Archivos:**
  - `src/documents/conflict-alerts/conflict-pair.ts` y `conflict-pair.spec.ts`;
  - `src/chat/ports/conflict-alert-recorder.ts` y `src/chat/adapters/prisma-conflict-alert-recorder.ts`;
  - `src/chat/chat-conflict.ts` y `chat-conflict.spec.ts`;
  - `src/chat/testing/chat-fakes.ts` y `src/chat/chat.module.ts`.
- **Verificación:** test primero:
  - **`orderConflictPair`:** el mismo resultado con la entrada en los dos órdenes (E8), mayúsculas y minúsculas, y lanza con el mismo documento;
  - **`recordConflictAlert`:**
    - sin `conflict` no llama al recorder (E17);
    - con `conflict` le pasa el `messageId`, la pregunta y los dos fragmentos;
    - un error se loguea con `error` y no se propaga (E16);
    - sin recorder, `warn`.

  Falla porque nada existe. El adaptador se prueba contra la base en T09.
- **Depende de:** T01, T03.
- **Commit:** `feat(api): registrar las alertas de contradicción`
- **Estado:** pendiente.

### T07 · El registro en las dos rutas y la paridad

- **Qué hace:**
  - **`ChatStreamService`:** suma `@Optional() conflictAlerts?`, y `run` llama a `recordConflictAlert` después de `saveResult` y antes de `done`;
  - **`ChatService` (Guille):** suma `@Optional() conflictAlerts?`, `ask` hace lo mismo después de `saveResult`, y `run` le pasa `this.logger` a `finishChat`;
  - **Swagger:** la descripción de `conflict` en la ruta de streaming.

  Plan 2.6.
- **Cubre:** R8, R12, R21; E3, E16, E17.
- **Archivos:** `src/chat/chat-stream.service.ts`, `src/chat/chat-stream.service.spec.ts`, `src/chat/chat-stream.controller.ts`, `src/chat/chat.service.ts` y `src/chat/chat-routes.parity.spec.ts`.
- **Verificación:** test primero:
  - **paridad:** con la marca, las dos rutas dan el mismo `status`, `answer` y `sources`, guardan lo mismo y le pasan lo mismo al recorder (E3); con una marca inválida, igual;
  - **streaming:**
    - el recorder se llama antes de `done`;
    - si falla, `done` llega igual con `conflict` (E16);
    - si el cliente cortó, no se llama.

  Falla porque ninguna ruta registra. Después:
  - `chat.service.spec.ts` pasa sin cambios (`git diff --exit-code`);
  - el diff de `chat.service.ts` es solo el parámetro opcional, la llamada y el `logger`.
- **Depende de:** T05, T06.
- **Commit:** `feat(api): alertar al admin cuando el asistente encuentra una contradicción`
- **Estado:** pendiente.

## API · Documentos

### T08 · Las rutas de las alertas

- **Qué hace:** `documents/conflict-alerts/` con el repositorio (puerto y adaptador), el servicio, el controlador y los DTO (plan 2.7), la auditoría (`CONFLICT_ALERT_RESOLVE`) y el registro en `documents.module.ts`.
- **Cubre:** R14 a R17, R20, D11, D12, D13, D15; E11 a E15.
- **Archivos:**
  - `src/documents/conflict-alerts/`: `conflict-alerts.repository.ts`, `prisma-conflict-alerts.repository.ts`, `conflict-alerts.service.ts` y su spec, `conflict-alerts.controller.ts` y su spec;
  - `src/documents/conflict-alerts/dto/`: `list-conflict-alerts.query.ts`, `resolve-conflict-alert.dto.ts` y `conflict-alert.response.ts`, con sus specs;
  - `src/documents/ports/audit-log.ts` y `src/documents/documents.module.ts`.
- **Verificación:** test primero:
  - **DTO:**
    - `status` inválido, `pageSize` 101 o un parámetro de más → error;
    - sin `status` → `OPEN`;
    - `note` de 501 → error.
  - **Servicio, con un repositorio simulado:**
    - `list` arma `resolvedBy` con `findUsersByIds`, con `isActive` (E11);
    - `resolve` exitoso → la alerta y la auditoría con los dos documentos (E13);
    - ya resuelta → 409 "La alerta ya está resuelta" (E14);
    - no existe → 404 "No se encontró la alerta";
    - nota de espacios → `null`;
    - repositorio caído → 503;
    - el fallo también se audita.
  - **Controlador:** `@Roles('ADMIN')` y los guards en la clase (E12).
  - **Respuesta:** campo por campo, sin quién preguntó (D13).

  Falla porque nada existe. El adaptador se prueba en T09.
- **Depende de:** T01, T06 (`conflict-pair.ts`).
- **Commit:** `feat(api): listar y resolver las alertas de contradicción`
- **Estado:** pendiente.

### T09 · Integración de las contradicciones

- **Qué hace:** dos suites nuevas (plan 4.2), con los helpers que siembran documentos con fragmentos en `test/chat/helpers.ts` y `test/documents/helpers.ts`, si hacen falta:
  - `test/chat/chat-conflict.e2e-spec.ts`;
  - `test/documents/conflict-alerts.e2e-spec.ts`.
- **Cubre:** E1, E3, E5, E7 a E15 a nivel API; los adaptadores `PrismaConflictAlertRecorder` y `PrismaConflictAlertsRepository`.
- **Archivos:** `test/chat/chat-conflict.e2e-spec.ts`, `test/documents/conflict-alerts.e2e-spec.ts`, `test/chat/helpers.ts` y `test/documents/helpers.ts`.
- **Verificación:** test primero, con Supertest y la base de tests.
  - **`chat-conflict`:**
    - por las dos rutas: `conflict`, el mensaje `CONFLICT` y una fila con el par en orden y `occurrences = 1` (E1, E3);
    - con los pasajes al revés: la misma fila con 2 (E8);
    - dos pedidos en paralelo: una fila con 2 (E8);
    - resuelta: no cambia (E9);
    - versión nueva: una fila nueva (E10);
    - un documento de otra área no llega al modelo (E7);
    - una versión `REPLACED` tampoco (E5).
  - **`conflict-alerts`:**
    - la lista, el orden, `openTotal`, las secciones (con un fragmento borrado → "Sin sección") e `isCurrentVersion` (E11);
    - 401, y 403 para SUPERVISOR y EMPLOYEE (E12);
    - resolver con nota (E13);
    - 409 (E14);
    - 404 y 400;
    - archivar uno y subir una versión del otro: sigue abierta (E15).

  Las suites de chat y de documentos pasan sin cambios. **Pedir la confirmación del usuario** antes de resetear `manual_test`.
- **Depende de:** T07, T08.
- **Commit:** `test(api): probar las contradicciones de punta a punta`
- **Estado:** pendiente.

## Web

### T10 · El aviso de contradicción en el chat

- **Qué hace:** plan 3.1 (PD9, PD10):
  - `ConflictNotice`;
  - el caso `conflict` en `ChatMessage`;
  - el `title?` de `ChatSources`;
  - en `useChatConversation`, las fuentes con `conflict` y el anuncio.
- **Cubre:** F1 a F4, F10, D9; E2.
- **Archivos:**
  - `components/chat/ConflictNotice.tsx`, `ChatMessage.tsx`, `ChatSources.tsx` y `useChatConversation.ts`;
  - `tests/components/chat/ChatMessage.test.tsx` y `ChatSources.test.tsx` (nuevos), y `ChatScreen.states.test.tsx`.
- **Verificación:** test primero:
  - **`ChatMessage`:** con `conflict`, "Dos documentos dicen cosas distintas", la explicación con las citas y la lista "Las dos fuentes" con dos enlaces a `/documentos/<id>` (E2); `no_info` sigue en la caja punteada;
  - **`ChatSources`:** sin `title`, igual que hoy;
  - **`ChatScreen.states`:** `done` con `conflict` → el aviso y el anuncio "Dos documentos dicen cosas distintas. …".

  Falla porque `conflict` se muestra como `no_info`. Después:
  - `ChatScreen.test.tsx`, `ChatPanel.test.tsx` y `ExecutionChatPanel.test.tsx` pasan sin cambios;
  - sin colores en hexadecimal.
- **Depende de:** —
- **Commit:** `feat(web): mostrar cuando dos documentos se contradicen`
- **Estado:** pendiente.

### T11 · El cliente de las alertas

- **Qué hace:** `lib/api/conflict-alerts.ts` (tipos, `listConflictAlerts` y `resolveConflictAlert`), su export en `lib/api/index.ts` y el contexto `'conflict-alert'` en `error-messages.ts` (plan 3.2).
- **Cubre:** R14, R15 en la web.
- **Archivos:** `lib/api/conflict-alerts.ts`, `lib/api/index.ts`, `lib/api/error-messages.ts`, `tests/lib/api/conflict-alerts.test.ts` y `tests/lib/api/error-messages.test.ts`.
- **Verificación:** test primero:
  - `listConflictAlerts('RESOLVED', 2, 20)` pide `/api/conflict-alerts?status=RESOLVED&page=2&pageSize=20`;
  - `resolveConflictAlert(id, 'nota')` hace el POST con `{ note }`, y sin nota, con `{}`;
  - el 409 da "Otra persona ya la marcó como resuelta".

  Falla porque nada existe.
- **Depende de:** —
- **Commit:** `feat(web): agregar el cliente de las alertas de contradicción`
- **Estado:** pendiente.

### T12 · El acceso "Alertas (n)"

- **Qué hace:** `ConflictAlertsLink`, montado en `DocumentList` junto a "Por revisar", solo para el ADMIN (plan 3.3).
- **Cubre:** F5, D11, D14; E11, E12.
- **Archivos:** `components/documents/ConflictAlertsLink.tsx`, `components/documents/DocumentList.tsx`, `tests/components/documents/ConflictAlertsLink.test.tsx` y `tests/components/documents/DocumentList.test.tsx`.
- **Verificación:** test primero:
  - "Alertas (2)" con `aria-label` "Alertas: 2 abiertas", y "1 abierta" con una;
  - nada mientras carga;
  - "Alertas" sin número si falla;
  - en `DocumentList`, el ADMIN ve el acceso y el EMPLOYEE no (E12).

  Falla porque el componente no existe. `PendingReviewLink.test.tsx` y `DocumentList.review.test.tsx` pasan sin cambios.
- **Depende de:** T11.
- **Commit:** `feat(web): agregar el acceso a las alertas en Documentos`
- **Estado:** pendiente.

### T13 · La sección "Alertas"

- **Qué hace:** plan 3.4 (PD11):
  - la página `app/documentos/alertas/page.tsx`, con `RequireRole roles={['ADMIN']}`;
  - `ConflictAlertList`, `ConflictAlertCard` y `ResolveAlertDialog`.
- **Cubre:** F6 a F10, D12 a D15; E11, E13, E14, E15.
- **Archivos:**
  - `app/documentos/alertas/page.tsx`;
  - `components/documents/ConflictAlertList.tsx`, `ConflictAlertCard.tsx` y `ResolveAlertDialog.tsx`;
  - `tests/components/documents/ConflictAlertList.test.tsx` y `ResolveAlertDialog.test.tsx`.
- **Verificación:** test primero:
  - **`ConflictAlertList`:**
    - las píldoras y el filtro en la URL (`?estado=resueltas`);
    - la tarjeta abierta, con los dos documentos enlazados, la versión y la sección, la pregunta y "Detectada el 05/11/2026 · Se repitió 3 veces · Última vez el 07/11/2026" (E11);
    - ningún dato de quién preguntó;
    - "● Archivado" y "Hay una versión nueva" (E15);
    - la resuelta, con "Resuelta el … por …" y la nota;
    - los dos vacíos de F9.
  - **`ResolveAlertDialog`:**
    - con y sin nota (E13);
    - el contador de 500;
    - el 409, con el mensaje y la recarga (E14).

  Falla porque nada existe. Después, sin colores en hexadecimal y `pnpm --filter web build` (con `API_URL`) bien.
- **Depende de:** T11.
- **Commit:** `feat(web): agregar la sección de alertas de documentos contradictorios`
- **Estado:** pendiente.

### T14 · Playwright: el aviso y las alertas

- **Qué hace:** `e2e/support/mock-api.ts` (nuestro) suma los handlers `conflictAlerts`, `resolveConflictAlert` y una respuesta `conflict` de `chatStream`. Suma la suite nueva `e2e/alertas.spec.ts` y un caso en `e2e/asistente.spec.ts` (plan 4.4).
- **Cubre:** E2, E11, E12 y E13 de punta a punta, con la API simulada.
- **Archivos:** `e2e/support/mock-api.ts`, `e2e/alertas.spec.ts` y `e2e/asistente.spec.ts`.
- **Verificación:** test primero, en escritorio y celular:
  - **`alertas.spec.ts`:**
    - el ADMIN ve "Alertas (1)", entra, ve la tarjeta y la marca como resuelta con una nota; la tarjeta pasa a "Resueltas" (E11, E13);
    - un EMPLOYEE no ve el acceso (E12).
  - **`asistente.spec.ts`:** una respuesta `conflict` muestra el aviso y las dos fuentes (E2).

  Las demás suites de Playwright simulado pasan sin cambios.
- **Depende de:** T10, T12, T13.
- **Commit:** `test(web): probar el aviso de contradicción y las alertas`
- **Estado:** pendiente.

## Verificación final

### T15 · Verificación de la feature

- **Qué hace:** corre todo, confirma la tabla de la sección 5 del plan, hace las mutaciones de control y anota el resultado en este archivo.
- **Cubre:** spec, sección 11 completa; plan, secciones 4 y 5.
- **Archivos:** `specs/011-asistente-contradicciones/tasks.md`.
- **Verificación:**
  1. **Todo en verde:**
     - API: `lint`, `tsc`, `test` y `test:e2e` (con confirmación);
     - web: `lint`, `tsc`, `test`, Playwright simulado y el build.
  2. **Sin cambios en lo protegido:**
     - `git diff develop --exit-code` sobre los archivos de la lista "Archivos que no se tocan";
     - `gemini-chat-llm.ts` solo con las tres líneas de T04;
     - `chat.service.ts` solo con el diff de T07;
     - `schema.prisma` solo con lo de T01;
     - la migración nueva, sin `DROP INDEX`.
  3. **La base:** las consultas del plan 1.4 sobre `manual_test` después del reset: tres `CHECK` y los índices de `chunks`.
  4. **Swagger:**
     - `GET /api/conflict-alerts` y `POST /api/conflict-alerts/{id}/resolve`, con sus respuestas;
     - la descripción de `conflict` en la ruta de streaming.
  5. **Mutaciones de control**, una por vez, restaurando antes de la siguiente:
     - aceptar una marca con dos pasajes del mismo documento → E6;
     - dejar pasar la marca en el retén → E4;
     - no ordenar el par → E8 (el `CHECK` o la paridad de la fila);
     - quitar el `WHERE status = 'OPEN'` del `DO UPDATE` → E9;
     - propagar el error del recorder → E16;
     - no registrar en `ask` → E3 (paridad);
     - mostrar el acceso a cualquier rol → E12;
     - quitar un `CHECK` de la migración en `manual_test` → E18.
  6. **Avisos:** a Guille (sección 12 de la spec) y a la pareja A (sección 13). Los manda Matías.
- **Depende de:** T01 a T14.
- **Commit:** `docs(specs): verificar las contradicciones del asistente`
- **Estado:** pendiente.

---

## Orden y dependencias

```
Datos:
  T01 (Matías, primero)

API · Chat:
  T02 (suelta) · T04 (suelta)
  T03 ◄─ T02
  T05 ◄─ T03
  T06 ◄─ T01, T03
  T07 ◄─ T05, T06

API · Documentos:
  T08 ◄─ T01, T06 (conflict-pair.ts)
  T09 ◄─ T07, T08

Web:
  T10 (suelta) · T11 (suelta)
  T12 ◄─ T11
  T13 ◄─ T11
  T14 ◄─ T10, T12, T13

Verificación:
  T15 ◄─ T01 a T14
```
