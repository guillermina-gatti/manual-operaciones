# Tareas 005 · Avisos de vencimiento de documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (30/10/2026):** ninguna hecha. T01 a T13 son el backend; T14 a T22, las pantallas; T23 a T25, Playwright; T26, la verificación.

Convenciones:

- Una tarea = un commit. Las rutas de backend son relativas a `apps/api/` y las de frontend a `apps/web/`, salvo que digan otra cosa.
- R1 a R13 y F1 a F6 son reglas de la spec; E1 a E13, sus escenarios (tabla al principio del plan); D1 a D22, las decisiones del plan (sección 10.1). No hay preguntas abiertas. Las reglas y decisiones de otros planes se citan con su plan ("D1 del plan 003", "T01 de la spec 003").
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Commits:** tipo en inglés, ámbito `api`, `web` o `specs`, descripción en español y en infinitivo.
- **"Avisar al equipo antes de mergear"** marca solo las tareas que tocan archivos que usan otras parejas: `schema.prisma`, `prisma/migrations`, `main.ts`, `layout.tsx`, `ci.yml`, el README y los `.env.example`. En esta spec, solo T01. **Ninguna tarea toca `src/executions`** ni archivos de otras parejas (D20).
- **Comandos de Prisma:** `prisma migrate dev`, `prisma migrate deploy` y `prisma generate` los corre el usuario, no el agente. El agente cambia `schema.prisma`, escribe el test y se detiene; el usuario crea la migración con `migrate dev --create-only`, se revisa el SQL juntos, y el usuario la aplica con `migrate deploy` y `generate` (T01; plan, sección 4.3).
- Tests:
  - backend: `pnpm --filter api test <patrón>` y `pnpm --filter api test:e2e <patrón>`. Los de integración resetean `manual_test` antes de la suite, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA;
  - frontend: `pnpm --filter web test <patrón>`, `pnpm --filter web test:e2e <patrón>` y `pnpm --filter web test:e2e:integracion`.
- **"Hoy" en los tests:** los unitarios nuevos reciben un `FixedClock`; los de integración de esta spec levantan la app con el reloj en `2026-11-10T02:30:00.000Z` (23:30 del 9/11 en Argentina, ya 10/11 en UTC) y usan las fechas literales de la tabla de la sección 1.4 del plan. Los tests existentes siguen con `jest.setSystemTime` y `SystemClock`, sin cambios.

---

## Backend

### T01 · Migración: la última revisión de cada documento

- **Qué hace:**
  - **El agente:** suma a `Document`, en `schema.prisma`, `lastReviewedAt DateTime? @map("last_reviewed_at") @db.Timestamptz(3)` y `lastReviewedById String? @map("last_reviewed_by_id") @db.Uuid`, con el comentario del plan (sección 4.1); escribe el test de las columnas; y **se detiene**: no corre ningún comando de Prisma.
  - **El usuario:** crea la migración `add_document_reviews` con `--create-only`, la revisa junto con el agente y la aplica con `migrate deploy` y `generate`.
