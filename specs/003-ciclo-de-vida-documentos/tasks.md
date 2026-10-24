# Tareas 003 · Ciclo de vida de los documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (24/10/2026):** T01 a T16 (todo el backend) **hechas**. T17 a T28 se pueden hacer ya; T29 está **bloqueada** por el worker de Guille (Q1); T30 es la verificación final.

Convenciones:

- Una tarea = un commit. Las rutas de backend son relativas a `apps/api/` y las de frontend a `apps/web/`, salvo que digan otra cosa.
- R1 a R14 (con R6b y R7b) son reglas de la spec; E1 a E13, sus escenarios (tabla al principio del plan); D1 a D10, las decisiones del plan (sección 9.1); Q1, la pregunta abierta con Guille (sección 9.2). Las reglas y decisiones de otros planes se citan con su plan ("R8b de la spec 001", "T19 del plan 002").
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- **"Avisar al equipo antes de mergear"** marca solo las tareas que tocan archivos que usan otras parejas: `schema.prisma`, `prisma/migrations`, `main.ts`, `layout.tsx`, `ci.yml`, el README y los `.env.example`. Los archivos de las specs 001 y 002 son del mismo responsable y no llevan la nota.
- **Comandos de Prisma:** `prisma migrate dev`, `prisma migrate deploy` y `prisma generate` los corre el usuario, no el agente. Cuando una tarea cambia `schema.prisma`, el agente hace el cambio, escribe el test y se detiene; el usuario crea la migración con `migrate dev --create-only`, se revisa el SQL juntos, y el usuario la aplica con `migrate deploy` (T01).
- Tests:
  - backend: `pnpm --filter api test <patrón>` y `pnpm --filter api test:e2e <patrón>`. Los de integración resetean `manual_test` antes de la suite, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA;
  - frontend: `pnpm --filter web test <patrón>`, `pnpm --filter web test:e2e <patrón>` y `pnpm --filter web test:e2e:integracion`.
- **Fragmentos de prueba:** mientras no exista el worker (Q1), los tests de integración simulan una versión procesada con `seedProcessedVersion`, que inserta fragmentos con SQL (T06).

---

## Backend

### T01 · Migración: índice de una sola versión CURRENT

- **Qué hace:**
  - **El agente:** activa `previewFeatures = ["partialIndexes"]` y declara en `schema.prisma` el índice `document_versions_one_current_idx` (`@@unique([documentId], where: { status: "CURRENT" })`); agrega un comentario sobre `Chunk` explicando el procedimiento de D1; escribe el test. Y **se detiene**: no corre ningún comando de Prisma.
  - **El usuario:** crea la migración `add_document_lifecycle` con `--create-only`, la revisa junto con el agente y la aplica con `migrate deploy`.
