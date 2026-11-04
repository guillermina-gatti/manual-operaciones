# Tareas 008 · Referencias históricas en Documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (04/11/2026):** T01 a T14 **hechas**, sin commits (los hace el usuario). T05 y T06 usan la [función temporal `findUsersByIds`](#función-temporal-findusersbyids) mientras `UsersDirectory.findByIds` no está en develop. Falta solo reemplazarla cuando llegue, y mandar los [avisos a la pareja A](#avisos-a-la-pareja-a-pd13). T01 a T07 son la API, T08 a T13 la web y T14, la [verificación](#t14--verificación-de-la-feature).

## Función temporal `findUsersByIds`

`UsersDirectory.findByIds(ids)` todavía no está en develop. Para no frenar T05 y T06 (la web se rompía porque la API no mandaba `owner`, `areas`, `lastReviewedBy` ni `uploadedBy`), está `src/documents/find-users-by-ids.ts`, sin tocar los puertos ni los adaptadores de la pareja A:

- saca los repetidos y llama a `UsersDirectory.findById` en paralelo, una vez por cada ID distinto, y omite los que no existen: el mismo comportamiento que confirmó la pareja A para `findByIds` (Q1);
- la usa un solo lugar, `DocumentReferences.lookup` (`document-references.ts`), marcado con `TODO(spec 008)`;
- **cuando `findByIds` esté en develop:** `lookup` pasa a llamar a `this.users.findByIds(userIds)`, se borra `find-users-by-ids.ts` y su bloque de tests en `document-references.spec.ts` (`findUsersByIds (temporal, …)`). Los tests de `DocumentReferences` que cuentan llamadas a `findById` pasan a contar `findByIds`.

Diferencia con el plan (sección 9 de la spec, "en lote"): mientras dure, una página con N responsables distintos hace N consultas de usuarios en vez de una.

## Qué se puede hacer ya y qué espera a la pareja A

`UsersDirectory.findByIds(ids)` todavía no existe (spec, "Depende de"). Desde el 04/11/2026, T05 a T07, T13 y T14 se pueden hacer con la función temporal de arriba. Cada tarea dice si lo necesita:

| Tarea | ¿Se puede hacer ya? | Por qué |
| --- | --- | --- |
| T01 · Validar las áreas agregadas | **Sí** | Usa `AreasDirectory.findByIds`, que ya está |
| T02 · Validar el responsable nuevo inactivo | **Sí** | Usa `UsersDirectory.findById`, que ya trae `isActive` |
| T03 · Integración de las validaciones | **Sí** | Depende de T01 y T02 |
| T04 · Referencias: tipos y búsqueda en memoria | **Sí** | Es puro: no llama a los directorios |
| T05 · Buscar las referencias en lote | **Hecha, con `findUsersByIds`** | Cambia a `UsersDirectory.findByIds` cuando esté |
| T06 · Respuestas con nombres | **Hecha** | Depende de T05 |
| T07 · Integración de las respuestas | **Hecha** | Depende de T06 |
| T08 · Web: tipos y formatos | **Sí** | Solo tipos y funciones puras |
| T09 · Web: pantallas de consulta | **Sí, con respuestas simuladas** | Se mergea con T06 o después (PD11) |
| T10 · Web: historial de versiones | **Sí, con respuestas simuladas** | Se mergea con T06 o después (PD11) |
| T11 · Web: `OwnerField` y cambio de áreas | **Sí, con respuestas simuladas** | Se mergea con T06 o después (PD11) |
| T12 · Web: mensajes de los errores nuevos | **Sí** | Se puede mergear después de T03 |
| T13 · Playwright contra la API real | **Hecha** | Con la API levantada contra `manual_test` |
| T14 · Verificación | **Hecha** | Salvo el reemplazo por `findByIds`, que espera a la pareja A |

Convenciones:

- Una tarea = un commit. Las rutas son relativas a `apps/api/` en T01 a T07 y a `apps/web/` en T08 a T13, salvo que digan otra cosa.
- R1 a R13 y F1 a F8 son reglas de la spec; P1 a P9, sus decisiones; E1 a E22, sus escenarios (tabla al principio del plan); PD1 a PD13, las decisiones del plan (sección 8.1). Queda una pregunta abierta (Q1, plan 8.2), que no bloquea ninguna tarea que se pueda hacer ya.
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Commits:** tipo en inglés, ámbito `api`, `web` o `specs`, descripción en español y en infinitivo.
- **Ninguna tarea toca** los archivos de la pareja A: `src/documents/ports/*-directory.ts`, `src/documents/adapters/*-directory.ts`, `src/areas`, `src/users`, `src/auth` y `apps/web/lib/directory` (spec, sección 9). Ninguna toca `schema.prisma` ni las migraciones.
- Tests: `pnpm --filter api test <patrón>`, `pnpm --filter api test:e2e <patrón>` y `pnpm --filter web test <patrón>`. Los de integración resetean `manual_test` antes de la suite, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA.
- **Inactivos en integración:** se desactivan en la base con los helpers de T03, nunca al actor del pedido (`JwtAuthGuard` lee `isActive` en cada pedido), y cada suite deja los fixtures activos al terminar (PD12).