- **Cubre:** R8, R10, R11; D13; plan secciones 4.1 a 4.3.
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<fecha>_add_document_reviews/migration.sql` (la crea el usuario), `test/documents/reviews.repository.e2e-spec.ts`.
- **Verificación:**
  1. **Agente, test primero**, `test/documents/reviews.repository.e2e-spec.ts`, con SQL crudo (el cliente de Prisma todavía no conoce las columnas):
     - `information_schema.columns` de `documents` tiene `last_reviewed_at` (`timestamp with time zone`, nula) y `last_reviewed_by_id` (`uuid`, nula);
     - un documento recién sembrado con `seedDocument` (sin cambios) tiene las dos en `null` (R11: la carga no cuenta como revisión).

     Sin la migración falla, porque las columnas no existen. El agente escribe el test, cambia `schema.prisma` y **se detiene**.
  2. **Usuario:** `pnpm --filter api exec prisma migrate dev --create-only --name add_document_reviews`.
  3. **Usuario y agente, juntos:** revisan `migration.sql`. Tiene que tener **solo** el `ALTER TABLE "documents" ADD COLUMN "last_reviewed_at" TIMESTAMPTZ(3), ADD COLUMN "last_reviewed_by_id" UUID` de la sección 4.2 del plan.
     - **Ningún `DROP INDEX`:** si Prisma generó `DROP INDEX "chunks_embedding_idx"`, `"chunks_content_fts_idx"` o `"chunks_content_fts_es_unaccent_idx"`, se borran esas líneas.
     - Si aparece cualquier otra cosa (por ejemplo, un cambio en tablas de otra pareja), **no se aplica**: se avisa a esa pareja y se resuelve antes.
  4. **Usuario:** `pnpm --filter api exec prisma migrate deploy` y `pnpm --filter api exec prisma generate`. No `migrate dev` (plan, sección 4.3, paso 3).
  5. Con la migración aplicada, se corren `pnpm --filter api test` y `pnpm --filter api test:e2e`, con la confirmación del usuario. El test nuevo pasa, `indexes.e2e-spec.ts` sigue pasando sin cambios (no se perdió ningún índice de `chunks`) y los demás también.
- **Depende de:** —
- **Nota:** toca `schema.prisma` y las migraciones. **Avisar al equipo antes de mergear**: agrega dos columnas nulas a `documents`, sin tocar tablas de otras parejas.
- **Commit:** `feat(api): guardar la última revisión de cada documento`

### T02 · Fechas de la empresa y reloj de documentos

- **Qué hace:**
  - crea `src/documents/company-date.ts` con `todayInCompany(now)` (el `today()` privado de `DocumentWriteSteps`, con `now` como parámetro), `addDays(date, days)` y `toDbDate(date)` (plan, sección 1.2);
  - crea `src/common/clock.ts` con su propio `Clock` (clase abstracta con `now(): Date`) y `SystemClock` (`new Date()`). **No** importa ni toca `src/executions/ports/clock.ts` (D20);
  - `DocumentWriteSteps` recibe `clock: Clock = new SystemClock()` como último parámetro y `assertReviewDateIsAfterToday` pasa a usar `todayInCompany(this.clock.now())`, con el mismo mensaje;
  - `DocumentUploadService` y `DocumentLifecycleService` reciben `clock: Clock = new SystemClock()` como último parámetro y se lo pasan a `DocumentWriteSteps`;
  - `DocumentsModule` suma `{ provide: Clock, useClass: SystemClock }`.
- **Cubre:** R1, R7; D2, D3, D20; plan secciones 1.2 y 1.3; sección 9 de la spec.
- **Archivos:** `src/documents/company-date.ts`, `src/documents/company-date.spec.ts`, `src/common/clock.ts`, `src/documents/document-write-steps.ts`, `src/documents/document-write-steps.spec.ts`, `src/documents/document-upload.service.ts`, `src/documents/document-lifecycle.service.ts`, `src/documents/documents.module.ts`.
- **Verificación:** test primero:
  - `company-date.spec.ts`:
    - `todayInCompany(new Date('2026-11-10T02:30:00.000Z'))` → `2026-11-09` (23:30 en Buenos Aires); `2026-11-10T03:00:00.000Z` → `2026-11-10`; con `APP_TIMEZONE=UTC`, el primero da `2026-11-10`;
    - `addDays('2026-11-09', 30)` → `2026-12-09`; `addDays('2026-12-31', 1)` → `2027-01-01`; `addDays('2027-02-28', 1)` → `2027-03-01`;
    - `toDbDate('2026-11-09')` es medianoche UTC de ese día;
  - un caso nuevo en `document-write-steps.spec.ts`, con un `FixedClock` en el constructor fijado en `2026-11-10T02:30:00.000Z`: `2026-11-09` → 400 y `2026-11-10` pasa. Falla antes del cambio, porque el constructor todavía no recibe el reloj;
  - los demás tests de `document-write-steps.spec.ts`, `document-upload.service.spec.ts` y `document-lifecycle.service.spec.ts` pasan **sin cambios** (siguen con `jest.setSystemTime`, que `SystemClock` respeta);
  - `pnpm --filter api test:e2e upload lifecycle` sigue pasando: Nest resuelve el `Clock` del módulo.
- **Depende de:** —
- **Commit:** `feat(api): calcular la fecha de la empresa con un reloj inyectable`

### T03 · Estado de revisión

- **Qué hace:** crea `src/documents/review-status.ts` con `ReviewStatus` (`UP_TO_DATE`, `DUE_SOON`, `OVERDUE`), `DUE_SOON_DAYS = 30` y `reviewStatusOf(document, today)`, la función pura de la sección 1.1 del plan: archivado → `null`; fecha anterior a hoy → `OVERDUE`; de hoy a hoy + 30 → `DUE_SOON`; después → `UP_TO_DATE`. Compara las fechas `YYYY-MM-DD` como texto y usa `addDays`.
- **Cubre:** R1, R2, R3; D1; plan sección 1.1.
- **Archivos:** `src/documents/review-status.ts`, `src/documents/review-status.spec.ts`.
- **Verificación:** test primero, `review-status.spec.ts`, con `today = '2026-11-09'`:
  - **E2:** `2026-11-04` y `2026-11-08` → `OVERDUE`;
  - **E4:** `2026-11-09` → `DUE_SOON`;
  - **E1:** `2026-11-19` → `DUE_SOON`; `2026-12-09` (hoy + 30) → `DUE_SOON`;
  - `2026-12-10` (hoy + 31) → `UP_TO_DATE`; **E3:** `2027-02-07` → `UP_TO_DATE`;
  - **R2:** un archivado con `2026-11-04` → `null`;
  - cruce de año: `today = '2026-12-15'`, `2027-01-14` → `DUE_SOON` y `2027-01-15` → `UP_TO_DATE`.
- **Depende de:** T02
- **Commit:** `feat(api): calcular el estado de revisión de un documento`

### T04 · Política: quién ve y revisa, y qué está pendiente

- **Qué hace:**
  - `document-access.policy.ts` suma `canReview(user, document)` (ADMIN o `document.ownerId === user.id`) y `pendingReviewWhere(viewer, userId, lastDay)`: para el ADMIN, `{ status: 'ACTIVE', reviewDate: { lte: lastDay } }`; para los demás, `{ ...listWhere(viewer), ownerId: userId, reviewDate: { lte: lastDay } }`;
  - `review-status.ts` suma el tipo `DocumentReviewInfo` (`status`, `lastReviewedAt`, `lastReviewedById`) y `reviewFor(user, record, today)`, que devuelve `undefined` si `canReview` es falso y, si no, el estado de `reviewStatusOf` y la última revisión en ISO o `null`.
- **Cubre:** R4, R5, R6, R11; D6; plan secciones 2.2 y 3.1; casos borde del responsable ADMIN y del que pierde el acceso.
- **Archivos:** `src/documents/document-access.policy.ts`, `src/documents/document-access.policy.spec.ts`, `src/documents/review-status.ts`, `src/documents/review-status.spec.ts`.
- **Verificación:** test primero:
  - `canReview`: ADMIN → sí, aunque no sea el responsable; responsable EMPLOYEE y SUPERVISOR → sí; **E5:** otro EMPLOYEE de la misma área → no;
  - `pendingReviewWhere`: ADMIN → sin áreas ni `ownerId`; EMPLOYEE → `listWhere` (`ACTIVE` y sus áreas) + `ownerId`; siempre con `reviewDate: { lte }` = la fecha recibida;
  - `reviewFor`: ADMIN y responsable → `{ status, lastReviewedAt, lastReviewedById }`; otro usuario → `undefined`; un ADMIN responsable → un solo objeto; nunca revisado → `lastReviewedAt: null` y `lastReviewedById: null`; con revisión → ISO 8601; archivado → `status: null` con la última revisión;
  - los tests de `canView`, `listWhere`, `searchScope` y `canBeOwner` siguen pasando sin cambios.
- **Depende de:** T03
- **Commit:** `feat(api): definir quién ve y revisa el estado de un documento`

### T05 · Respuesta con el estado de revisión

- **Qué hace:**
  - `DocumentRecord` suma `lastReviewedAt?: Date | null` y `lastReviewedById?: string | null` (opcionales, como `archivedAt`) y `toRecord` los completa siempre;
  - `document.response.ts` suma la clase `DocumentReviewInfo` (`@ApiProperty` con el `enum` del estado, nullable, y las fechas) y el campo opcional `review` en `DocumentFields` (`@ApiPropertyOptional`);
  - `toDocumentResponse(record, review?)`, `toDocumentSummary(record, review?)` y `toDocumentSearchResult(record, fragment, review?)` agregan `review` solo si viene (`...(review && { review })`), campo por campo.
- **Cubre:** R4, R11; D6, D7; plan secciones 2.1 y 3.3.
- **Archivos:** `src/documents/documents.repository.ts`, `src/documents/prisma-documents.repository.ts`, `src/documents/dto/document.response.ts`, `src/documents/dto/document.response.spec.ts`.
- **Verificación:** test primero, en `document.response.spec.ts`:
  - con `review`, la respuesta del detalle, del listado y de la búsqueda tiene la clave con sus tres campos;
  - un registro con `lastReviewedAt` y `lastReviewedById` pero **sin** `review` no los manda en ningún lado (el JSON no contiene esos nombres);
  - sin `review`, los `toStrictEqual` existentes pasan **sin cambios** (D6: para los demás, la respuesta es la de hoy);
  - `pnpm --filter api exec tsc --noEmit` sin errores.
- **Depende de:** T01, T04
- **Commit:** `feat(api): incluir el estado de revisión en la respuesta de un documento`

### T06 · Repositorio: "Por revisar" y "Marcar como revisado"

- **Qué hace:**
  - el puerto `DocumentsRepository` suma `listForReview(where, page, limit)`, `count(where)` y `markReviewed(tx, id, { reviewDate, reviewedById, at })`;
  - `PrismaDocumentsRepository`:
    - `listForReview`: como `list`, en el mismo `$transaction([...])`, pero ordenado por `reviewDate` y `id` ascendentes (D8);
    - `count`: `document.count({ where })`;
    - `markReviewed`: un solo `document.update` que pone `reviewDate`, `lastReviewedAt`, `lastReviewedById` y `updatedAt`, dentro de la transacción recibida; no toca versiones, fragmentos ni almacenamiento (R8);
  - `seedDocument` suma `reviewDate?: string`, `ownerId?: string` y `lastReview?: { at: Date; byId: string }`. Sin ellos, siembra lo mismo que hoy.
- **Cubre:** R5, R8; D8, D13; plan secciones 3.1, 3.2 y 3.3.
- **Archivos:** `src/documents/documents.repository.ts`, `src/documents/prisma-documents.repository.ts`, `test/documents/helpers.ts`, `test/documents/reviews.repository.e2e-spec.ts`.
- **Verificación:** test primero, en `test/documents/reviews.repository.e2e-spec.ts`:
  - `listForReview`: con `2026-11-04`, `2026-11-19`, `2026-11-09` y `2027-02-07`, y `lte` en `2026-12-09` → los tres primeros en orden `2026-11-04`, `2026-11-09`, `2026-11-19`; a igual fecha, por `id`; `total` es la cantidad que cumple el filtro; `page=2` con 25 → 5;
  - `count`: cuenta según el filtro;
  - `markReviewed`: cambia las tres columnas a la vez; la versión `CURRENT`, la cantidad de versiones y los fragmentos (`seedProcessedVersion`: `is_active` y `area_ids`) no cambian;
  - los tests de `documents.repository.e2e-spec.ts`, `lifecycle.repository.e2e-spec.ts` y `search.repository.e2e-spec.ts` siguen pasando con `seedDocument` ampliada.
- **Depende de:** T01, T05
- **Commit:** `feat(api): listar los documentos por revisar y registrar una revisión`

### T07 · Repositorio: la versión nueva con fecha cuenta como revisión

- **Qué hace:** en `PrismaDocumentsRepository.addVersion`, el paso 4 escribe, solo si vino `reviewDate`, también `lastReviewedAt` y `lastReviewedById = version.uploadedById`, con el mismo `now` que `updatedAt` (plan, sección 5). La firma del puerto no cambia.
- **Cubre:** R10; D14; E12 a nivel repositorio.
- **Archivos:** `src/documents/prisma-documents.repository.ts`, `test/documents/reviews.repository.e2e-spec.ts`.
- **Verificación:** test primero, en `test/documents/reviews.repository.e2e-spec.ts`:
  - `addVersion` con `reviewDate` → `last_reviewed_by_id` = `uploadedById` y `last_reviewed_at` entre el antes y el después de la llamada, igual a `updated_at`;
  - `addVersion` **sin** `reviewDate` sobre un documento con `lastReview` sembrado → las dos columnas no cambian;
  - si la transacción se deshace (un error después de `addVersion`), la última revisión tampoco queda;
  - los tests unitarios de `document-lifecycle.service.spec.ts` y los de integración de la spec 003 (`lifecycle.e2e-spec.ts`, `lifecycle.repository.e2e-spec.ts`) pasan **sin cambios**.
- **Depende de:** T06
- **Commit:** `feat(api): registrar la revisión al subir una versión con fecha nueva`

### T08 · Visibilidad compartida

- **Qué hace:** saca de `DocumentQueryService` `viewerFor` y la comprobación de `findVisible` a `src/documents/document-access.ts`, como `viewerFor(users, user)` y `findVisibleDocument(users, documents, user, id)`, sin cambiar su comportamiento: primero el visor y después el documento; 404 igual para inexistente y ajeno; si el directorio falla, el error se propaga. `DocumentQueryService` pasa a usarlas.
- **Cubre:** R6; D11; R11 de la spec 001.
- **Archivos:** `src/documents/document-access.ts`, `src/documents/document-query.service.ts`.
- **Verificación:** es un movimiento sin cambio de comportamiento: `document-query.service.spec.ts` y `test/documents/query.e2e-spec.ts` pasan **sin cambios** (son la red de seguridad, como `DocumentWriteSteps` en T02 de la spec 003). `pnpm --filter api exec tsc --noEmit` sin errores.
- **Depende de:** —
- **Commit:** `refactor(api): compartir la regla de visibilidad de un documento`

### T09 · Servicio de consultas: el estado y "Por revisar"

- **Qué hace:** `DocumentQueryService`:
  - recibe `clock: Clock = new SystemClock()` como último parámetro;
  - `findOne`, `list` y `search` calculan `today = todayInCompany(clock.now())` una vez por pedido y pasan `reviewFor(user, record, today)` a los mapeos;
  - suma `pendingReview(user, query)`, con los pasos de la sección 3.1 del plan: visor, `today`, `listForReview(pendingReviewWhere(…, toDbDate(addDays(today, 30))), page, limit)`, `isReviewer` (ADMIN, o `total > 0`, o `count({ ...listWhere(viewer), ownerId })` > 0) y `{ data, total, page, limit, isReviewer }`, dentro de `mapErrors`.
- **Cubre:** R1, R3, R4, R5, R13; D4, D6, D7, D9, D19; plan secciones 1.2, 2.2 y 3.1.
- **Archivos:** `src/documents/document-query.service.ts`, `src/documents/document-query.service.spec.ts`.
- **Verificación:** test primero, con los puertos simulados y un `FixedClock` en `2026-11-10T02:30:00.000Z`:
  - **E1/E2:** el responsable y el ADMIN reciben `review` en el detalle, el listado y la búsqueda, con el estado calculado para `2026-11-09`;
  - **E5:** un EMPLOYEE que no es responsable no recibe la clave `review`;
  - `pendingReview`: pide al repositorio el filtro de la política con `lte` = `2026-12-09`; **E6:** devuelve en el orden del repositorio; **E7:** el ADMIN, sin filtro de responsable; `isReviewer` sin llamar a `count` si `total > 0`; **E13:** con `total: 0`, llama a `count` y responde `isReviewer: true` si es responsable de algo; **D9:** quien no es responsable de nada → `data: []`, `isReviewer: false`, sin 403;
  - directorio caído → 503 y **nunca** llama a `listForReview`; `RepositoryUnavailableError` → 503 (R13);
  - los tests existentes de `document-query.service.spec.ts` pasan sin cambios.
- **Depende de:** T04, T05, T06, T08
- **Commit:** `feat(api): mostrar el estado de revisión y armar la lista por revisar`

### T10 · Servicio: "Marcar como revisado"

- **Qué hace:**
  - crea `MarkReviewedDto` con `reviewDate` obligatorio y las mismas validaciones que `CreateDocumentDto.reviewDate`;
  - `AuditAction` suma `'DOCUMENT_REVIEW'`; `HttpOperation` suma `'revisión'` ("el registro de la revisión");
  - `DocumentLifecycleService.markReviewed(id, dto, actor)` con el orden de la sección 3.2 del plan: fecha posterior a hoy (`assertReviewDateIsAfterToday`) → `findVisibleDocument` (404) → `canReview` (403) → archivado (409 `ARCHIVED`) → transacción con `lockForUpdate`, nueva lectura (404, 409 y 403 si cambió el responsable) → `markReviewed(tx, id, { reviewDate: toDbDate(…), reviewedById: actor.id, at: clock.now() })` → auditoría `SUCCESS` dentro de la transacción. Usa `run`, así los fallos se auditan y se mapean como en las demás acciones. La respuesta lleva `review` para el actor (`run` pasa `reviewFor`).
- **Cubre:** R6, R7, R8, R9, R13; D10, D11, D12; plan secciones 3.2 y 3.3.
- **Archivos:** `src/documents/dto/mark-reviewed.dto.ts`, `src/documents/dto/mark-reviewed.dto.spec.ts`, `src/documents/ports/audit-log.ts`, `src/documents/http-errors.ts`, `src/documents/http-errors.spec.ts`, `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`.
- **Verificación:** test primero:
  - `mark-reviewed.dto.spec.ts`: sin `reviewDate`, `2026-11-31`, `09/11/2026` y `2026-11-09T00:00` → error; `2026-11-10` pasa; campos de más, rechazados;
  - `http-errors.spec.ts`: el 503 con `'revisión'` tiene su mensaje;
  - `document-lifecycle.service.spec.ts`, con un `FixedClock` en `2026-11-10T02:30:00.000Z`:
    - **E9:** `2026-11-09` → 400 sin leer la base;
    - inexistente → 404; de otra área → 404 (sin revelar que existe);
    - **E10:** visible sin ser responsable → 403 y no abre la transacción;
    - **E11:** archivado → 409 `ARCHIVED`;
    - bajo el bloqueo: archivado → 409; responsable cambiado y el actor no es ADMIN → 403;
    - **E8:** llama a `markReviewed` con la fecha, el actor y el instante del reloj; audita `DOCUMENT_REVIEW` `SUCCESS` con la transacción; responde con `review.status: "UP_TO_DATE"`;
    - **D12:** la misma fecha que ya tiene → 200;
    - falla la base → 503 y `FAILURE`;
  - los tests existentes de `document-lifecycle.service.spec.ts` pasan sin cambios.
- **Depende de:** T02, T04, T05, T06, T08
- **Commit:** `feat(api): marcar un documento como revisado`

### T11 · Endpoint: `GET /documents/pending-review` y el estado en las respuestas

- **Qué hace:**
  - suma a `DocumentsController` `GET /documents/pending-review` con `ListDocumentsQuery`, **declarado antes de `@Get(':id')`**, sin `@Roles`, y con Swagger (`PendingReviewBody` = `DocumentListBody` + `isReviewer`, `@ApiResponse` para 200, 400, 401 y 503);
  - `createDocumentsTestApp` suma `options?: { clock?: Clock }` y hace `.overrideProvider(Clock).useValue(clock)` solo si lo recibe; `test/documents/helpers.ts` suma `FixedClock`, que extiende el `Clock` de `src/common/clock.ts` (D20).
- **Cubre:** R1 a R5, R13; F2; D5, D6, D8, D9, D19; plan secciones 1.4, 2 y 3.1; E1 a E7 y E13 a nivel API.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/helpers.ts`, `test/documents/reviews.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/reviews.e2e-spec.ts`, con Supertest, la base de tests y el reloj en `2026-11-10T02:30:00.000Z` (plan, sección 8.2):
  - **ruta:** `GET /api/documents/pending-review` → 200, no el 400 del `ParseUUIDPipe`;
  - **E1:** documento de Ventas con responsable `empleadoVentas` y `2026-11-19` → el responsable ve `DUE_SOON` en el listado y en el detalle;
  - **E2:** `2026-11-04` → el ADMIN ve `OVERDUE` en el detalle;
  - **E3:** `2027-02-07` → `UP_TO_DATE`;
  - **E4:** `2026-11-09` → `DUE_SOON` (en UTC daría `OVERDUE`);
  - bordes: `2026-12-09` está en "Por revisar" con `DUE_SOON`; `2026-12-10` no está y es `UP_TO_DATE`;
  - **E5:** `empleadoVentas`, sin ser responsable: el cuerpo del listado y del detalle **no tiene la clave `review`**; "Por revisar" → `data: []`, `isReviewer: false`;
  - **E6:** vencido, por vencer y al día del mismo responsable → `[vencido, por vencer]`, `total: 2`, `isReviewer: true`;
  - **E7:** el ADMIN ve los de tres responsables, en Ventas y Operaciones; un ADMIN responsable de uno lo ve una sola vez;
  - varias áreas: un SUPERVISOR responsable en dos áreas suyas ve los dos;
  - responsable sin acceso: documento de Operaciones sembrado con `empleadoVentas` como responsable → no está en su lista; el ADMIN lo ve con `OVERDUE`;
  - archivado (con el endpoint real, `POST …/archive`) con fecha vencida → no está en la lista del ADMIN; su detalle tiene `review.status: null`;
  - **E13:** responsable con dos al día → `data: []`, `total: 0`, `isReviewer: true`;
  - **R5:** 25 pendientes → `page=2` da 5 y `total = 25`; `limit=101` → 400; sin sesión → 401;
  - las suites de `query.e2e-spec.ts`, `search.e2e-spec.ts`, `upload.e2e-spec.ts` y `lifecycle.e2e-spec.ts` siguen pasando sin el reloj fijo.