- **Cubre:** R8; D1, D2; plan secciones 2.1 a 2.3.
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<fecha>_add_document_lifecycle/migration.sql` (la crea el usuario), `test/documents/indexes.e2e-spec.ts`.
- **Verificación:**
  1. **Agente, test primero**, `test/documents/indexes.e2e-spec.ts`:
     - `pg_indexes` tiene `chunks_embedding_idx`, `chunks_content_fts_idx` y `document_versions_one_current_idx`;
     - insertar con SQL una segunda versión `CURRENT` del mismo documento falla con violación de unicidad.

     Sin la migración nueva falla, porque falta el índice. El agente cambia `schema.prisma`, escribe el test y **se detiene**.
  2. **Usuario:** antes de crear la migración, comprueba en la base de desarrollo que `SELECT document_id FROM document_versions WHERE status = 'CURRENT' GROUP BY document_id HAVING count(*) > 1` da 0 filas.
  3. **Usuario:** `pnpm --filter api exec prisma migrate dev --create-only --name add_document_lifecycle`.
  4. **Usuario y agente, juntos:** revisan `migration.sql`. Tiene que tener **solo** el `CREATE UNIQUE INDEX "document_versions_one_current_idx" … WHERE ("status" = 'CURRENT')`. Si aparece un `DROP INDEX` de `chunks_embedding_idx` o `chunks_content_fts_idx`, se borra esa línea antes de aplicarla (D1).
  5. **Usuario:** `pnpm --filter api exec prisma migrate deploy` y `pnpm --filter api exec prisma generate`.
  6. Con la migración aplicada, se corren `pnpm --filter api test` y `pnpm --filter api test:e2e`. Los de integración resetean `manual_test`, así que se piden con la confirmación del usuario. El test nuevo pasa y los demás siguen pasando.
- **Depende de:** —
- **Nota:** toca `schema.prisma` y las migraciones. **Avisar al equipo antes de mergear**: D1 y D2 afectan a todos los que creen migraciones.
- **Commit:** `feat(db): agregar el índice de una sola versión vigente por documento`

### T02 · Pasos compartidos de escritura

- **Qué hace:** mueve de `DocumentUploadService` a una clase nueva, `DocumentWriteSteps`, sin cambiar su comportamiento:
  - la validación de la fecha de revisión, de las áreas, del responsable y de duplicados;
  - el `put` con compensación (borrar el archivo si la transacción falla);
  - la auditoría de fallos.

  `DocumentUploadService` pasa a usarla.
- **Cubre:** plan sección 4 ("Reutilización sin duplicar código"); base de R3, R4, R6, R7b y R9.
- **Archivos:** `src/documents/document-write-steps.ts`, `src/documents/document-write-steps.spec.ts`, `src/documents/document-upload.service.ts`, `src/documents/documents.module.ts`.
- **Verificación:** es una reorganización, así que la red de seguridad son los tests que ya existen:
  - `document-upload.service.spec.ts` y `test/documents/upload.e2e-spec.ts` pasan **sin cambios**;
  - `document-write-steps.spec.ts` prueba cada paso suelto, con los casos que hoy prueba la carga: fecha de hoy, área inexistente, responsable sin acceso, duplicado, y `delete` cuando falla la transacción.
- **Depende de:** —
- **Commit:** `refactor(documents): extraer los pasos compartidos de escritura`

### T03 · `reason` en el 409 de la carga y `archivedAt` en la respuesta

- **Qué hace:**
  - el 409 de duplicado de la carga suma `reason: "DUPLICATE"`, sin quitar `existingDocumentId`;
  - `DocumentResponse` y `DocumentSummary` suman `archivedAt: string | null`.
- **Cubre:** D7; plan sección 1.6.
- **Archivos:** `src/documents/document-write-steps.ts`, `src/documents/dto/document.response.ts`, `src/documents/documents.repository.ts` (`archivedAt` en `DocumentRecord`), `src/documents/prisma-documents.repository.ts` (lo lee), y sus tests.
- **Verificación:** test primero:
  - `document-write-steps.spec.ts`: el 409 de duplicado tiene `reason: "DUPLICATE"` y `existingDocumentId`;
  - `document.response.spec.ts`: `archivedAt` es `null` en un documento activo y el texto ISO en uno archivado;
  - `test/documents/upload.e2e-spec.ts`: el 409 real trae `reason`.
- **Depende de:** T02
- **Commit:** `feat(documents): agregar el motivo del 409 y la fecha de archivo`

### T04 · Auditoría y mensajes de las operaciones nuevas

- **Qué hace:**
  - `AuditAction` suma `DOCUMENT_AREAS_CHANGE`, `DOCUMENT_VERSION_UPLOAD` y `DOCUMENT_ARCHIVE`;
  - `toHttpException` acepta las operaciones `'cambio de áreas'`, `'versión nueva'` y `'archivo'`.
- **Cubre:** R13; D9; plan sección 1.6.
- **Archivos:** `src/documents/ports/audit-log.ts`, `src/documents/adapters/logger-audit-log.spec.ts`, `src/documents/http-errors.ts` y su test.
- **Verificación:** test primero:
  - `logger-audit-log.spec.ts` registra las tres acciones nuevas con `SUCCESS` y `FAILURE`;
  - el test de `http-errors` comprueba el mensaje del 503 para cada operación nueva.
- **Depende de:** —
- **Commit:** `feat(documents): auditar los cambios del ciclo de vida`

### T05 · Contrato del repositorio para el ciclo de vida

- **Qué hace:** suma al puerto `DocumentsRepository`:
  - los métodos `lockForUpdate`, `replaceAreas`, `addVersion`, `archive`, `listVersions` y `findVersion`;
  - los tipos `VersionHistoryRecord` y `NewVersion`;
  - el error `ConcurrentVersionError`.

  `PrismaDocumentsRepository` los declara lanzando "no implementado", así el proyecto compila mientras llegan T06 a T08.
- **Cubre:** plan sección 4 ("Puerto del repositorio"); D10 del plan 001.
- **Archivos:** `src/documents/documents.repository.ts`, `src/documents/prisma-documents.repository.ts`.
- **Verificación:** `pnpm --filter api build` compila, y `pnpm --filter api test` y `pnpm --filter api test:e2e documents.repository` siguen pasando.
- **Depende de:** T03
- **Commit:** `feat(documents): definir el contrato del repositorio para el ciclo de vida`

### T06 · Repositorio: bloqueo y cambio de áreas

- **Qué hace:** implementa en `PrismaDocumentsRepository`:
  - `lockForUpdate`: bloquea el documento y lo devuelve con sus áreas y su versión vigente (con su `checksum`, que T11 usa para R6b). Va en **dos sentencias** dentro de la transacción:
    1. `tx.$queryRaw` con `SELECT id FROM documents WHERE id = ${id}::uuid FOR UPDATE`; si no devuelve filas, `null`;
    2. **después**, `tx.document.findUnique({ where: { id }, include: documentInclude })` y `toRecord`.

    Con `READ COMMITTED`, cada sentencia ve lo confirmado cuando empieza. Si fueran una sola (`FOR UPDATE` con un JOIN a `document_versions`), una transacción que esperó el bloqueo podría leer todavía la versión vigente anterior y dejar pasar un archivo idéntico (R6b) o crear una versión sobre la equivocada (R8). En dos sentencias, la lectura empieza cuando el bloqueo ya se obtuvo y ve lo que confirmó la otra transacción. **Esto va escrito en un comentario en el código**, para que nadie lo junte en una sola consulta.
  - `replaceAreas`: reemplaza `document_areas`, actualiza `ownerId` si vino, y hace `chunk.updateMany` con las áreas nuevas en **todos** los fragmentos del documento.

  Además agrega la ayuda `seedProcessedVersion`.
- **Cubre:** R5, R6b y R8 (la lectura bajo el bloqueo); plan secciones 3.2 y 3.3.
- **Archivos:** `src/documents/prisma-documents.repository.ts`, `test/documents/helpers.ts` (`seedProcessedVersion`: la versión pasa a `READY` y se insertan fragmentos activos con sus áreas), `test/documents/lifecycle.repository.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/lifecycle.repository.e2e-spec.ts`:
  - `replaceAreas` deja `document_areas` con las áreas nuevas, y los fragmentos de la versión vigente **y** de una `REPLACED` quedan con `area_ids` nuevas;
  - con `ownerId`, el documento queda con el nuevo;
  - `lockForUpdate` de un id que no existe da `null`;
  - mientras una transacción tiene el bloqueo, otra que pide el mismo documento espera hasta el commit (dos transacciones con `Promise.all` y marcas de tiempo);
  - **la lectura después del bloqueo ve lo confirmado por la otra transacción** (transacciones A y B):
    1. A abre una transacción, hace `lockForUpdate` y, con SQL dentro de esa misma transacción, pasa la v1 a `REPLACED` y crea una v2 `CURRENT` con otro checksum. `addVersion` llega recién en T07, por eso se hace a mano. Todavía no confirma;
    2. B abre su transacción y pide `lockForUpdate` del mismo documento: queda esperando;
    3. A confirma;
    4. B obtiene el bloqueo y el registro que recibe tiene `currentVersion.versionNumber = 2` y el checksum de la v2, no los de la v1.

    Antes del cambio, con una implementación en una sola sentencia, este test puede ver la v1. Es el que demuestra que el bloqueo protege R6b y R8.
- **Depende de:** T01, T05
- **Commit:** `feat(documents): cambiar las áreas de un documento y de sus fragmentos`

### T07 · Repositorio: versión nueva

- **Qué hace:** implementa `addVersion`:
  - la `CURRENT` pasa a `REPLACED` y sus fragmentos a `is_active = false`;
  - se crea la versión `máximo + 1` en `CURRENT` y `PENDING`;
  - si vino `reviewDate`, se actualiza el documento.

  Además traduce `P2002` sobre `document_versions_one_current_idx` o sobre `(document_id, version_number)` a `ConcurrentVersionError`. Los demás `P2002` pasan sin traducir.
- **Cubre:** R7, R7b, R8; D3; plan secciones 3.2, 4 y 5.
- **Archivos:** `src/documents/prisma-documents.repository.ts`, `test/documents/lifecycle.repository.e2e-spec.ts`.
- **Verificación:** test primero:
  - después de `addVersion`: v1 `REPLACED` con fragmentos inactivos, v2 `CURRENT` y `PENDING` con número 2;
  - con `reviewDate`, el documento la toma; sin ella, no cambia;
  - **E10 a nivel repositorio:** dos transacciones simultáneas con `lockForUpdate` + `addVersion` terminan con versiones 2 y 3 y **una sola** `CURRENT`;
  - una inserción que choca con el índice (sin bloqueo, armada a propósito) rechaza con `ConcurrentVersionError`;
  - una violación de unicidad de otra tabla sigue sin traducirse (el test de la spec 001 sigue pasando).
- **Depende de:** T06
- **Commit:** `feat(documents): reemplazar la versión vigente de un documento`

### T08 · Repositorio: archivar e historial

- **Qué hace:** implementa:
  - `archive`: `ARCHIVED`, `archivedAt` y todos los fragmentos inactivos;
  - `listVersions`: de la más nueva a la más vieja, sin `storageKey` ni `checksum` hacia afuera;
  - `findVersion`: una versión solo si es de ese documento.
- **Cubre:** R10, R12; D6, D10.
- **Archivos:** `src/documents/prisma-documents.repository.ts`, `test/documents/lifecycle.repository.e2e-spec.ts`.
- **Verificación:** test primero:
  - `archive` deja `status = ARCHIVED`, `archived_at` y **todos** los fragmentos con `is_active = false`;
  - `listVersions` con tres versiones devuelve 3, 2, 1;
  - `findVersion` con la versión de **otro** documento devuelve `null`;
  - los objetos del almacenamiento no se tocan (D6).
- **Depende de:** T06
- **Commit:** `feat(documents): archivar documentos y listar sus versiones`

### T09 · DTOs de entrada

- **Qué hace:** crea dos DTOs:
  - `ChangeAreasDto`: `areaIds` UUID, al menos uno, sin repetidos; `ownerId` UUID opcional;
  - `CreateVersionDto`: `reviewDate` `YYYY-MM-DD` opcional.

  Usan las mismas transformaciones que `CreateDocumentDto`.
- **Cubre:** R3, R4, R7b.
- **Archivos:** `src/documents/dto/change-areas.dto.ts`, `src/documents/dto/change-areas.dto.spec.ts`, `src/documents/dto/create-version.dto.ts`, `src/documents/dto/create-version.dto.spec.ts`.
- **Verificación:** test primero, en los dos `*.spec.ts`:
  - `areaIds` vacío, un solo valor como texto (se convierte en arreglo), repetidos (se eliminan), mal formados;
  - `ownerId` ausente y mal formado;
  - `reviewDate` ausente, `2027-3-1` y `2027-02-30`;
  - campos de más (rechazados por `forbidNonWhitelisted`).
- **Depende de:** —
- **Commit:** `feat(documents): validar la entrada del cambio de áreas y de la versión nueva`

### T10 · Servicio: cambiar áreas

- **Qué hace:** crea `DocumentLifecycleService.changeAreas` con este orden:
  1. leer el documento (404) y comprobar el estado (409 archivado);
  2. si las áreas no cambian, responder sin escribir;
  3. validar las áreas y el responsable que va a quedar;
  4. abrir la transacción: bloqueo, nueva lectura del estado, `replaceAreas` y auditoría.

  Además: `auditFailure` recibe el `documentId` opcional, y las acciones sobre un documento existente lo registran también en las fallas (R13). Es el primer servicio que lo usa, así que el cambio en `DocumentWriteSteps` va en esta tarea; la carga de la spec 001 lo sigue llamando sin `documentId`.
- **Cubre:** R2, R3, R4, R5, R11, R13; D4; P2.
- **Archivos:** `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`, `src/documents/documents.module.ts`, `src/documents/document-write-steps.ts` y `src/documents/document-write-steps.spec.ts` (`documentId` opcional en `auditFailure`).
- **Verificación:** test primero, con los puertos simulados con `jest.fn()`:
  - 404 si no existe;
  - 409 `ARCHIVED`, también si se archiva entre la primera lectura y el bloqueo;
  - 400 si un área no existe;
  - **E6:** el responsable pierde el acceso → 400 `ownerId: …` y no se abre la transacción;
  - con un `ownerId` nuevo válido → pasa y se le pasa al repositorio;
  - **D4:** las mismas áreas → devuelve el documento sin llamar a `replaceAreas` ni auditar;
  - auditoría `SUCCESS` dentro de la transacción y `FAILURE` con el código **y el `documentId`** si falla (por ejemplo, en el 409 de archivado y en el 400 de E6);
  - `document-write-steps.spec.ts`: `auditFailure` con `documentId` lo registra; sin él (la carga) registra lo mismo que antes;
  - si la base no responde → 503.
- **Depende de:** T02, T04, T06, T09
- **Commit:** `feat(documents): cambiar las áreas de un documento`

### T11 · Servicio: versión nueva

- **Qué hace:** `DocumentLifecycleService.addVersion`, en el orden de la tabla de la sección 4 del plan:
  - inspección del archivo, fecha opcional, lectura y estado;
  - duplicados (`IDENTICAL_TO_CURRENT` o `DUPLICATE`);
  - `put`;
  - transacción con bloqueo y nueva lectura, `addVersion`, auditoría y encolado al final;
  - `delete` del archivo nuevo si algo falla.

  Además: `auditFailure` recibe el `documentId` opcional, y las acciones sobre un documento existente lo registran también en las fallas (R13).
- **Cubre:** R2, R6, R6b, R7, R7b, R8, R9, R11, R13; D3, D6, D7; R8b de la spec 001.
- **Archivos:** `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`, `src/documents/document-write-steps.ts` (exporta `duplicateDocumentConflict`, el cuerpo del 409 `DUPLICATE` que comparten la carga y la versión nueva).
- **Verificación:** test primero:
  - orden de las llamadas en la carga correcta, y `enqueue` con el `versionId` nuevo como último paso de la transacción;
  - **E3:** idéntico a la vigente → 409 `IDENTICAL_TO_CURRENT` sin `put`;
  - idéntico a otro documento → 409 `DUPLICATE` con `existingDocumentId`;
  - **E4:** `reviewDate` futura se pasa al repositorio; ausente no; hoy → 400;
  - **E5:** falla la cola → 503, rollback y `delete` del archivo nuevo;
  - falla el almacenamiento → 503 sin transacción;
  - archivado bajo el bloqueo → 409 y `delete`;
  - la vigente ya tiene ese checksum bajo el bloqueo → 409 y `delete`;
  - `ConcurrentVersionError` → 409 `CONCURRENT_VERSION` y `delete`;
  - el archivo de la versión anterior **nunca** se borra (D6);
  - auditoría `SUCCESS`, y `FAILURE` con el código **y el `documentId`** (por ejemplo, en E3 y en E5).
- **Depende de:** T07, T10
- **Commit:** `feat(documents): subir una versión nueva de un documento`

### T12 · Servicio: archivar

- **Qué hace:** `DocumentLifecycleService.archive`: lectura (404), estado (409), transacción con bloqueo y nueva lectura, `archive` y auditoría.

  Además: `auditFailure` recibe el `documentId` opcional, y las acciones sobre un documento existente lo registran también en las fallas (R13).
- **Cubre:** R2, R10, R11, R13; D5.
- **Archivos:** `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`.
- **Verificación:** test primero:
  - archiva y audita `DOCUMENT_ARCHIVE` con `SUCCESS`;
  - 404 si no existe;
  - 409 `ARCHIVED` si ya está archivado, también si se archivó entre la lectura y el bloqueo;
  - si la base no responde → 503 y auditoría `FAILURE` con el código y el `documentId`;
  - el 409 de "ya archivado" también registra `FAILURE` con el `documentId`.
- **Depende de:** T08, T10
- **Commit:** `feat(documents): archivar un documento`

### T13 · Servicio: historial y descarga de una versión

- **Qué hace:** `DocumentQueryService` suma:
  - `listVersions(id)`: 404 si no existe;
  - `getVersionDownloadUrl(id, versionId)`: 404 si la versión no es de ese documento. El enlace firmado de 5 minutos se genera **después** de comprobarlo.

  Los dos funcionan con documentos archivados.
- **Cubre:** R2, R12; D10.
- **Archivos:** `src/documents/document-query.service.ts`, `src/documents/document-query.service.spec.ts`, `src/documents/dto/document.response.ts` (`VersionHistoryItem` y `toVersionHistoryItem`, campo por campo, para que `storageKey` y `checksum` no salgan).
- **Verificación:** test primero:
  - `listVersions` devuelve las versiones en el orden del repositorio;
  - 404 si el documento no existe;
  - una versión de otro documento → 404 y **nunca** se llama a `getDownloadUrl`;
  - un documento archivado → funciona.
- **Depende de:** T08
- **Commit:** `feat(documents): consultar el historial de versiones`

### T14 · Endpoints: cambiar áreas y archivar

- **Qué hace:** suma a `DocumentsController`:
  - `PATCH /documents/:id/areas`;
  - `POST /documents/:id/archive`.

  Los dos con `@Roles('ADMIN')`, `ParseUUIDPipe` y Swagger (`@ApiResponse` por cada código).
- **Cubre:** R1, R2, R3, R4, R5, R10, R11; D5; E1, E6, E7, y parte de E8 y E9.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/lifecycle.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/lifecycle.e2e-spec.ts`, con Supertest y la base de tests:
  - **E1:** 200; `document_areas` = Operaciones y los fragmentos de todas las versiones con `{Operaciones}`; el EMPLOYEE de Ventas recibe 404 en el detalle y no lo ve en el listado; el de Operaciones sí;
  - **E6:** 400 `ownerId: …`; `document_areas` sigue en Ventas y los fragmentos no cambiaron;
  - **E7:** 200 `ARCHIVED` con `archivedAt`; fragmentos inactivos; EMPLOYEE → 404; ADMIN → 200 `ARCHIVED`;
  - **E8 (parte):** EMPLOYEE → 403 en los dos endpoints, y nada cambió;
  - **E9 (parte):** sobre uno archivado, cambiar áreas y volver a archivar → 409;
  - sin sesión → 401; id mal formado → 400; inexistente → 404.