---

## API

### T01 · Validar las áreas agregadas

- **Qué hace:** `DocumentWriteSteps.assertAreasExist(areaIds)` pasa a `assertAreasCanBeAssigned(areaIds, currentAreaIds = [])`, con una sola llamada a `areas.findByIds(areaIds)` (PD6):
  - las que no vinieron → 400 `areaIds: no existen las áreas <ids>` (el mensaje de hoy);
  - las agregadas (las que no están en `currentAreaIds`) con `isActive: false` → 400 `areaIds: están inactivas las áreas <ids>`.

  `DocumentUploadService` la llama sin `currentAreaIds`; `DocumentLifecycleService.changeAreas`, con `current.areaIds`, en el mismo lugar que hoy (después de R11).
- **Cubre:** R7, R8, R10; PD6; plan sección 2.1.
- **Archivos:** `src/documents/document-write-steps.ts`, `src/documents/document-write-steps.spec.ts`, `src/documents/document-upload.service.ts`, `src/documents/document-lifecycle.service.ts`, y sus `*.spec.ts` si llaman al método por nombre.
- **Verificación:** test primero, `document-write-steps.spec.ts`, con `InMemoryAreasDirectory` con Ventas activa y Compras y Logística inactivas:
  - un área que no existe → el 400 de hoy;
  - carga con Ventas y Compras → 400 con el id de Compras (**E12**);
  - cambio de Ventas a Ventas y Logística → 400 con el id de Logística (**E14**);
  - cambio de Ventas y Compras a Compras y Operaciones → pasa (**E13**);
  - una inexistente y una inactiva agregada → gana la inexistente (R10);
  - con `jest.spyOn`, una sola llamada a `findByIds` y ninguna a `findExistingIds`.

  Falla porque el método no existe. Los tests de las specs 001 y 003 sobre áreas inexistentes pasan sin cambios.
- **Depende de:** —
- **Commit:** `feat(api): rechazar las áreas inactivas agregadas a un documento`
- **Estado:** hecha. Fallaron primero los 6 tests nuevos (el método no existía). Los mocks de áreas de `document-upload.service.spec.ts` y `document-lifecycle.service.spec.ts` pasan de `findExistingIds` a `findByIds`; se suman E13 y E14 en el del ciclo de vida.

### T02 · Validar el responsable nuevo inactivo

- **Qué hace:** `assertOwnerCanSeeDocument(ownerId, areaIds)` suma `{ isNew }`. Con el mismo `findById`: no existe → 400 de hoy; `isNew` e inactivo → 400 `ownerId: el responsable está inactivo`; sin acceso → 400 de hoy (PD7). La carga pasa `isNew: true`; el cambio de áreas, `dto.ownerId !== undefined && dto.ownerId !== current.ownerId`.
- **Cubre:** R5, R6, R10; P5; PD7; plan sección 2.2.
- **Archivos:** `src/documents/document-write-steps.ts`, `src/documents/document-write-steps.spec.ts`, `src/documents/document-upload.service.ts`, `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`.
- **Verificación:** test primero, con `InMemoryUsersDirectory` armado con un EMPLOYEE de Ventas inactivo:
  - `document-write-steps.spec.ts`: nuevo e inactivo → 400 de R5 (**E11**, **E17**); no nuevo, inactivo y con acceso → pasa (**E15**); no nuevo, inactivo y sin acceso → 400 de acceso (**E16**); nuevo, activo y sin acceso → 400 de acceso (como hoy); inexistente → 400 de hoy;
  - `document-lifecycle.service.spec.ts`: sin `ownerId` → `isNew: false`; con el mismo `ownerId` que el actual → `isNew: false`; con otro → `isNew: true`; R11 (sin cambios) no valida nada aunque el responsable esté inactivo.

  Falla porque hoy el responsable inactivo pasa.
- **Depende de:** — (se puede hacer en paralelo con T01; si van una después de otra, el segundo commit ajusta el mismo archivo)
- **Commit:** `feat(api): rechazar un responsable nuevo inactivo`
- **Estado:** hecha. Fallaron primero los 4 tests de inactivo (el responsable inactivo pasaba). `isNew` en el cambio de áreas es `ownerId !== current.ownerId`, con `ownerId = dto.ownerId ?? current.ownerId`: lo mismo que pide la tarea. Se suman E11 y E12 en `document-upload.service.spec.ts`.

### T03 · Integración de las validaciones

- **Qué hace:**
  - `test/documents/helpers.ts` suma `seedArea(prisma, { name, isActive })`, `seedUser(prisma, { name, role, areaIds, isActive })`, `setUserActive(prisma, userId, isActive)` y `setAreaActive(prisma, areaId, isActive)` (PD12);
  - Swagger: el 400 de `POST /documents` y de `PATCH /documents/:id/areas` suma "área inactiva agregada o responsable nuevo inactivo";
  - la suite nueva `test/documents/assignments.e2e-spec.ts`.
