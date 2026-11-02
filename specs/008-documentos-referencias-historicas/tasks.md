# Tareas 008 · Referencias históricas en Documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (02/11/2026):** ninguna empezada. T01 a T07 son la API, T08 a T13 la web y T14, la [verificación](#t14--verificación-de-la-feature).

## Qué se puede hacer ya y qué espera a la pareja A

`UsersDirectory.findByIds(ids)` todavía no existe (spec, "Depende de"). Cada tarea dice si lo necesita:

| Tarea | ¿Se puede hacer ya? | Por qué |
| --- | --- | --- |
| T01 · Validar las áreas agregadas | **Sí** | Usa `AreasDirectory.findByIds`, que ya está |
| T02 · Validar el responsable nuevo inactivo | **Sí** | Usa `UsersDirectory.findById`, que ya trae `isActive` |
| T03 · Integración de las validaciones | **Sí** | Depende de T01 y T02 |
| T04 · Referencias: tipos y búsqueda en memoria | **Sí** | Es puro: no llama a los directorios |
| T05 · Buscar las referencias en lote | **No: espera `findByIds`** | Llama a `UsersDirectory.findByIds` |
| T06 · Respuestas con nombres | **No: espera `findByIds`** | Depende de T05 |
| T07 · Integración de las respuestas | **No: espera `findByIds`** | Depende de T06 |
| T08 · Web: tipos y formatos | **Sí** | Solo tipos y funciones puras |
| T09 · Web: pantallas de consulta | **Sí, con respuestas simuladas** | Se mergea con T06 o después (PD11) |
| T10 · Web: historial de versiones | **Sí, con respuestas simuladas** | Se mergea con T06 o después (PD11) |
| T11 · Web: `OwnerField` y cambio de áreas | **Sí, con respuestas simuladas** | Se mergea con T06 o después (PD11) |
| T12 · Web: mensajes de los errores nuevos | **Sí** | Se puede mergear después de T03 |
| T13 · Playwright contra la API real | **No: espera `findByIds`** | Necesita T06 y T09 a T11 |
| T14 · Verificación | **No: espera `findByIds`** | Necesita todas |

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
- **Estado:** pendiente.

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
- **Estado:** pendiente.

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
- **Estado:** pendiente.

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
- **Estado:** pendiente.

### T05 · Buscar las referencias en lote ⏳ espera `UsersDirectory.findByIds`

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
- **Estado:** bloqueada.

### T06 · Respuestas con nombres ⏳ espera `UsersDirectory.findByIds`

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
- **Estado:** bloqueada.

### T07 · Integración de las respuestas ⏳ espera `UsersDirectory.findByIds`

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
- **Estado:** bloqueada.

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
- **Estado:** pendiente.

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
- **Estado:** pendiente.

### T10 · Historial de versiones

- **Qué hace:** `VersionHistory` muestra quién subió cada versión con `formatPerson(version.uploadedBy)` y deja de llamar a `getNames`.
- **Cubre:** F1 a F3; P3; E7 en pantalla.
- **Archivos:** `components/documents/VersionHistory.tsx`, `tests/components/documents/VersionHistory.test.tsx`.
- **Verificación:** test primero: una versión subida por un ADMIN inactivo muestra "(inactivo)" (**E7**); `uploadedBy.name: null` → "—"; sin llamadas a `getNames`.
- **Depende de:** T08. **Se puede hacer ya**; se mergea con T06 o después (PD11).
- **Commit:** `feat(web): mostrar quién subió cada versión desde la respuesta`
- **Estado:** pendiente.

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
- **Estado:** pendiente.

### T12 · Mensajes de los errores nuevos

- **Qué hace:** `lib/api/error-messages.ts`: para la carga y el cambio de áreas, el 400 de R5 y el de R7 llevan en el campo los textos de la tabla 3.4 del plan; los demás 400 siguen con `FIELD_MESSAGES`.
- **Cubre:** F7; E11, E12 en pantalla; plan sección 3.4.
- **Archivos:** `lib/api/error-messages.ts` y su test en `tests/`.
- **Verificación:** test primero: `ownerId: el responsable está inactivo` → "El responsable está inactivo. Elegí otro." en `ownerId`; `areaIds: están inactivas las áreas …` → "Hay áreas inactivas entre las que agregaste. Sacalas para guardar." en `areaIds`; `ownerId: el responsable no comparte …` y `areaIds: no existen …` → los textos de hoy.
- **Depende de:** —. Se puede mergear cuando quiera; tiene sentido después de T03.
- **Commit:** `feat(web): explicar los rechazos por responsable o área inactivos`
- **Estado:** pendiente.

### T13 · Playwright contra la API real ⏳ espera `UsersDirectory.findByIds`

- **Qué hace:** `e2e/integracion/referencias.spec.ts`, con el recorrido de la sección 4.4 del plan.
- **Cubre:** E3, E4, E13, E15, E19 de punta a punta.
- **Archivos:** `apps/web/e2e/integracion/referencias.spec.ts` y, si hace falta, la siembra de `e2e/support`.
- **Verificación:** con la API y la base levantadas: el listado y el detalle muestran "(inactivo)" e "(inactiva)"; el ADMIN abre el cambio de áreas, ve al responsable inactivo elegido, agrega Operaciones y guarda; el detalle sigue con el mismo responsable y con Compras (inactiva) y Operaciones. Las demás de `e2e/integracion` pasan.
- **Depende de:** T06, T09, T11
- **Commit:** `test(web): recorrer los documentos con referencias inactivas`
- **Estado:** bloqueada.

## Verificación final

### T14 · Verificación de la feature ⏳ espera `UsersDirectory.findByIds`

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
- **Estado:** bloqueada.

---

## Orden y dependencias

```
Se pueden hacer ya:
  T01 (suelta) · T02 (suelta) · T04 (suelta) · T08 (suelta) · T12 (suelta)
  T03 ◄─ T01, T02
  T09 ◄─ T08          (se mergea con T06 o después)
  T10 ◄─ T08          (se mergea con T06 o después)
  T11 ◄─ T08          (se mergea con T06 o después)

Esperan UsersDirectory.findByIds (pareja A):
  T05 ◄─ T04, findByIds
  T06 ◄─ T05          (mejor después de T01 y T02)
  T07 ◄─ T06
  T13 ◄─ T06, T09, T11
  T14 ◄─ T01 a T13
```