- **Depende de:** T10, T12
- **Commit:** `feat(documents): exponer el cambio de áreas y el archivo`

### T15 · Endpoint: versión nueva

- **Qué hace:** suma `POST /documents/:id/versions`, con `@Roles('ADMIN')`, `FileInterceptor('file')` con los mismos límites de la carga (10 MB, `defParamCharset: 'utf8'`) y Swagger (`@ApiConsumes('multipart/form-data')`).
- **Cubre:** R1, R2, R6, R6b, R7, R7b, R8, R9, R11; D3, D7; E2, E3, E4, E5, E10, y parte de E8 y E9.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/lifecycle.e2e-spec.ts`.
- **Verificación:** test primero, en `test/documents/lifecycle.e2e-spec.ts`:
  - **E2:** 201; v1 `REPLACED` con fragmentos inactivos; v2 `CURRENT` y `PENDING`; `FakeProcessingQueue.enqueued` = [id de v2]; el objeto de v2 en `InMemoryFileStorage` y el de v1 sigue;
  - **E3:** 409 `IDENTICAL_TO_CURRENT`; una sola versión y ningún objeto nuevo;
  - **E4:** con `reviewDate` futura, el documento la toma; sin ella, queda la anterior;
  - **E5:** `failNext()` → 503; v1 sigue `CURRENT` **con sus fragmentos activos**; no hay v2 ni objeto nuevo;
  - **E10:** dos `POST` simultáneos (`Promise.all`) → los dos 201, versiones 2 y 3, una sola `CURRENT`;
  - archivar y subir versión en paralelo: termina `ARCHIVED`, con una sola `CURRENT` y todos los fragmentos inactivos;
  - **E8 y E9 (parte):** EMPLOYEE → 403; sobre uno archivado → 409 `ARCHIVED`;
  - además: 413 con 11 MB, 415 con extensión falsa, 409 `DUPLICATE` con un archivo de otro documento.
- **Depende de:** T11, T14
- **Commit:** `feat(documents): exponer la carga de versiones nuevas`

### T16 · Endpoints: historial y descarga de una versión

- **Qué hace:** suma `GET /documents/:id/versions` y `GET /documents/:id/versions/:versionId/download`, con `@Roles('ADMIN')`, dos `ParseUUIDPipe` y Swagger.
- **Cubre:** R1, R2, R12; D10; E12, E13, y la parte del historial de E8.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/lifecycle.e2e-spec.ts`.
- **Verificación:** test primero:
  - **E13:** tres versiones → 200 en orden 3, 2, 1, con su estado y sin `storageKey` ni `checksum`; la descarga de cada una → 200 con `url` y `expiresAt`;
  - **E12:** EMPLOYEE → 403 en los dos endpoints, aunque el documento no exista;
  - una versión de otro documento → 404;
  - un documento archivado → el historial funciona para el ADMIN (D10).