- **Depende de:** T09
- **Commit:** `feat(api): exponer la lista de documentos por revisar`

### T12 · Endpoint: `POST /documents/:id/review`

- **Qué hace:** suma a `DocumentsController` `POST /documents/:id/review` con `ParseUUIDPipe`, `MarkReviewedDto` y `@HttpCode(200)`, sin `@Roles`, y con Swagger (`@ApiResponse` para 200, 400, 401, 403, 404, 409 y 503).
- **Cubre:** R6 a R10, R13; D10, D12, D14; plan sección 3.2; E8 a E12 a nivel API.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/reviews.e2e-spec.ts`.
- **Verificación:** test primero, en `test/documents/reviews.e2e-spec.ts`:
  - **E8:** vencido con fragmentos (`seedProcessedVersion`), marcado por su responsable con `2027-05-09` → 200; `reviewDate = 2027-05-09`, `review.status: "UP_TO_DATE"`, `lastReviewedById` = el responsable y `lastReviewedAt` = el instante del reloj; en la base, la misma versión `CURRENT`, una sola versión, los fragmentos con el mismo `is_active` y `area_ids`, `FakeProcessingQueue.enqueued` vacío y ningún objeto nuevo en `InMemoryFileStorage`; el detalle después muestra la última revisión;
  - fecha dentro de 30 días (`2026-11-20`) → 200 y `DUE_SOON` (caso borde);
  - **E9:** `2026-11-09` → 400 y `review_date` sigue en `2026-11-04`; sin `reviewDate` y `2026-13-01` → 400; `2026-11-10` → 200; id que no es UUID → 400;
  - **E10:** `empleadoVentas`, sin ser responsable → 403 y nada cambió; `empleadoOperaciones` → 404; sin sesión → 401;
  - **E11:** archivado → el ADMIN recibe 409 `ARCHIVED`; el responsable que no es ADMIN, 404;
  - responsable sin acceso → 404;
  - **E12:** vencido; el ADMIN sube una versión con `reviewDate = 2027-11-09` (endpoint real de la spec 003) → el detalle tiene `UP_TO_DATE` y `lastReviewedById` = ese ADMIN; sin `reviewDate`, la última revisión sembrada no cambia;
  - columnas: después de una revisión, las dos tienen valor; en un documento recién cargado por la API, las dos `null`.
- **Depende de:** T07, T10, T11
- **Commit:** `feat(api): exponer la acción de marcar como revisado`

### T13 · Auditoría de la revisión

- **Qué hace:**
  - `AuditEntry` suma `previousReviewDate?: string` y `newReviewDate?: string`;
  - `LoggerAuditLog` los escribe campo por campo, solo si vienen;
  - `DocumentWriteSteps.auditFailure` suma un último parámetro opcional, `extra?`, con esos dos campos; las llamadas existentes no cambian;
  - `markReviewed` audita el éxito con la fecha leída **bajo el bloqueo** como anterior y la elegida como nueva, y el fallo con `newReviewDate` (si pasó el DTO) y la anterior (si ya se había leído el documento).
- **Cubre:** R12; D15; plan sección 6; caso borde de dos revisiones simultáneas.
- **Archivos:** `src/documents/ports/audit-log.ts`, `src/documents/adapters/logger-audit-log.ts`, `src/documents/adapters/logger-audit-log.spec.ts`, `src/documents/document-write-steps.ts`, `src/documents/document-write-steps.spec.ts`, `src/documents/document-lifecycle.service.ts`, `src/documents/document-lifecycle.service.spec.ts`, `test/documents/reviews.e2e-spec.ts`.
- **Verificación:** test primero:
  - `logger-audit-log.spec.ts`: con las dos fechas, el log las tiene; sin ellas, no aparecen; un campo que no está en la lista no llega al log;
  - `document-write-steps.spec.ts`: `auditFailure` con `extra` lo registra; sin `extra`, igual que antes;
  - `document-lifecycle.service.spec.ts`: **E8** audita `previousReviewDate: '2026-11-04'` y `newReviewDate: '2027-05-09'`, con la anterior tomada de `lockForUpdate` (no de la primera lectura); un 403 audita `FAILURE` con `newReviewDate`;
  - `reviews.e2e-spec.ts`, con `jest.spyOn(audit, 'record')`: **E8** con las dos fechas; **simultáneas:** dos `POST …/review` a la vez (`Promise.all`) con fechas distintas → los dos 200, `review_date` es una de las dos, dos entradas `SUCCESS`, y la anterior de una es la nueva de la otra.
- **Depende de:** T12
- **Commit:** `feat(api): auditar la fecha anterior y la nueva de cada revisión`

## Frontend

### T14 · Tipos, llamadas a la API y mensajes de error

- **Qué hace:**
  - `lib/api/documents.ts` suma `ReviewStatus`, `DocumentReview`, `review?: DocumentReview` en `DocumentFields` y `PendingReviewResponse` (`DocumentListResponse` + `isReviewer`); y las funciones `listPendingReview(page, limit, signal)` → `GET /api/documents/pending-review?page=…&limit=…` y `markReviewed(id, reviewDate, signal)` → `POST /api/documents/:id/review` con `{ reviewDate }` en JSON;
  - `describeApiError` suma el contexto `'review'`: el 400 por campo (`reviewDate`), el 403 con "No tenés permiso para marcar este documento como revisado.", el 404 y el 409 `ARCHIVED` con los mensajes de siempre.
- **Cubre:** F5; D16, D18; plan secciones 7.5 y 7.6.
- **Archivos:** `lib/api/documents.ts`, `lib/api/error-messages.ts`, `lib/api/index.ts`, `tests/lib/api/documents.test.ts`, `tests/lib/api/error-messages.test.ts`.
- **Verificación:** test primero:
  - `listPendingReview(2, 20)` pide `/api/documents/pending-review?page=2&limit=20`;
  - `markReviewed('…', '2027-05-09')` hace `POST` a `/api/documents/…/review` con `Content-Type: application/json` y `{"reviewDate":"2027-05-09"}`;
  - `describeApiError` en `'review'`: 400 con `reviewDate…` → `fieldErrors.reviewDate`; 403, 404, 409 `ARCHIVED` y 503 con sus mensajes; nunca el texto técnico;
  - los contextos anteriores no cambian.
- **Depende de:** T12 (contrato de la API)
- **Commit:** `feat(web): agregar las llamadas de revisión a la API`

### T15 · Etiqueta del estado de revisión

- **Qué hace:** crea `ReviewStatusBadge({ status })`: `OVERDUE` → "Vencido" en rojo; `DUE_SOON` → "Vence pronto" en ámbar; `UP_TO_DATE`, `null` o sin estado → nada. Siempre con la palabra, con la forma de "Archivado" y colores con contraste en modo claro y oscuro (plan, sección 7.2).
- **Cubre:** F1; D16.
- **Archivos:** `components/documents/ReviewStatusBadge.tsx`, `tests/components/documents/ReviewStatusBadge.test.tsx`.
- **Verificación:** test primero:
  - `OVERDUE` → el texto "Vencido"; `DUE_SOON` → "Vence pronto";
  - `UP_TO_DATE`, `null` y `undefined` → no renderiza nada;
  - el estado se lee como texto (no depende del color): `getByText`.
- **Depende de:** T14
- **Commit:** `feat(web): mostrar la etiqueta del estado de revisión`

### T16 · Etiqueta en la tarjeta

- **Qué hace:** `DocumentCard` muestra `ReviewStatusBadge` con `document.review?.status` junto al título, en el mismo lugar que "Archivado" (`shrink-0`). Sin `review`, la tarjeta queda como hoy. Como `DocumentList`, `SearchResultCard` y la lista de T22 usan `DocumentCard`, la etiqueta aparece en los tres (D7).
- **Cubre:** F1, F6; R4; D7, D16; plan sección 7.2.
- **Archivos:** `components/documents/DocumentCard.tsx`, `tests/components/documents/DocumentCard.test.tsx`.
- **Verificación:** test primero:
  - **E1:** `review.status: 'DUE_SOON'` → "Vence pronto"; **E2:** `OVERDUE` → "Vencido";
  - **E3:** `UP_TO_DATE` → sin etiqueta; **E5:** sin `review` → sin etiqueta;
  - un ADMIN con un archivado (`review.status: null`) ve "Archivado" y ninguna etiqueta de revisión;
  - los tests anteriores de `DocumentCard` pasan sin cambios.
- **Depende de:** T15
- **Commit:** `feat(web): mostrar el estado de revisión en la tarjeta`

### T17 · Etiqueta y última revisión en el detalle

- **Qué hace:**
  - mueve a `lib/documents/format.ts` el formato "23/10/2026" en Buenos Aires que hoy está dentro de `DocumentDetail`, como `formatDay(iso)`, y "Archivado desde" pasa a usarlo;
  - `DocumentDetail` muestra `ReviewStatusBadge` junto al `<h1>` y, si `review?.lastReviewedAt`, el campo "Última revisión": "30/10/2026, por Ana Pérez", con el nombre pedido en el mismo `getNames` que el responsable (`[ownerId, lastReviewedById]`). Si nunca se revisó, el campo no aparece.
- **Cubre:** F1; R4, R11; D16; plan secciones 7.2 y 7.5.
- **Archivos:** `lib/documents/format.ts`, `tests/lib/documents/format.test.ts`, `components/documents/DocumentDetail.tsx`, `tests/components/documents/DocumentDetail.review.test.tsx` (aparte de `DocumentDetail.test.tsx`, como `DocumentList.search.test.tsx` en la spec 004).
- **Verificación:** test primero:
  - `formatDay('2026-10-31T01:30:00.000Z')` → `30/10/2026` (en Buenos Aires todavía es el 30);
  - **E2:** el ADMIN ve "Vencido" junto al título;
  - **E8:** con `lastReviewedAt` y `lastReviewedById`, "Última revisión" con la fecha y el nombre; sin ellos, no aparece;
  - **E5:** sin `review`, ni etiqueta ni "Última revisión";
  - los tests de `DocumentDetail.test.tsx` y `DocumentDetail.lifecycle.test.tsx` pasan sin cambios ("Archivado desde" sigue igual).
- **Depende de:** T15
- **Commit:** `feat(web): mostrar el estado y la última revisión en el detalle`

### T18 · Formulario "Marcar como revisado"

- **Qué hace:**
  - `ReviewDateField` suma la prop opcional `label`; sin ella, las etiquetas de siempre;
  - crea `MarkReviewedForm({ documentId, onDone })`: `ReviewDateField` obligatorio con `label="Próxima fecha de revisión"` y `min` en mañana, y el botón "Marcar como revisado". Valida antes de enviar (vacía → "Elegí la próxima fecha de revisión."; antes de mañana → `FIELD_MESSAGES.reviewDate`), llama a `markReviewed`, deshabilita el botón con "Guardando…" mientras espera y, ante un error, muestra `describeApiError(error, 'review')` sin borrar la fecha. En el celular, columna; desde `sm:`, fila.
- **Cubre:** F4, F5, F6; R7; plan sección 7.5.
- **Archivos:** `components/documents/ReviewDateField.tsx`, `tests/components/documents/ReviewDateField.test.tsx`, `components/documents/MarkReviewedForm.tsx`, `tests/components/documents/MarkReviewedForm.test.tsx`.
- **Verificación:** test primero, con `vi.mock` de `@/lib/api`:
  - `ReviewDateField` con `label` la usa; sin ella, sus tests anteriores pasan sin cambios;
  - el campo tiene `min` = `tomorrowIn(COMPANY_TIME_ZONE, new Date())`;
  - vacía → el aviso junto al campo y ningún pedido;
  - **E8:** elige una fecha y envía → `markReviewed(id, fecha)` y `onDone` con el documento;
  - **E9:** 400 → el error junto al campo y la fecha sigue elegida;
  - **E10:** 403 → "No tenés permiso para marcar este documento como revisado.";
  - **E11:** 409 `ARCHIVED` → "El documento fue archivado. Ya no se puede modificar.";
  - 503 → el mensaje de siempre, con la fecha intacta (F5);
  - dos clics seguidos → un solo pedido.
- **Depende de:** T14
- **Commit:** `feat(web): agregar el formulario de marcar como revisado`

### T19 · Sección "Revisión" en el detalle

- **Qué hace:** `DocumentDetail` muestra, debajo de los datos y antes del historial, la sección "Revisión" con `MarkReviewedForm`, solo si `doc.review` existe **y** `doc.status === 'ACTIVE'` (D16, D17). Al terminar, `finish('Revisión registrada')`: el aviso con `role="status"` y el detalle se vuelve a pedir.
- **Cubre:** F4, F6; R6, R9; D16, D17; plan sección 7.5.
- **Archivos:** `components/documents/DocumentDetail.tsx`, `tests/components/documents/DocumentDetail.review.test.tsx`.
- **Verificación:** test primero:
  - el ADMIN y el responsable EMPLOYEE (con `review`) ven la sección; el responsable no ve la fila de acciones del ADMIN;
  - **E5:** sin `review`, no hay sección ni botón "Marcar como revisado";
  - **E11:** archivado con `review` → sin la sección;
  - **E8:** después de un 200, "Revisión registrada" con `role="status"` y un segundo pedido del detalle;
  - el ADMIN con el panel "Subir versión nueva" abierto sigue viendo la sección;
  - los tests anteriores de `DocumentDetail` pasan sin cambios.
- **Depende de:** T17, T18
- **Commit:** `feat(web): marcar como revisado desde el detalle`

### T20 · Acceso a "Por revisar" con la cantidad

- **Qué hace:** crea `PendingReviewLink`: pide `listPendingReview(1, 1)` con `useApiResource` (la clave incluye al usuario) y, si `isReviewer`, muestra el enlace "Por revisar (N)" a `/documentos/por-revisar`, con `aria-label` ("Por revisar: 3 documentos", "1 documento", "ningún documento"), forma de botón secundario y 44 px de alto. Mientras carga, nada; si falla, el ADMIN ve el enlace sin número y los demás nada. `DocumentList` lo muestra en la fila de arriba, junto a "Cargar documento", con y sin búsqueda, y con `flex-wrap` para el celular.
- **Cubre:** F2, F6; D18, D19; plan sección 7.3.
- **Archivos:** `components/documents/PendingReviewLink.tsx`, `tests/components/documents/PendingReviewLink.test.tsx`, `components/documents/DocumentList.tsx`.
- **Verificación:** test primero:
  - `isReviewer: true`, `total: 3` → "Por revisar (3)" con su `aria-label` y el `href` correcto;
  - **E13:** `isReviewer: true`, `total: 0` → "Por revisar (0)";
  - **E5:** `isReviewer: false` → no se muestra;
  - error con ADMIN → "Por revisar" sin número; error con EMPLOYEE → nada;
  - pide con `limit=1`;
  - los tests de `DocumentList.test.tsx` y `DocumentList.search.test.tsx` siguen pasando. Si su mock de `@/lib/api` no exporta `listPendingReview`, se suma al mock sin cambiar las aserciones (como el `useRouter` de T15 de la spec 004).
- **Depende de:** T14
- **Commit:** `feat(web): mostrar el acceso a los documentos por revisar`

### T21 · Paginación con otra ruta base

- **Qué hace:** `Pagination` suma la prop opcional `basePath` (por defecto `/documentos`). Con ella, los enlaces son `<basePath>?pagina=N` y la página 1 es `<basePath>`; `query` sigue funcionando igual.
- **Cubre:** F3; plan sección 7.4.
- **Archivos:** `components/documents/Pagination.tsx`, `tests/components/documents/Pagination.test.tsx`.
- **Verificación:** test primero:
  - con `basePath="/documentos/por-revisar"`, "Siguiente" lleva a `/documentos/por-revisar?pagina=2` y la página 1 a `/documentos/por-revisar`;
  - los tests anteriores (con y sin `query`) pasan sin cambios.
- **Depende de:** —
- **Commit:** `feat(web): permitir otra ruta base en la paginación`

### T22 · Página "Por revisar"

- **Qué hace:**
  - crea `app/documentos/por-revisar/page.tsx`: componente de servidor sin datos, con el título "Por revisar", el enlace "Volver a Documentos" y `<Suspense>` con `PendingReviewList` (regla general del plan 002, sección 1);
  - crea `PendingReviewList`: lee `?pagina=`, pide `listPendingReview(page, PAGE_SIZE)`, pide los nombres de áreas y responsables una vez por página y muestra las tarjetas (`DocumentCard`) en el orden de la API, con `Pagination` (`basePath="/documentos/por-revisar"`). Estados: cargando, "No tenés documentos para revisar", "Esta página no existe" con enlace a la primera página de "Por revisar", y el error con "Reintentar".
- **Cubre:** F3, F6; R5; D9; plan sección 7.4.
- **Archivos:** `app/documentos/por-revisar/page.tsx`, `components/documents/PendingReviewList.tsx`, `tests/components/documents/PendingReviewList.test.tsx`.
- **Verificación:** test primero, con `vi.mock` de `@/lib/api`:
  - **E6:** vencido y por vencer, en el orden recibido, cada uno con su etiqueta y "Revisión";
  - **E13:** `data: []` → "No tenés documentos para revisar";
  - `?pagina=2` pide `page=2`; con más de 20, la paginación apunta a `/documentos/por-revisar`;
  - página que no existe → "Esta página no existe" con su enlace;
  - 503 → mensaje y "Reintentar", que vuelve a pedir;
  - `pnpm --filter web build` compila la ruta nueva (y `/documentos/[id]` sigue funcionando).
- **Depende de:** T16, T21
- **Commit:** `feat(web): agregar la página de documentos por revisar`

## Tests en el navegador (Playwright)

### T23 · API simulada para los avisos

- **Qué hace:** `mockApi` suma los handlers de `GET /api/documents/pending-review` y `POST /api/documents/:id/review`, atendidos **antes** que el detalle `/api/documents/:id`, y `pendingReviewResponse(...)`; los documentos de prueba aceptan `review`.
- **Cubre:** plan sección 8.4.
- **Archivos:** `e2e/support/mock-api.ts`, `e2e/smoke.spec.ts`.
- **Verificación:**
  - un caso nuevo en `e2e/smoke.spec.ts`: con los dos handlers, el responsable ve "Por revisar (1)", entra y ve la tarjeta, sin pedidos sin atender (`unhandled` vacío);
  - `pnpm --filter web test:e2e` sigue pasando completo.
- **Depende de:** T19, T20, T22
- **Commit:** `test(web): simular la API de los avisos de vencimiento`

### T24 · Escenarios de los avisos en el navegador

- **Qué hace:** cubre en Playwright, con la API simulada, en escritorio y celular, los escenarios de la spec que pasan por la pantalla.
- **Cubre:** E1 a E11 y E13; F1 a F6.
- **Archivos:** `e2e/avisos.spec.ts`.
- **Verificación:** se escriben los tests y pasan en los dos proyectos. Si pasan de entrada, se rompe a propósito una regla por escenario, de a una, para comprobar que su test falla, y se restaura.
  - **E1, E2, E3:** las etiquetas en el listado y en el detalle;
  - **E4:** un documento `DUE_SOON` con la fecha de hoy muestra "Vence pronto";
  - **E5:** como EMPLOYEE no responsable: sin etiquetas, sin "Por revisar" y sin "Marcar como revisado";
  - **E6** y **E7:** "Por revisar (N)" lleva a la lista, en el orden recibido;
  - **E8:** elige la fecha, marca, ve "Revisión registrada" y "Última revisión", y la etiqueta desaparece;
  - **E9, E10, E11:** los mensajes de 400, 403 y 409, con la fecha intacta;
  - **E13:** "No tenés documentos para revisar";
  - F6: en el celular, `document.documentElement.scrollWidth <= window.innerWidth` en el listado, el detalle y "Por revisar".
- **Depende de:** T23
- **Commit:** `test(web): cubrir los avisos de vencimiento en el navegador`

### T25 · Avisos contra la API real

- **Qué hace:** prueba de Playwright contra la API real, levantada contra la base de tests como en T28 de la spec 003 (`DATABASE_URL=<TEST_DATABASE_URL> pnpm dev:api`): el ADMIN carga un documento (`[e2e] … <id de la corrida>`, por la API a través del rewrite) con fecha de revisión dentro de 10 días, lo ve con "Vence pronto" y en "Por revisar", lo marca como revisado con una fecha dentro de 6 meses y la etiqueta desaparece. Las fechas se calculan con `tomorrowIn` en Buenos Aires; 10 días y 6 meses están lejos de cualquier borde.
- **Cubre:** E1, E6 y E8 de punta a punta; R4, R7, R8. E2 de punta a punta no se puede (la API no acepta fechas pasadas): queda en T11.
- **Archivos:** `e2e/integracion/avisos.spec.ts`.
- **Verificación:** con Docker, la API levantada así y `pnpm --filter web test:e2e:integracion`:
  - el ADMIN ve "Vence pronto" en la tarjeta y el documento en "Por revisar";
  - después de marcarlo, "Revisión registrada", "Última revisión" con su nombre y sin etiqueta;
  - una EMPLOYEE de Ventas abre el mismo documento y no ve la etiqueta ni "Marcar como revisado";
  - los tests de integración de las specs 002 a 004 siguen pasando.
- **Depende de:** T24
- **Commit:** `test(web): probar los avisos de vencimiento contra la API real`

## Verificación final

### T26 · Verificación de la feature

- **Qué hace:** corre todo, confirma que cada escenario tiene sus tests (tabla de abajo, se marca cada fila), revisa la migración y las pantallas en el celular, y anota el resultado.
- **Cubre:** spec sección 11 completa; plan sección 8.
- **Archivos:** `specs/005-avisos-vencimiento/tasks.md` (se marca la tabla y se anota el resultado).
- **Verificación:**
  1. **Backend:** `pnpm --filter api lint`, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api test` y `pnpm --filter api test:e2e`: todo en verde.
  2. **Frontend:** `pnpm --filter web lint`, `pnpm --filter web build`, `pnpm --filter web test` y `pnpm --filter web test:e2e`: todo en verde.
  3. **Contra la API real:** con Docker y la API levantada como en T25, `pnpm --filter web test:e2e:integracion` en verde. Incluye los tests de las specs 002 a 004.
  4. **Migración (D13):** `add_document_reviews` tiene solo el `ALTER TABLE`, e `indexes.e2e-spec.ts` está en verde (siguen los tres índices de `chunks` y `document_versions_one_current_idx`).
  5. **Hora:** la suite de `reviews.e2e-spec.ts` corre con el reloj en 23:30 de Argentina y 02:30 UTC; se comprueba que los tests de E4 y E9 fallan si `todayInCompany` usa UTC (mutación de control) y se restaura.
  6. **Tabla:** cada fila tiene sus tests, buscados por nombre, y pasan.
  7. **Celular:** a 375 px de ancho, el listado con etiquetas, el detalle con la sección "Revisión" y "Por revisar" no tienen desplazamiento horizontal.
  8. **`src/executions` sin cambios** en la rama: `git diff --stat develop...HEAD -- apps/api/src/executions` vacío (D20).