- **Cubre:** R5 a R11, R13 (auditoría de los 400); D3; E11 a E18 y E22 a nivel API; plan sección 4.2.
- **Archivos:** `test/documents/helpers.ts`, `test/documents/assignments.e2e-spec.ts`, `src/documents/documents.controller.ts`.
- **Verificación:** test primero, `assignments.e2e-spec.ts`, con Supertest y la base de tests:
  - **E11:** carga con un EMPLOYEE de Ventas inactivo → 400 `ownerId: el responsable está inactivo`; no hay documento nuevo ni archivo guardado;
  - **E12:** carga con Ventas y Compras inactiva → 400 con el id de Compras; nada guardado;
  - **E13:** documento con Ventas y Compras; se desactiva Compras; cambio a Compras y Operaciones → 200 y quedan esas dos;
  - **E14:** cambio a Ventas y Logística inactiva → 400; las áreas no cambian;
  - **E15:** responsable de Ventas, documento de Ventas y Operaciones; se desactiva el responsable; cambio a Ventas sin `ownerId` → 200, mismo responsable;
  - **E16:** el mismo responsable inactivo; cambio a Operaciones sin `ownerId` → 400 de acceso;
  - **E17:** cambio con `ownerId` de otro usuario inactivo → 400 de R5; el responsable no cambia;
  - **E18:** se desactivan el responsable y Compras → `ownerId` y `areaIds` del documento no cambian;
  - **E22:** un EMPLOYEE de Compras (creado en el test, activo), con Compras inactiva → el listado y el detalle incluyen el documento;
  - los 400 de E11, E14 y E17 quedan en la auditoría como `FAILURE` con detalle `400`;
  - las suites `upload`, `lifecycle` y `query` pasan sin cambios.

  Falla en E11, E12, E14 y E17 si se corre sin T01 y T02.
- **Depende de:** T01, T02
- **Commit:** `test(api): probar las asignaciones con usuarios y áreas inactivos`
- **Estado:** hecha. 12 tests; `test:e2e documents`: 13 suites, 255 tests, todos pasan. No se corrió contra el código sin T01 y T02 (ya estaban hechas al escribir la suite). Además de la tarea: la carga con responsable y áreas activos sigue dando 201, y el mismo `ownerId` inactivo que el actual pasa (R6). Los helpers suman `deleteSeededDirectory` para borrar lo creado.

### T04 · Referencias: tipos y búsqueda en memoria

- **Qué hace:** crea `src/documents/document-references.ts` con lo puro de la sección 1.1 del plan: `DocumentReference`, `ReferenceIds`, `ReferenceLookup` (`from`, `user`, `area`, `has`), con la referencia de R12 para lo que no se encontró (PD4), y `referenceIdsOf(items)`, con el revisor solo si `withReview` (PD3). Todavía no lo usa nadie.
- **Cubre:** R1, R3, R12; PD1, PD3, PD4; plan sección 1.1.
- **Archivos:** `src/documents/document-references.ts`, `src/documents/document-references.spec.ts`.
- **Verificación:** test primero, `document-references.spec.ts`:
  - `ReferenceLookup.from` con un usuario inactivo y un área activa → `user(id)` y `area(id)` con su `name` e `isActive`; un ID que no está → `{ id, name: null, isActive: false }` (**E10**);
  - la referencia tiene exactamente `id`, `name` e `isActive` aunque `from` reciba más campos (`role`, `areaIds`) (`toStrictEqual`; R3);
  - `referenceIdsOf`: sin repetidos entre documentos; `lastReviewedById` solo de los que tienen `withReview: true` (**E5**); sin revisión → no aparece;
  - `has`: verdadero solo si están todos los IDs.

  Falla porque el archivo no existe.
- **Depende de:** —
- **Commit:** `feat(api): armar las referencias de usuarios y áreas de los documentos`
- **Estado:** hecha. Falló primero (el archivo no existía); 10 tests. Diferencia con el plan (1.1): `ReferenceLookup.from` recibe un tercer parámetro opcional, los IDs buscados, para que `has` cuente como resueltos los que se buscaron y no existen (PD5 no los vuelve a pedir).

### T05 · Buscar las referencias en lote

- **Qué hace:** suma a `document-references.ts` la clase `DocumentReferences(users, areas)` con `lookup(ids)`: `users.findByIds` y `areas.findByIds` en paralelo, sin repetidos, sin llamar con una lista vacía, y `ReferenceLookup.from` con los resultados (PD1). Un directorio caído deja pasar `RepositoryUnavailableError`.
- **Cubre:** R1, R12, R13; sección 9 de la spec (en lote); PD1; plan sección 1.1.
- **Archivos:** `src/documents/document-references.ts`, `src/documents/document-references.spec.ts`.
- **Verificación:** test primero, con `InMemoryUsersDirectory` e `InMemoryAreasDirectory` y espías:
  - un `findByIds` de usuarios y uno de áreas por `lookup`, con los IDs sin repetidos;
  - `userIds` vacío → no llama al de usuarios (ídem áreas);
  - un ID que el directorio no devuelve → la referencia de R12 (según lo que confirme la pareja A en Q1);
  - un directorio que lanza `RepositoryUnavailableError` → `lookup` la lanza.