- **Depende de:** T13, T15
- **Commit:** `feat(documents): exponer el historial de versiones`

## Frontend

### T17 · Llamadas a la API del ciclo de vida

- **Qué hace:**
  - `lib/api/documents.ts` suma `changeAreas`, `uploadVersion` (multipart, `reviewDate` solo si viene), `archiveDocument`, `listVersions` y `getVersionDownloadUrl`, con sus tipos (`VersionHistoryItem`, `archivedAt`);
  - `ApiError` suma `reason?: string`, leído del cuerpo del error.
- **Cubre:** plan sección 6.6; D7.
- **Archivos:** `lib/api/documents.ts`, `lib/api/api-error.ts`, `lib/api/client.ts`, `lib/api/index.ts`, `tests/lib/api/documents.test.ts`, `tests/lib/api/client.test.ts`.
- **Verificación:** test primero:
  - cada llamada arma su URL y su método;
  - `uploadVersion` manda `file` y `reviewDate` solo si tiene valor;
  - un 409 con `reason: "IDENTICAL_TO_CURRENT"` llega a `ApiError.reason`;
  - los ids se codifican.
- **Depende de:** T16 (contrato de la API)
- **Commit:** `feat(documents): agregar las llamadas del ciclo de vida a la web`

### T18 · Mensajes de los errores del ciclo de vida