- **Depende de:** T01 a T25
- **Commit:** `docs(specs): verificar avisos de vencimiento`

#### Escenario → test

| Escenario | Unitario (API) | Integración (API) | Componente (web) | Playwright | ✔ |
| --- | --- | --- | --- | --- | --- |
| E1 · Documento por vencer | `review-status.spec.ts` › E1 (T03); `document-query.service.spec.ts` › E1 (T09) | `reviews.e2e-spec.ts` › E1 (T11) | `DocumentCard.test.tsx` › E1 (T16) | `avisos.spec.ts` › E1 (T24); `integracion/avisos.spec.ts` (T25) | ☐ |
| E2 · Documento vencido | `review-status.spec.ts` › E2 (T03); `document-query.service.spec.ts` › E2 (T09) | `reviews.e2e-spec.ts` › E2 (T11) | `DocumentCard.test.tsx` › E2 (T16); `DocumentDetail.review.test.tsx` › E2 (T17) | `avisos.spec.ts` › E2 (T24) | ☐ |
| E3 · Documento al día | `review-status.spec.ts` › E3 (T03) | `reviews.e2e-spec.ts` › E3 (T11) | `DocumentCard.test.tsx` › E3 (T16) | `avisos.spec.ts` › E3 (T24) | ☐ |
| E4 · La fecha de revisión es hoy | `review-status.spec.ts` › E4 (T03); `company-date.spec.ts` (T02) | `reviews.e2e-spec.ts` › E4, con el reloj en 23:30 de Argentina (T11) | — (lo decide la API) | `avisos.spec.ts` › E4 (T24) | ☐ |
| E5 · Un empleado no responsable no ve avisos | `document-access.policy.spec.ts` › `canReview` y `review-status.spec.ts` › `reviewFor` (T04); `document-query.service.spec.ts` › E5 (T09) | `reviews.e2e-spec.ts` › E5, sin la clave `review` (T11) | `DocumentCard.test.tsx` (T16); `DocumentDetail.review.test.tsx` (T17, T19); `PendingReviewLink.test.tsx` (T20) | `avisos.spec.ts` › E5 (T24); `integracion/avisos.spec.ts` (T25) | ☐ |
| E6 · Sección "Por revisar" | `document-query.service.spec.ts` › `pendingReview` (T09) | `reviews.repository.e2e-spec.ts` › orden (T06); `reviews.e2e-spec.ts` › E6 (T11) | `PendingReviewList.test.tsx` › E6 (T22) | `avisos.spec.ts` › E6 (T24); `integracion/avisos.spec.ts` (T25) | ☐ |
| E7 · El ADMIN ve todos los pendientes | `document-access.policy.spec.ts` › `pendingReviewWhere` (T04) | `reviews.e2e-spec.ts` › E7 (T11) | — | `avisos.spec.ts` › E7 (T24) | ☐ |
| E8 · Marcar como revisado | `document-lifecycle.service.spec.ts` › E8 (T10, T13) | `reviews.repository.e2e-spec.ts` › `markReviewed` (T06); `reviews.e2e-spec.ts` › E8 (T12) | `MarkReviewedForm.test.tsx` › E8 (T18); `DocumentDetail.review.test.tsx` › E8 (T17, T19) | `avisos.spec.ts` › E8 (T24); `integracion/avisos.spec.ts` (T25) | ☐ |
| E9 · Fecha inválida | `mark-reviewed.dto.spec.ts` y `document-lifecycle.service.spec.ts` › E9 (T10) | `reviews.e2e-spec.ts` › E9 (T12) | `MarkReviewedForm.test.tsx` › E9 (T18) | `avisos.spec.ts` › E9 (T24) | ☐ |
| E10 · Sin permiso para marcar | `document-lifecycle.service.spec.ts` › E10 (T10) | `reviews.e2e-spec.ts` › E10 (T12) | `MarkReviewedForm.test.tsx` › E10 (T18) | `avisos.spec.ts` › E10 (T24) | ☐ |
| E11 · Documento archivado | `review-status.spec.ts` › R2 (T03); `document-lifecycle.service.spec.ts` › E11 (T10) | `reviews.e2e-spec.ts` › archivado (T11) y E11 (T12) | `MarkReviewedForm.test.tsx` › E11 (T18); `DocumentDetail.review.test.tsx` › E11 (T19) | `avisos.spec.ts` › E11 (T24) | ☐ |
| E12 · Una versión nueva cuenta como revisión | — (repositorio) | `reviews.repository.e2e-spec.ts` › R10 (T07); `reviews.e2e-spec.ts` › E12, con el endpoint real (T12) | — (la pantalla es la del plan 003) | — | ☐ |
| E13 · Sin pendientes | `document-query.service.spec.ts` › `isReviewer` (T09) | `reviews.e2e-spec.ts` › E13 (T11) | `PendingReviewList.test.tsx` › E13 (T22); `PendingReviewLink.test.tsx` › E13 (T20) | `avisos.spec.ts` › E13 (T24) | ☐ |