- **Depende de:** T04 y **`UsersDirectory.findByIds` de la pareja A** (en el puerto, en `PrismaUsersDirectory` y en `InMemoryUsersDirectory`). Antes de empezar, confirmar Q1 (plan 8.2).
- **Commit:** `feat(api): buscar en lote los nombres de las referencias`
- **Estado:** hecha, con la [función temporal `findUsersByIds`](#función-temporal-findusersbyids) en vez de `users.findByIds`. Fallaron primero (no existían `DocumentReferences` ni `find-users-by-ids.ts`); 8 tests nuevos (3 de la función temporal, 5 de `DocumentReferences`). Además de la tarea, `ReferenceLookup` suma `missing(ids)` y `merge(other)`, y `DocumentReferences` suma `complete(lookup, ids)`, para PD5 (lo que aparece recién en el resultado de una escritura).

### T06 · Respuestas con nombres

- **Qué hace:**
  - `dto/document.response.ts`: `DocumentReferenceResponse` (Swagger); `owner`, `areas`, `review.lastReviewedBy` y `uploadedBy`, sin sacar los IDs (P1); los mapeos reciben el `ReferenceLookup` como parámetro obligatorio (PD2; plan 1.2);
  - `DocumentQueryService` suma `AreasDirectory` (antes de `DocumentsRepository`; el `Clock` sigue último) y hace un `lookup` por respuesta en `findOne`, `list`, `pendingReview`, `search` y `listVersions`, con los IDs de la tabla 1.3 del plan;
  - `DocumentUploadService` y `DocumentLifecycleService` hacen el `lookup` antes de escribir, con los IDs de la tabla 1.4; un ID que aparece recién en el resultado se pide después y, si falla, sale con `name: null` y queda en el log (PD5). R11 responde con nombres;
  - Swagger: las respuestas muestran los campos nuevos; los 503 de las consultas suman "o el directorio".
- **Cubre:** R1 a R4, R12, R13; P1 a P4; PD2, PD3, PD5; plan secciones 1.2 a 1.4.
- **Archivos:** `src/documents/dto/document.response.ts`, `src/documents/dto/document.response.spec.ts`, `src/documents/document-query.service.ts`, `src/documents/document-query.service.spec.ts`, `src/documents/document-upload.service.ts`, `src/documents/document-upload.service.spec.ts`, `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`, `src/documents/documents.controller.ts`.
- **Verificación:** test primero:
  - `document.response.spec.ts`, con un `ReferenceLookup` armado a mano: `owner`, `areas` en el orden de `areaIds`, `review.lastReviewedBy` (y `null` sin revisión), `uploadedBy`; los IDs siguen; `toStrictEqual` en cada referencia (R3);
  - `document-query.service.spec.ts`: cada consulta, un solo `lookup`; el revisor de un documento sin `review` no se pide (**E5**); directorio de áreas o de usuarios caído → 503 (R13); página vacía → sin `lookup`;
  - `document-upload.service.spec.ts` y `document-lifecycle.service.spec.ts`: los IDs de la tabla 1.4 se piden antes de escribir; directorio caído → 503 y el repositorio no escribió; "Marcar como revisado" responde `lastReviewedBy` del actor (**E8**); un ID nuevo en el resultado se pide después y, si falla, sale con `name: null` y queda en el log (PD5);
  - los `*.spec.ts` que construyen `DocumentQueryService` suman el directorio de áreas.
- **Depende de:** T05 (y por eso, de `findByIds`). Conviene después de T01 y T02, que tocan los mismos servicios.
- **Commit:** `feat(api): devolver los nombres del responsable, las áreas y la revisión`
- **Estado:** hecha. `document.response.spec.ts` se reescribió con un `ReferenceLookup` armado a mano (19 tests); se suman 7 en `document-query.service.spec.ts`, 3 en `document-upload.service.spec.ts` y 5 en `document-lifecycle.service.spec.ts`. Ajustes en tests existentes: los `review` esperados suman `lastReviewedBy`, el historial suma `uploadedBy`, y el test de R11 con responsable inactivo ya no espera cero llamadas a `findById` (ahora se llama para los nombres, no para validar). Los mapeos reciben el `DocumentReviewInfo` de `review-status.ts` (sin `lastReviewedBy`); el DTO de Swagger lo suma. `api test`: 85 suites, 1324 tests; `tsc` y `lint` en verde. `test:e2e documents` (con la confirmación del usuario para resetear `manual_test`): 13 suites, 255 tests, todos pasan, después de ajustar las respuestas enteras de `upload`, `lifecycle` y `reviews` (suman `owner`, `areas`, `lastReviewedBy` y `uploadedBy`; los nombres con `expect.any(String)`, porque salen de la base de tests). Ese ajuste es la segunda parte de T07; falta su suite nueva.

### T07 · Integración de las respuestas

- **Qué hace:** la suite nueva `test/documents/references.e2e-spec.ts` y el ajuste de las suites existentes que comparan respuestas enteras.
- **Cubre:** E1 a E8 y E10 a nivel API; R3; plan sección 4.2.
- **Archivos:** `test/documents/references.e2e-spec.ts` y, si hace falta, `test/documents/{upload,lifecycle,query,search,reviews}.e2e-spec.ts`.
- **Verificación:** test primero, `references.e2e-spec.ts`, con Supertest y la base de tests:
  - **E1:** `empleadoVentas` lista → `owner` y `areas` con `name` e `isActive`, y siguen `ownerId` y `areaIds`;
  - **E2:** la búsqueda, con el responsable desactivado → `owner.isActive: false`;
  - **E3:** el detalle, ídem;
  - **E4:** documento con Ventas y Compras inactiva → `areas[1].isActive: false`, en el orden de `areaIds`;
  - **E5:** revisado por un ADMIN que después se desactiva → el responsable recibe `review.lastReviewedBy` con `isActive: false`; `empleadoVentas`, que no es el responsable, no recibe `review`;
  - **E6:** "Por revisar" del ADMIN con el responsable desactivado → `owner.isActive: false`;
  - **E7:** historial con dos versiones, la primera de un ADMIN desactivado → `uploadedBy` en cada una, y siguen los `uploadedById`;
  - **E8:** carga, cambio de áreas, versión nueva, "Marcar como revisado" (con `lastReviewedBy` del ADMIN) y archivar responden `owner` y `areas`;
  - **E10:** un documento cuyo `ownerId` no corresponde a ningún usuario (armado en la base) → `owner` con `name: null` e `isActive: false`;
  - ninguna referencia trae más que `id`, `name` e `isActive` (R3);
  - las suites de las specs 001 a 007 pasan, con los `toStrictEqual` de respuestas enteras ajustados.
- **Depende de:** T06
- **Commit:** `test(api): probar los nombres de las referencias en las respuestas`
- **Estado:** hecha. `references.e2e-spec.ts`: 13 tests (E1 a E7, las cinco escrituras de E8 y E10), con la comprobación de R3 (`expectOnlyReferenceKeys`) donde hay referencias. No hubo corrida en rojo: T06 ya estaba hecha. Los usuarios y el área propios (Ana, Rita, Compras) se crean con los helpers de T03 y se borran al terminar. E10 se arma con un `ownerId` que no existe: la tabla no tiene clave foránea a `users`. `test:e2e documents` (con la confirmación del usuario para resetear `manual_test`): 14 suites, 268 tests, todos pasan.

## Web

### T08 · Tipos y formatos

- **Qué hace:**
  - `lib/api/documents.ts`: `DocumentReference { id; name: string | null; isActive }`; `owner` y `areas` en `DocumentFields`, `lastReviewedBy` en `DocumentReview` y `uploadedBy` en `VersionHistoryItem`;
  - `lib/documents/format.ts`: `formatPerson`, `formatArea` y `formatAreas` (PD8; plan 3.1);
  - los objetos de prueba con forma de documento que usan los tests suman `owner` y `areas`, para que el tipado no falle.
- **Cubre:** F2, F3; PD8; plan sección 3.1.
- **Archivos:** `lib/api/documents.ts`, `lib/documents/format.ts`, `tests/lib/documents/format.test.ts` y los datos de prueba compartidos de `tests/` que construyen documentos.
- **Verificación:** test primero, `format.test.ts`: `formatPerson` → "Ana Pérez", "Ana Pérez (inactivo)" y "—" con `name: null` (sin "(inactivo)"); `formatArea` → "Compras (inactiva)"; `formatAreas([])` → "—". Falla porque las funciones no existen. `pnpm --filter web exec tsc --noEmit` en verde.
- **Depende de:** —
- **Commit:** `feat(web): agregar las referencias con nombre a los tipos de documentos`
- **Estado:** hecha. `format-references.test.ts` falló primero (8 tests). Los datos de prueba usan el apoyo nuevo `tests/support/documents.ts` (`personRef`, `areaRef`, `referencesOf`, `reviewOf`), que también usa el mock de Playwright (`e2e/support/mock-api.ts`, `avisos.spec.ts`, `smoke.spec.ts`) para que compile. `tsc` en verde.

### T09 · Pantallas de consulta

- **Qué hace:** `DocumentCard` y `SearchResultCard` dejan de recibir `areaNames` y `ownerName` y usan `document.owner` y `document.areas`; `DocumentList`, `SearchResults`, `PendingReviewList` y `DocumentDetail` dejan de llamar a `usersDirectory.getNames` y a `areasDirectory.listAreas`; `DocumentDetail` muestra el revisor con `formatPerson(review.lastReviewedBy)` (plan 3.2).
- **Cubre:** F1 a F3; P2, P7, P8; E1 a E6, E9, E10 en pantalla.
- **Archivos:** `components/documents/{DocumentCard,SearchResultCard,DocumentList,SearchResults,PendingReviewList,DocumentDetail}.tsx` y sus tests en `tests/components/documents/`.
- **Verificación:** test primero, con `fetch` simulado y espías sobre `@/lib/directory`:
  - listado, búsqueda y "Por revisar" muestran "Ana Pérez (inactivo)" y "Ventas, Compras (inactiva)" (**E1**, **E2**, **E4**, **E6**);
  - el detalle, el responsable inactivo y "Revisado … por Juan Gómez (inactivo)" (**E3**, **E5**); `owner.name: null` → "—" (**E10**);
  - ninguna de las cinco pantallas llama a `getNames` ni a `listAreas` (**E9**);
  - los tests que hoy simulan `getNames` o `listAreas` pasan a usar `owner` y `areas`.
- **Depende de:** T08. **Se puede hacer ya** con respuestas simuladas, pero **se mergea con T06 o después** (PD11).
- **Commit:** `feat(web): mostrar los nombres que trae la respuesta de documentos`
- **Estado:** hecha, sin mergear antes de T06 (PD11). Los componentes se cambiaron antes de escribir los tests nuevos: no hay corrida en rojo de esta tarea. Se reemplazaron los tests que comprobaban `getNames` (listado, detalle) por los de la respuesta, y se sumaron E3 a E6, E9 y E10.

### T10 · Historial de versiones

- **Qué hace:** `VersionHistory` muestra quién subió cada versión con `formatPerson(version.uploadedBy)` y deja de llamar a `getNames`.
- **Cubre:** F1 a F3; P3; E7 en pantalla.
- **Archivos:** `components/documents/VersionHistory.tsx`, `tests/components/documents/VersionHistory.test.tsx`.
- **Verificación:** test primero: una versión subida por un ADMIN inactivo muestra "(inactivo)" (**E7**); `uploadedBy.name: null` → "—"; sin llamadas a `getNames`.
- **Depende de:** T08. **Se puede hacer ya**; se mergea con T06 o después (PD11).
- **Commit:** `feat(web): mostrar quién subió cada versión desde la respuesta`
- **Estado:** hecha, sin mergear antes de T06. Los 2 tests nuevos fallaron primero. El dato de prueba `version()` arma `uploadedBy` desde `uploadedById`.

### T11 · `OwnerField` y cambio de áreas

- **Qué hace:** (plan 3.3)
  - `OwnerField` suma `currentOwner?: DocumentReference` y `onlyInactiveAreas?: boolean`: incluye siempre al responsable actual en la lista (con `formatPerson`) y no lo borra; un candidato elegido que deja de serlo se sigue borrando (PD9). Con `onlyInactiveAreas`, no pide candidatos y muestra "Para elegir otro responsable, marcá al menos un área activa";
  - `ChangeAreasForm` pasa `currentOwner={document.owner}`, solo las áreas activas elegidas como `areaIds` y `onlyInactiveAreas` (PD10). Sigue mandando `ownerId` solo si cambió;
  - `UploadDocumentForm` no cambia (F5).
- **Cubre:** F4 a F6; P5, P9; PD9, PD10; E16, E19 a E21 en pantalla.
- **Archivos:** `components/documents/OwnerField.tsx`, `components/documents/ChangeAreasForm.tsx`, `tests/components/documents/OwnerField.test.tsx`, `tests/components/documents/ChangeAreasForm.test.tsx`.
- **Verificación:** test primero:
  - **E19:** documento con responsable inactivo → aparece elegido como "Ana Pérez (inactivo)"; al marcar otra área y al llegar los candidatos sigue elegido; al guardar, el pedido no trae `ownerId`;
  - **E20:** elegir un candidato activo → el pedido trae ese `ownerId`;
  - un candidato elegido que deja de serlo al cambiar las áreas → se borra con `OWNER_NO_LONGER_VALID` (E4 del plan 002, sin cambios);
  - **E21:** con Ventas y Compras inactiva, `listOwnerCandidates` se llama solo con Ventas; al desmarcar Ventas no se llama y aparece la ayuda;
  - **E16:** un 400 `ownerId: el responsable no comparte …` queda en el campo y el responsable sigue elegido;
  - `UploadDocumentForm.test.tsx` y `upload-fields.test.tsx` pasan sin cambios (F5).
- **Depende de:** T08. **Se puede hacer ya**; se mergea con T06 o después (PD11), porque usa `document.owner`.
- **Commit:** `feat(web): conservar el responsable actual al cambiar las áreas`
- **Estado:** hecha, sin mergear antes de T06. Fallaron primero 5 tests de `OwnerField` y 4 de `ChangeAreasForm`. **Cambio de comportamiento:** el test E6 de la spec 003 ("el responsable de Ventas se borra con el aviso") pasa a comprobar lo contrario, como piden P5 y F4: no se borra, se manda sin `ownerId` y el 400 de la API queda en el campo. E1 de la spec 003 ya no espera que el responsable se vacíe antes de elegir otro. **Arreglo posterior (04/11/2026):** E20 de `OwnerField.test.tsx` fallaba a veces con la suite completa. `waitForCandidates` contaba opciones, y con `currentOwner` el responsable actual ya es una opción antes de que lleguen los candidatos. Ahora también espera que el select esté habilitado.

### T12 · Mensajes de los errores nuevos

- **Qué hace:** `lib/api/error-messages.ts`: para la carga y el cambio de áreas, el 400 de R5 y el de R7 llevan en el campo los textos de la tabla 3.4 del plan; los demás 400 siguen con `FIELD_MESSAGES`.
- **Cubre:** F7; E11, E12 en pantalla; plan sección 3.4.
- **Archivos:** `lib/api/error-messages.ts` y su test en `tests/`.
- **Verificación:** test primero: `ownerId: el responsable está inactivo` → "El responsable está inactivo. Elegí otro." en `ownerId`; `areaIds: están inactivas las áreas …` → "Hay áreas inactivas entre las que agregaste. Sacalas para guardar." en `areaIds`; `ownerId: el responsable no comparte …` y `areaIds: no existen …` → los textos de hoy.
- **Depende de:** —. Se puede mergear cuando quiera; tiene sentido después de T03.
- **Commit:** `feat(web): explicar los rechazos por responsable o área inactivos`
- **Estado:** hecha. Fallaron primero 4 tests (2 por contexto, carga y áreas).

### T13 · Playwright contra la API real

- **Qué hace:** `e2e/integracion/referencias.spec.ts`, con el recorrido de la sección 4.4 del plan.
- **Cubre:** E3, E4, E13, E15, E19 de punta a punta.
- **Archivos:** `apps/web/e2e/integracion/referencias.spec.ts` y `apps/api/test/documents/seed-references.ts` (la siembra; ver Estado).
- **Verificación:** con la API y la base levantadas: el listado y el detalle muestran "(inactivo)" e "(inactiva)"; el ADMIN abre el cambio de áreas, ve al responsable inactivo elegido, agrega Operaciones y guarda; el detalle sigue con el mismo responsable y con Compras (inactiva) y Operaciones. Las demás de `e2e/integracion` pasan.
- **Depende de:** T06, T09, T11
- **Commit:** `test(web): recorrer los documentos con referencias inactivas`
- **Estado:** hecha. Pasa contra la API real (verificado antes con `pg_stat_activity` que la API estaba conectada a `manual_test` y no a `manual`), junto con las otras 12 de `e2e/integracion`. La siembra se corre con `execSync` y un solo texto de comando: con `execFileSync` y `shell: true`, Node avisaba que los argumentos no se escapan.
  - **Siembra:** no hay endpoint para desactivar usuarios ni áreas, y la API no deja cargar con inactivos (R5, R7). Por eso el documento lo siembra `apps/api/test/documents/seed-references.ts`, que el spec corre con el `ts-node` de la API. Crea un responsable y un área propios de la corrida, el documento de Ventas y de esa área, y después los desactiva. Escribe solo en `TEST_DATABASE_URL` y corta si no es una base local `_test`, con los mismos controles que `seed:fixtures`. No suma scripts a `package.json`.
  - **Primer intento:** no se corrió porque la API del puerto 3000 estaba conectada a la base `manual`, y el recorrido escribe.
  - **Para correrla:** `DATABASE_URL=<la TEST_DATABASE_URL de apps/api/.env> pnpm dev:api`; después `pnpm --filter api seed:fixtures` y `pnpm --filter web test:e2e:integracion`, que corre también las demás de `e2e/integracion`.

## Verificación final

### T14 · Verificación de la feature

- **Qué hace:** corre todo, confirma que cada escenario tiene sus tests (tabla de la sección 5 del plan, marcando cada fila), hace las mutaciones de control y anota el resultado en este archivo.
- **Cubre:** spec sección 11 completa; plan secciones 4 y 5.
- **Archivos:** `specs/008-documentos-referencias-historicas/tasks.md`.
- **Verificación:**
  1. `pnpm --filter api lint`, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm --filter web lint`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web test` y Playwright: todo en verde (los errores que ya estaban en `HEAD` en archivos de otras parejas se anotan y no se tocan).
  2. **Swagger:** `/api/docs` muestra `owner`, `areas`, `lastReviewedBy` y `uploadedBy`, y los 400 nuevos.
  3. **Mutaciones de control**, una por vez, restaurando antes de la siguiente; cada una tiene que hacer fallar al menos un test:
     - validar `isActive` también del responsable que no cambia → **E15**;
     - no validar `isActive` de las áreas agregadas → **E12**, **E14**;
     - tratar como agregadas también las áreas que ya estaban → **E13**;
     - pedir siempre el revisor, aunque no haya `review` → **E5** (unitario de PD3);
     - copiar la referencia entera del directorio (con `role`) → R3;
     - en `OwnerField`, borrar también al responsable actual → **E19**;
     - pedir candidatos con todas las áreas elegidas → **E21**.
  4. **Tabla:** cada fila tiene sus tests, buscados por nombre, y pasan.
  5. **Archivos de la pareja A sin cambios:** `git diff --stat develop...HEAD -- apps/api/src/documents/ports apps/api/src/documents/adapters apps/api/src/areas apps/api/src/users apps/api/src/auth apps/web/lib/directory` vacío; y `grep -rn "getNames\|listAreas" apps/web/components/documents` solo encuentra los formularios (`listAreas` en la carga y el cambio de áreas).
  6. **Avisos a la pareja A** (PD13): que `getNames` y sus fixtures quedaron sin uso en Documentos (P8); los campos de R1 y R2 como contrato; y, si Q1 sigue abierta, la respuesta de `findByIds` con un ID que no existe. Los manda Matías.
- **Depende de:** T01 a T13
- **Commit:** `docs(specs): verificar referencias históricas en documentos`
- **Estado:** hecha el 04/11/2026, salvo el reemplazo de `findUsersByIds`: cuando `findByIds` esté en develop, reemplazarla (ver [la función temporal](#función-temporal-findusersbyids)) y volver a correr todo.
  1. **Todo en verde:**
     - API: `lint` y `tsc` sin errores; `test`, 85 suites y 1324 tests; `test:e2e` completo, 27 suites y 403 tests. Para correrlo hubo que resetear `manual_test`, con la confirmación del usuario.
     - Web: `lint` y `tsc` sin errores; `test`, 63 archivos y 775 tests; Playwright simulado (escritorio y celular), 108 tests; `e2e/integracion`, 13 tests.
     - **Arreglos en el Playwright simulado (`e2e/ciclo-de-vida.spec.ts`)**, que T09 y T11 no habían corrido:
       - E1: el handler simulado del PATCH de áreas ahora recalcula `owner` y `areas`, como la API real. Antes el detalle seguía mostrando "Ventas".
       - E6 (spec 003): pasa a probar el comportamiento de P5, F4 y E16. El responsable actual no se borra, el pedido sale sin `ownerId`, el 400 de la API queda en el campo y después se elige otro.
     - Ningún error de otras parejas.
  2. **Swagger** (`/api/docs-json`): `owner`, `areas`, `review.lastReviewedBy` y `uploadedBy` con `DocumentReferenceResponse` (solo `id`, `name` nullable e `isActive`). Los 400 nuevos están en la carga y en el cambio de áreas; los 503 mencionan el directorio.
  3. **Mutaciones de control:** las siete hacen fallar tests, y cada archivo se restauró byte por byte. Se aplicaron una por vez, con un script que copia el archivo, lo muta, corre los tests y lo restaura.
     - Validar `isActive` del responsable que no cambia: falla E15 (write-steps y lifecycle).
     - No validar las áreas agregadas: fallan E12 y E14.
     - Tratar como agregadas las que ya estaban: falla E13.
     - Pedir siempre el revisor: falla E5 (references y query).
     - Copiar la referencia entera: falla R3 (references y document.response).
     - En `OwnerField`, borrar al actual: fallan E19, P5, E16 y E21.
     - Pedir candidatos con todas las áreas: falla E21 (`ChangeAreasForm`).
  4. **Tabla de la sección 5 del plan:** cada fila tiene sus tests, con el nombre del escenario, en las capas que pide el plan, y pasan. E9 queda en las cinco pantallas web: `DocumentList`, `SearchResults`, `PendingReviewList`, `DocumentDetail` y `VersionHistory`.
  5. **Archivos de la pareja A sin cambios:** `git diff --stat develop...HEAD` y `git status` sobre esos caminos, vacíos. `getNames` y `listAreas` en `components/documents` solo aparecen en `ChangeAreasForm` y `UploadDocumentForm` (`listAreas`).
  6. **Avisos a la pareja A:** redactados abajo; los manda Matías.

## Avisos a la pareja A (PD13)

Para mandar (Matías):

1. **`getNames` quedó sin uso en Documentos (P8).** Las pantallas toman los nombres de la respuesta de la API. `usersDirectory.getNames` y sus fixtures ya no se llaman desde `components/documents`; si nadie más los usa, se pueden sacar.
2. **El contrato de las respuestas (R1, R2).** Todas las respuestas de documentos traen `owner`, `areas` (en el orden de `areaIds`), `review.lastReviewedBy` (solo cuando va `review`) y, en el historial, `uploadedBy`. Cada referencia trae solo `{ id, name, isActive }`; `name` es `null` si el directorio no la encontró. Los IDs siguen (`ownerId`, `areaIds`, `lastReviewedById`, `uploadedById`).
3. **`UsersDirectory.findByIds` (Q1).** Mientras no esté en develop, Documentos usa una función temporal: un `findById` por cada ID distinto. Cuando lo agreguen al puerto, a `PrismaUsersDirectory` y a `InMemoryUsersDirectory`, con el comportamiento acordado (sin repetidos, activos e inactivos, omitiendo los que no existen), avísennos para reemplazarla.

---

## Orden y dependencias

```
Se pueden hacer ya:
  T01 (suelta) · T02 (suelta) · T04 (suelta) · T08 (suelta) · T12 (suelta)
  T03 ◄─ T01, T02
  T09 ◄─ T08          (se mergea con T06 o después)
  T10 ◄─ T08          (se mergea con T06 o después)
  T11 ◄─ T08          (se mergea con T06 o después)

Con la función temporal findUsersByIds, hasta UsersDirectory.findByIds (pareja A):
  T05 ◄─ T04          (hecha)
  T06 ◄─ T05          (hecha)
  T07 ◄─ T06
  T13 ◄─ T06, T09, T11
  T14 ◄─ T01 a T13
```