- **Qué hace:** `describeApiError` suma los contextos `'areas'`, `'version'` y `'archive'`, y un mensaje por cada `reason` del 409 (tabla de la sección 6.3 del plan).
- **Cubre:** R6b, R11, R8; D7; plan secciones 6.2 a 6.4.
- **Archivos:** `lib/api/error-messages.ts`, `tests/lib/api/error-messages.test.ts`.
- **Verificación:** test primero:
  - `IDENTICAL_TO_CURRENT`, `DUPLICATE` (con `existingDocumentId`), `ARCHIVED` y `CONCURRENT_VERSION`, cada uno con su mensaje;
  - 400 `areaIds` y `ownerId` en el contexto `'areas'` asignados a su campo;
  - nunca el texto técnico en inglés;
  - los contextos de la spec 002 no cambian.
- **Depende de:** T17
- **Commit:** `feat(documents): explicar los errores del ciclo de vida`

### T19 · Campo de fecha de revisión reutilizable

- **Qué hace:** saca la fecha de revisión de `UploadDocumentForm` a un componente propio, `ReviewDateField`: etiqueta, `min` en mañana en Buenos Aires y su error, con un modo **opcional** para la versión nueva. `UploadDocumentForm` lo usa en modo obligatorio.
- **Cubre:** R7b; plan sección 6.3.
- **Archivos:** `components/documents/ReviewDateField.tsx`, `components/documents/UploadDocumentForm.tsx`, `tests/components/documents/ReviewDateField.test.tsx`.
- **Verificación:**
  - test primero, `ReviewDateField.test.tsx`: el `min` en mañana; en modo opcional la etiqueta dice "(opcional)" y muestra la fecha actual como ayuda; el error queda asociado al campo;
  - `UploadDocumentForm.test.tsx` y `e2e/carga.spec.ts` del plan 002 pasan **sin cambios**.
- **Depende de:** —
- **Commit:** `refactor(documents): extraer el campo de fecha de revisión`

### T20 · Panel: cambiar áreas

- **Qué hace:** crea `ChangeAreasForm`.
  - Reutiliza `AreasField`, con las áreas actuales marcadas, y `OwnerField`, con el responsable actual.
  - Valida al menos un área y un responsable.
  - Envía `ownerId` solo si cambió.
  - Ante un error no pierde nada.
- **Cubre:** R3, R4, R5; P2; plan sección 6.2; E1, E6.
- **Archivos:** `components/documents/ChangeAreasForm.tsx`, `tests/components/documents/ChangeAreasForm.test.tsx`.
- **Verificación:** test primero, con `vi.mock` de `@/lib/api` y los directorios simulados reales:
  - **E1:** desmarca Ventas, marca Operaciones y envía `areaIds = [Operaciones]` con el responsable que corresponda;
  - **E6:** al pasar a Operaciones, el responsable de Ventas se borra con el aviso "…Elegí otro" y no se puede enviar sin elegir otro;
  - con el mismo responsable válido, no se manda `ownerId`;
  - 400 `ownerId` junto al responsable; 409 `ARCHIVED` con su mensaje; 503 sin perder lo elegido;
  - al terminar bien, avisa al detalle (`onDone`).
- **Depende de:** T18
- **Commit:** `feat(documents): agregar el panel para cambiar las áreas`

### T21 · Panel: subir versión nueva

- **Qué hace:** crea `NewVersionForm`, con `FileField` y `ReviewDateField` opcional.
  - Valida el archivo al elegirlo y la fecha solo si se completó.
  - Evita el doble envío.
  - Muestra cada 409 según su `reason` y conserva el archivo ante cualquier error.