Reglas y decisiones sin escenario propio, para no perderlas de vista:

| Regla o decisión | Tests que la cubren |
| --- | --- |
| R1 · Bordes de 30 días | `review-status.spec.ts` (T03); `reviews.e2e-spec.ts` › bordes (T11) |
| R5 · Paginado y orden estable | `reviews.repository.e2e-spec.ts` (T06); `reviews.e2e-spec.ts` › R5 (T11); `Pagination.test.tsx` (T21) |
| R8 · No toca versión, archivo ni fragmentos | `reviews.repository.e2e-spec.ts` (T06); `reviews.e2e-spec.ts` › E8 (T12) |
| R10 · Sin fecha, la última revisión no cambia | `reviews.repository.e2e-spec.ts` (T07); `reviews.e2e-spec.ts` › E12 (T12) |
| R11 · Nunca revisado | `reviews.repository.e2e-spec.ts` (T01); `DocumentDetail.review.test.tsx` (T17) |
| R12 · Auditoría con las dos fechas | `logger-audit-log.spec.ts`, `document-lifecycle.service.spec.ts` y `reviews.e2e-spec.ts` (T13) |
| R13 · 503 | `document-query.service.spec.ts` (T09); `document-lifecycle.service.spec.ts` (T10); `http-errors.spec.ts` (T10) |
| D2, D5 · "Hoy" sin depender de la hora | `company-date.spec.ts` (T02); `reviews.e2e-spec.ts` con el reloj fijo (T11, T12); mutación del paso 5 de T26 |
| D6 · Respuesta idéntica para los demás | `document.response.spec.ts` (T05); `reviews.e2e-spec.ts` › E5 (T11) |
| D13 · Migración sin `DROP INDEX` | `indexes.e2e-spec.ts` (T01) |
| D20 · Reloj propio, `src/executions` sin cambios | paso 8 de T26 |
| Caso borde: responsable sin acceso | `reviews.e2e-spec.ts` (T11, T12) |
| Caso borde: ADMIN responsable, una sola vez | `review-status.spec.ts` › `reviewFor` (T04); `reviews.e2e-spec.ts` › E7 (T11) |
| Caso borde: fecha nueva dentro de 30 días | `reviews.e2e-spec.ts` (T12) |
| Caso borde: dos revisiones a la vez | `reviews.e2e-spec.ts` › simultáneas (T13) |
| Caso borde: varias áreas | `reviews.e2e-spec.ts` (T11) |

---

## Orden y dependencias

```
Backend
T01 (migración, la aplica el usuario)
T02 (suelta) · T08 (suelta)
T03 ◄─ T02 · T04 ◄─ T03
T05 ◄─ T01, T04
T06 ◄─ T01, T05 · T07 ◄─ T06
T09 ◄─ T04, T05, T06, T08
T10 ◄─ T02, T04, T05, T06, T08
T11 ◄─ T09
T12 ◄─ T07, T10, T11
T13 ◄─ T12

Frontend
T21 (suelta)
T14 ◄─ T12
T15 ◄─ T14 · T18 ◄─ T14 · T20 ◄─ T14
T16 ◄─ T15 · T17 ◄─ T15
T19 ◄─ T17, T18
T22 ◄─ T16, T21

Playwright
T23 ◄─ T19, T20, T22 · T24 ◄─ T23 · T25 ◄─ T24

T26 ◄─ T01 a T25
```