- **Cubre:** R6, R6b, R7, R7b, R9; D7; plan sección 6.3; E2, E3, E4, E5.
- **Archivos:** `components/documents/NewVersionForm.tsx`, `tests/components/documents/NewVersionForm.test.tsx`.
- **Verificación:** test primero:
  - **E2:** con un PDF válido llama a `uploadVersion` y avisa al detalle;
  - **E4:** con fecha la manda; sin fecha no;
  - **E3:** 409 `IDENTICAL_TO_CURRENT` → "Este archivo es igual a la versión vigente." y el archivo sigue elegido;
  - 409 `DUPLICATE` → el enlace al documento existente;
  - **E5:** 503 → "Probá de nuevo en unos minutos" y el mismo archivo sigue en el campo;
  - un `.docx` muestra el error al elegirlo y no se envía;
  - dos envíos juntos → una sola llamada (F5 del plan 002).
- **Depende de:** T18, T19
- **Commit:** `feat(documents): agregar el panel para subir una versión nueva`

### T22 · Confirmación para archivar

- **Qué hace:** crea `ArchiveDialog`:
  - un `<dialog>` nativo con el texto de R14;
  - "Cancelar", con el foco al abrir, y "Archivar", en rojo, deshabilitado con "Archivando…" mientras espera;
  - el error se muestra dentro del diálogo, que queda abierto.
- **Cubre:** R10, R14; P6; plan sección 6.4; E7, E11.
- **Archivos:** `components/documents/ArchiveDialog.tsx`, `tests/components/documents/ArchiveDialog.test.tsx`.
- **Verificación:** test primero:
  - el texto exacto de R14;
  - el foco empieza en "Cancelar";
  - **E11:** "Cancelar" cierra sin ningún pedido a la API;
  - **E7:** "Archivar" llama a `archiveDocument` y avisa al detalle;
  - mientras espera, deshabilitado con "Archivando…";
  - 409 o 503 → el mensaje dentro del diálogo, que sigue abierto.

  jsdom no implementa `showModal()`: el test lo simula con un stub de `HTMLDialogElement.prototype`. El comportamiento real del navegador lo comprueba T26.
- **Depende de:** T18
- **Commit:** `feat(documents): confirmar antes de archivar un documento`

### T23 · Historial de versiones y descarga por versión

- **Qué hace:**
  - `DownloadButton` suma la prop `versionId`; con ella pide `getVersionDownloadUrl`, también en cada clic;
  - crea `VersionHistory`: una sección "Historial de versiones" que empieza cerrada y pide el historial recién al abrirla. Muestra una fila por versión (número, archivo, fecha, quién la subió, estado, procesamiento y "Descargar"), y en el celular cada fila es una tarjeta.
- **Cubre:** R12; D10; plan sección 6.5; E13; F8 del plan 002.
- **Archivos:** `components/documents/DownloadButton.tsx`, `components/documents/VersionHistory.tsx`, `tests/components/documents/DownloadButton.test.tsx`, `tests/components/documents/VersionHistory.test.tsx`.
- **Verificación:** test primero:
  - **E13:** tres versiones en orden 3, 2, 1, con "Vigente" o "Reemplazada", su procesamiento y el nombre de quién la subió;
  - cerrada no pide nada; al abrirla, un pedido;
  - "Descargar" de la versión 2 pide `getVersionDownloadUrl(id, v2)` en cada clic;
  - sin `versionId`, `DownloadButton` sigue usando la descarga de la vigente (los tests del plan 002 pasan sin cambios);
  - error con "Reintentar".
- **Depende de:** T17
- **Commit:** `feat(documents): mostrar el historial de versiones`

### T24 · Acciones en el detalle

- **Qué hace:** `DocumentDetail` suma, solo para el ADMIN:
  - con el documento `ACTIVE`, la fila "Cambiar áreas", "Subir versión nueva" y "Archivar", junto a "Descargar". Los paneles se abren de a uno, y "Archivar" abre el diálogo;
  - con el documento `ARCHIVED`, "Archivado desde dd/mm/aaaa" y ninguna acción;
  - en los dos casos, el historial.

  Después de una acción correcta: vuelve a pedir el detalle, cierra el panel y muestra un aviso con `role="status"`. Los demás roles no ven nada de esto ni hacen esos pedidos.
- **Cubre:** R1, R10, R11, R12; D8; plan sección 6.1; E7, E8, E9, E12.
- **Archivos:** `components/documents/DocumentDetail.tsx`, `tests/components/documents/DocumentDetail.test.tsx`.
- **Verificación:** test primero:
  - el ADMIN con un documento activo ve las tres acciones y el historial;
  - **E9:** con uno archivado, "Archivado desde…", sin acciones y con historial;
  - **E8 y E12:** el EMPLOYEE no ve acciones ni historial, y no se pide `/versions`;
  - abrir "Cambiar áreas" cierra "Subir versión nueva" si estaba abierto;
  - **E7:** después de archivar, el detalle se vuelve a pedir y aparece "Documento archivado";
  - los tests del plan 002 siguen pasando.
- **Depende de:** T20, T21, T22, T23
- **Commit:** `feat(documents): agregar las acciones del ciclo de vida al detalle`

## Tests en el navegador (Playwright)

### T25 · API simulada para el ciclo de vida

- **Qué hace:** `mockApi` suma los handlers `changeAreas`, `uploadVersion`, `archive`, `versions` y `versionDownload`, y datos de ejemplo para el historial (`versionHistory`).
- **Cubre:** plan sección 7.4.
- **Archivos:** `e2e/support/mock-api.ts`, `e2e/smoke.spec.ts`.
- **Verificación:**
  - un caso nuevo en `e2e/smoke.spec.ts`: con `versions` simulado, el ADMIN abre el historial en el detalle y ve las versiones, sin pedidos sin atender (`unhandled` vacío);
  - `pnpm --filter web test:e2e` sigue pasando completo.
- **Depende de:** T24
- **Commit:** `test(web): simular la API del ciclo de vida`

### T26 · Escenarios de cambios en el navegador

- **Qué hace:** cubre en Playwright, con la API simulada, en escritorio y celular, los escenarios donde el ADMIN cambia algo.
- **Cubre:** E1, E2, E3, E4, E5, E6, E7, E11; R14.
- **Archivos:** `e2e/ciclo-de-vida.spec.ts`.
- **Verificación:** se escriben los tests y pasan en los dos proyectos. Si pasan de entrada, se rompe a propósito una regla por escenario, de a una, para comprobar que su test falla, y se restaura.
  - **E1:** cambia a Operaciones; el `PATCH` lleva `areaIds = [Operaciones]`; aparece "Áreas actualizadas" y el detalle muestra Operaciones;
  - **E2:** sube un PDF; el pedido es multipart con `file`; el detalle muestra la versión 2 "Pendiente";
  - **E3:** 409 `IDENTICAL_TO_CURRENT` → su mensaje, con el archivo todavía elegido;
  - **E4:** con fecha, el pedido lleva `reviewDate`;
  - **E5:** 503 → mensaje y archivo conservado; un segundo envío funciona;
  - **E6:** al pasar a Operaciones, el aviso "…Elegí otro" y el envío bloqueado hasta elegir;
  - **E7:** "Archivar" → diálogo con el texto de R14 → "Archivar" → "Archivado desde…" y sin acciones;
  - **E11:** "Archivar" → "Cancelar" → ningún `POST …/archive` y el documento sigue con sus acciones.
- **Depende de:** T25
- **Commit:** `test(documents): cubrir los cambios del ciclo de vida en el navegador`

### T27 · Escenarios de permisos e historial en el navegador

- **Qué hace:** cubre en Playwright, con la API simulada, en escritorio y celular, lo que ve cada rol.
- **Cubre:** E8, E9, E12, E13; R12.
- **Archivos:** `e2e/ciclo-de-vida.spec.ts`.
- **Verificación:** se escriben los tests y pasan en los dos proyectos; si pasan de entrada, una regla rota por escenario, como en T26.
  - **E8:** el EMPLOYEE no ve "Cambiar áreas", "Subir versión nueva" ni "Archivar";
  - **E9:** un documento archivado: el ADMIN ve "Archivado desde…", sin acciones;
  - **E12:** el EMPLOYEE no ve el historial y no se hace ningún pedido a `/versions`;
  - **E13:** el ADMIN abre el historial: tres versiones en orden; "Descargar" de la versión 2 pide su enlace y el navegador recibe la descarga, como E11 del plan 002.

  E10 no se reproduce en el navegador: lo cubren T07 y T15.
- **Depende de:** T25
- **Commit:** `test(documents): cubrir permisos e historial en el navegador`

### T28 · Integración con la API real

- **Qué hace:** pruebas de Playwright contra la API real (Docker, API en el puerto 3000, base de desarrollo), con archivos de contenido distinto en cada corrida y títulos `[e2e] …`.
- **Cubre:** E1, E2, E7 de punta a punta; R5 y R10 vistos desde la pantalla.
- **Archivos:** `e2e/integracion/ciclo-de-vida.spec.ts`.
- **Verificación:** con Docker, `pnpm dev:api` y `pnpm --filter web test:e2e:integracion`:
  - **E1:** el ADMIN cambia un documento de Ventas a Operaciones desde el panel; la EMPLOYEE de Ventas deja de verlo y el EMPLOYEE de Operaciones lo ve;
  - **E2:** el ADMIN sube la versión 2 desde el panel y la ve `CURRENT` en el historial, con la 1 "Reemplazada";
  - **E7:** el ADMIN archiva con confirmación; la EMPLOYEE de Ventas recibe "No se encontró el documento.".
- **Depende de:** T26, T27
- **Commit:** `test(documents): probar el ciclo de vida contra la API real`

## Tareas bloqueadas

### T29 · Casos borde con el worker real — BLOQUEADA

- **Bloqueada por:** el worker de Guille todavía no existe, y falta acordar sus garantías (Q1, plan sección 3.4).
- **Qué hace:** reemplaza `seedProcessedVersion` por el worker real en tres tests de integración, uno por cada caso borde de la sección 8 de la spec:
  1. se sube una versión nueva mientras la anterior se procesa → al terminar, los fragmentos de la anterior quedan **inactivos**;
  2. se cambian las áreas mientras una versión se procesa → los fragmentos nuevos salen con las áreas **nuevas**;
  3. se archiva mientras una versión se procesa → los fragmentos nuevos quedan **inactivos**.

  Además: un trabajo cuya versión ya no existe se descarta sin error (A3 del plan 001).
- **Cubre:** R5, R7, R10; Q1; casos borde de la sección 8 de la spec.
- **Archivos:** `test/documents/lifecycle-worker.e2e-spec.ts`, `test/documents/helpers.ts` (pausar el worker en un punto controlado, con lo que exponga Guille).
- **Verificación:** test primero, contra el worker real y la base de tests. Los tres casos tienen que pasar en el orden "la operación del ADMIN confirma mientras el worker procesa" y también en el inverso.
- **Depende de:** T15, T14, T12 y el worker de Guille con las garantías de Q1
- **Commit:** `test(documents): cubrir el ciclo de vida con el procesamiento real`

## Verificación final

### T30 · Verificación de la feature

- **Qué hace:** corre todo, confirma que cada escenario tiene sus tests (tabla de abajo, se marca cada fila), revisa los índices y los paneles en el celular, y anota el resultado. No depende de T29: se cierra con T01 a T28 y se vuelve a correr cuando se desbloquee.
- **Cubre:** spec sección 11 completa; plan sección 7.
- **Archivos:** `specs/003-ciclo-de-vida-documentos/tasks.md` (se marca la tabla y se anota el resultado).
- **Verificación:**
  1. **Backend:** `pnpm --filter api lint`, `pnpm --filter api build`, `pnpm --filter api test` y `pnpm --filter api test:e2e`: todo en verde.
  2. **Frontend:** `pnpm --filter web lint`, `pnpm --filter web build`, `pnpm --filter web test` y `pnpm --filter web test:e2e`: todo en verde.
  3. **Contra la API real:** con Docker y la API en el puerto 3000, `pnpm --filter web test:e2e:integracion` en verde. Incluye los tests de la spec 002.
  4. **Índices (D1):** en la base de desarrollo, `pg_indexes` sigue teniendo `chunks_embedding_idx`, `chunks_content_fts_idx` y `document_versions_one_current_idx`.
  5. **Tabla:** cada fila tiene sus tests, buscados por nombre, y pasan.
  6. **Celular:** a 375 px de ancho, el detalle con cada panel abierto, el diálogo de archivar y el historial no tienen desplazamiento horizontal.
- **Depende de:** T01 a T28
- **Commit:** `docs(specs): registrar verificación del ciclo de vida de documentos`

#### Escenario → test

| Escenario | Unitario (API) | Integración (API) | Componente (web) | Playwright | ✔ |
| --- | --- | --- | --- | --- | --- |
| E1 · Cambiar áreas | `document-lifecycle.service.spec.ts` (T10) | `lifecycle.repository.e2e-spec.ts` (T06); `lifecycle.e2e-spec.ts` (T14) | `ChangeAreasForm.test.tsx` (T20) | `ciclo-de-vida.spec.ts` (T26); `integracion/ciclo-de-vida.spec.ts` (T28) | ☐ |
| E2 · Subir una versión nueva | `document-lifecycle.service.spec.ts` (T11) | `lifecycle.repository.e2e-spec.ts` (T07); `lifecycle.e2e-spec.ts` (T15) | `NewVersionForm.test.tsx` (T21) | `ciclo-de-vida.spec.ts` (T26); `integracion/ciclo-de-vida.spec.ts` (T28) | ☐ |
| E3 · Versión idéntica a la vigente | `document-lifecycle.service.spec.ts` (T11) | `lifecycle.e2e-spec.ts` (T15) | `NewVersionForm.test.tsx` (T21) | `ciclo-de-vida.spec.ts` (T26) | ☐ |
| E4 · Versión nueva con fecha de revisión | `document-lifecycle.service.spec.ts` (T11); `create-version.dto.spec.ts` (T09) | `lifecycle.repository.e2e-spec.ts` (T07); `lifecycle.e2e-spec.ts` (T15) | `NewVersionForm.test.tsx` (T21); `ReviewDateField.test.tsx` (T19) | `ciclo-de-vida.spec.ts` (T26) | ☐ |
| E5 · Falla al subir la versión nueva | `document-lifecycle.service.spec.ts` (T11) | `lifecycle.e2e-spec.ts` (T15) | `NewVersionForm.test.tsx` (T21) | `ciclo-de-vida.spec.ts` (T26) | ☐ |
| E6 · El responsable pierde el acceso | `document-lifecycle.service.spec.ts` (T10) | `lifecycle.e2e-spec.ts` (T14) | `ChangeAreasForm.test.tsx` (T20) | `ciclo-de-vida.spec.ts` (T26) | ☐ |
| E7 · Archivar | `document-lifecycle.service.spec.ts` (T12) | `lifecycle.repository.e2e-spec.ts` (T08); `lifecycle.e2e-spec.ts` (T14) | `ArchiveDialog.test.tsx` (T22); `DocumentDetail.test.tsx` (T24) | `ciclo-de-vida.spec.ts` (T26); `integracion/ciclo-de-vida.spec.ts` (T28) | ☐ |
| E8 · Rol sin permiso | guards de la spec 001 | `lifecycle.e2e-spec.ts` (T14, T15, T16) | `DocumentDetail.test.tsx` (T24) | `ciclo-de-vida.spec.ts` (T27) | ☐ |
| E9 · Documento archivado | `document-lifecycle.service.spec.ts` (T10, T11, T12) | `lifecycle.e2e-spec.ts` (T14, T15) | `DocumentDetail.test.tsx` (T24) | `ciclo-de-vida.spec.ts` (T27) | ☐ |
| E10 · Una sola versión vigente | `document-lifecycle.service.spec.ts` (T11): `ConcurrentVersionError` | `indexes.e2e-spec.ts` (T01); `lifecycle.repository.e2e-spec.ts` (T07); `lifecycle.e2e-spec.ts` (T15) | — | — (no se reproduce en el navegador) | ☐ |
| E11 · Archivar sin confirmar | — | — | `ArchiveDialog.test.tsx` (T22) | `ciclo-de-vida.spec.ts` (T26) | ☐ |
| E12 · Un empleado no ve el historial | — | `lifecycle.e2e-spec.ts` (T16) | `DocumentDetail.test.tsx` (T24) | `ciclo-de-vida.spec.ts` (T27) | ☐ |
| E13 · Historial de versiones | `document-query.service.spec.ts` (T13) | `lifecycle.repository.e2e-spec.ts` (T08); `lifecycle.e2e-spec.ts` (T16) | `VersionHistory.test.tsx` (T23) | `ciclo-de-vida.spec.ts` (T27) | ☐ |

Reglas y decisiones sin escenario propio, para no perderlas de vista:

| Regla o decisión | Tests que la cubren |
| --- | --- |
| R13 · Auditoría | `logger-audit-log.spec.ts` (T04); `document-lifecycle.service.spec.ts` (T10 a T12): `SUCCESS` y `FAILURE` |
| R14 · Confirmación para archivar | `ArchiveDialog.test.tsx` (T22): el texto exacto; `ciclo-de-vida.spec.ts` (T26) |
| D1 · Índices de `chunks` | `indexes.e2e-spec.ts` (T01) y el paso 4 de T30 |
| D4 · Mismas áreas | `document-lifecycle.service.spec.ts` (T10) |
| D6 · No se borran archivos viejos | `document-lifecycle.service.spec.ts` (T11); `lifecycle.e2e-spec.ts` (T15): el objeto de v1 sigue |
| Casos borde de la sección 8 | T29 (**bloqueada**, Q1) |

---

## Orden y dependencias

```
Backend
T01 ─┐
T02 ─┼─ T03 ─ T05 ─ T06 ─┬─ T07
T04  │                   └─ T08 ─ T13
T09  │
T10 ◄─ T02, T04, T06, T09
T11 ◄─ T07, T10 · T12 ◄─ T08, T10
T14 ◄─ T10, T12 · T15 ◄─ T11, T14 · T16 ◄─ T13, T15

Frontend
T17 ◄─ T16 · T18 ◄─ T17 · T19 (suelta)
T20 ◄─ T18 · T21 ◄─ T18, T19 · T22 ◄─ T18 · T23 ◄─ T17
T24 ◄─ T20, T21, T22, T23

Playwright
T25 ◄─ T24 · T26 ◄─ T25 · T27 ◄─ T25 · T28 ◄─ T26, T27

BLOQUEADA: T29 ◄─ T12, T14, T15 y el worker de Guille (Q1)
T30 ◄─ T01 a T28 (se vuelve a correr cuando se desbloquee T29)
```
