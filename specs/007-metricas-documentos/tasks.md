# Tareas 007 · Métricas de documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (30/10/2026):** T01 a T07 **hechas**. Sin commits: los hace el usuario. T01 a T06 son el backend y T07, la [verificación](#t07--verificación-de-la-feature). Sin pantallas ni Playwright: el panel es de la pareja B (D13).

Convenciones:

- Una tarea = un commit. Las rutas son relativas a `apps/api/`, salvo que digan otra cosa.
- R1 a R9 son reglas de la spec; E1 a E11, sus escenarios (tabla al principio del plan); D1 a D16, las decisiones del plan (sección 8.1). No hay preguntas abiertas.
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Commits:** tipo en inglés, ámbito `api` o `specs`, descripción en español y en infinitivo.
- **Ninguna tarea toca** `src/executions`, `apps/web/lib/metrics` ni `apps/web/components/metrics` (spec, sección 9). De `src/executions` solo se **importan** cuatro funciones, desde un único archivo (T02; D3). Ninguna toca `schema.prisma`, las migraciones, `main.ts` ni `app.module.ts`: no hace falta avisar al equipo antes de mergear, salvo el aviso a la pareja B de D4.
- Tests: `pnpm --filter api test <patrón>` y `pnpm --filter api test:e2e <patrón>`. Los de integración resetean `manual_test` antes de la suite, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA.
- **"Hoy" en los tests:** los unitarios del servicio reciben un `FixedClock` (el de `src/common/clock.ts`); la integración levanta la app con el reloj en `2026-11-10T02:30:00.000Z` (23:30 del 9/11 en Argentina, ya 10/11 en UTC) y usa las fechas literales de la sección 5 del plan.

---

## Backend

### T01 · Una sola definición de "por vencer" y de la zona de la empresa

- **Qué hace:**
  - `review-status.ts` suma `dueSoonThrough(today)` = `addDays(today, DUE_SOON_DAYS)`, y `reviewStatusOf` pasa a usarla;
  - `DocumentQueryService.pendingReview` calcula su límite con `toDbDate(dueSoonThrough(today))` en vez de `addDays(today, 30)`;
  - `company-date.ts` exporta `companyTimeZone()`, sin cambiarla.
- **Cubre:** R5; D7, D8; plan secciones 4.2 y 4.3.
- **Archivos:** `src/documents/review-status.ts`, `src/documents/review-status.spec.ts`, `src/documents/document-query.service.ts`, `src/documents/company-date.ts`, `src/documents/company-date.spec.ts`.
- **Verificación:** test primero:
  - `review-status.spec.ts`: `dueSoonThrough('2026-11-09')` → `2026-12-09`; `dueSoonThrough('2026-12-15')` → `2027-01-14`. Falla porque la función no existe;
  - `company-date.spec.ts`: `companyTimeZone()` → `America/Argentina/Buenos_Aires` sin `APP_TIMEZONE`, y `UTC` con `APP_TIMEZONE=UTC`. Falla porque no está exportada;
  - `review-status.spec.ts`, `document-query.service.spec.ts`, `document-access.policy.spec.ts` y `test/documents/reviews.e2e-spec.ts` (spec 005) pasan **sin cambios**: son la red de seguridad del cambio en `reviewStatusOf` y `pendingReview`.
- **Depende de:** —
- **Commit:** `refactor(api): compartir el límite de los documentos por vencer`
- **Estado:** hecha. Los 4 tests nuevos fallaron primero. `document-query.service.ts` deja de importar `addDays` y `DUE_SOON_DAYS`. `test:e2e reviews` (spec 005): 38 pasan sin cambios.

### T02 · Reglas de alcance y período, desde las métricas de la pareja B

- **Qué hace:** crea `src/documents/metrics/metrics-rules.ts`, el **único** archivo de documentos que importa de `src/executions`:
  - reexporta, sin modificarlas, `metricsScope` y `MetricsScope` (`executions/metrics/metrics-access.policy.ts`), y `toMetricsPeriod` e `isCalendarDate` (`executions/metrics/metrics-period.ts`);
  - suma `documentMetricsAreaIds(scope)`: `null` si `scope.all`, si no `scope.areaIds` (plan, sección 2.3).
- **Cubre:** R2, R3, R6, R7; D3; plan sección 2.
- **Archivos:** `src/documents/metrics/metrics-rules.ts`, `src/documents/metrics/metrics-rules.spec.ts`.
- **Verificación:** test primero, `metrics-rules.spec.ts`, importando **solo** de `./metrics-rules` (es el test de contrato con la pareja B):
  - `metricsScope`: ADMIN sin área → `{ all: true }` (**E1**); ADMIN con Operaciones → `[operaciones]` (**E3**); SUPERVISOR de Ventas sin área → `[ventas]` (**E2**); SUPERVISOR de Ventas con Operaciones → `null` (**E4**); SUPERVISOR sin áreas → `[]`; EMPLOYEE → `null` (**E5**);
  - `toMetricsPeriod('2026-10-10', '2026-10-31', 'America/Argentina/Buenos_Aires')` → `from = 2026-10-10T03:00:00.000Z`, `to = 2026-11-01T03:00:00.000Z` (**E9**, caso borde de las 23:30); sin fechas → `null` y `null`; solo `from` y solo `to`;
  - `isCalendarDate`: `2026-10-31` sí; `2026-02-30`, `01/10/2026` y `2026-10-27T10:00:00Z` no (**E10**);
  - `documentMetricsAreaIds`: `{ all: true }` → `null`; `{ all: false, areaIds: [ventas] }` → `[ventas]`; `[]` → `[]`.

  Falla porque el archivo no existe.
- **Depende de:** —
- **Commit:** `feat(api): reutilizar las reglas de alcance y período de las métricas`
- **Estado:** hecha. Falló primero (el archivo no existía); 16 tests. `src/executions` no se tocó: solo se importa.
- **Nota:** al terminar, avisar a Mayra (pareja B) que documentos importa esas cuatro funciones (D4). Lo manda Matías.

### T03 · Filtros de la consulta

- **Qué hace:** crea `DocumentMetricsQueryDto` con `areaId` (`@IsOptional()`, `@IsUUID('all')`), `from` y `to` (`@IsOptional()` y un `IsCalendarDate` propio, armado con `ValidateBy` sobre `isCalendarDate` de `metrics-rules.ts`, con el mensaje "$property debe ser una fecha AAAA-MM-DD que exista"). Swagger dice que `from` y `to` se aplican solo a `uploaded` (P1).
- **Cubre:** R7; D4; plan sección 3.1.
- **Archivos:** `src/documents/metrics/dto/document-metrics.query.ts`, `src/documents/metrics/dto/document-metrics.query.spec.ts`.
- **Verificación:** test primero, con `whitelist` y `forbidNonWhitelisted`, como el `ValidationPipe` global:
  - sin parámetros, y con `areaId`, `from` y `to` válidos → sin errores;
  - `areaId=ventas`, `from=2026-02-30`, `from=01/10/2026`, `to=2026-10-27T23:59:59Z` y `to=''` → error en ese campo (**E10**);
  - `userId` → error en `userId`.
- **Depende de:** T02
- **Commit:** `feat(api): validar los filtros de las métricas de documentos`
- **Estado:** hecha. Falló primero (el DTO no existía); 8 tests.

### T04 · Repositorio: los totales en una sola consulta

- **Qué hace:**
  - crea el puerto `DocumentMetricsRepository` con `totals(query: DocumentMetricsQuery): Promise<DocumentMetricsTotals>` (`areaIds`, `today`, `dueSoonThrough`, `uploadedFrom`, `uploadedTo`; plan, sección 4.1);
  - crea `PrismaDocumentMetricsRepository` y la función exportada `documentMetricsSql(query)`: un `SELECT` con `count(*) FILTER (…)::int` sobre `documents` `ACTIVE`, el alcance con `EXISTS` en `document_areas` (solo si `areaIds` no es `null`), la versión `CURRENT` en `FAILED` con otro `EXISTS`, `today` y `dueSoonThrough` como `${…}::date` (D8) y `uploaded` con `created_at >= from` y `< to`. Arma el resultado campo por campo; un error de disponibilidad → `RepositoryUnavailableError`;
  - `prisma-documents.repository.ts` exporta `isUnavailable`, sin cambiarla;
  - `test/documents/helpers.ts` suma `setProcessingStatus(prisma, versionId, status)` (D10).
- **Cubre:** R4, R5, R6, R9; P2, P4, P5; D5, D7, D8, D9, D10; plan secciones 4.1 a 4.3.
- **Archivos:** `src/documents/metrics/document-metrics.repository.ts`, `src/documents/metrics/prisma-document-metrics.repository.ts`, `src/documents/prisma-documents.repository.ts`, `test/documents/helpers.ts`, `test/documents/metrics.repository.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/metrics.repository.e2e-spec.ts`, contra la base de tests, con `cleanDocuments` antes de cada test y `today = '2026-11-09'`, `dueSoonThrough = '2026-12-09'`:
  - **E1:** Ventas `2027-02-07`, Operaciones `2026-11-19`, Ventas `2026-11-04`, `areaIds: null` → `active: 3`, `upToDate: 1`, `dueSoon: 1`, `overdue: 1`, `uploaded: 3`;
  - **E2/E3:** `areaIds: [ventas]` → 2; `[operaciones]` → 1;
  - **E6:** un documento con las dos áreas y `areaIds: [ventas, operaciones]` → `active: 1`; con `[operaciones]` y el documento solo en Ventas → 0;
  - **E7:** un archivado vencido, creado dentro del período → no cuenta en nada;
  - **E8:** `CURRENT` en `FAILED` → cuenta; `PENDING` y `READY` → no; `REPLACED` en `FAILED` con la `CURRENT` en `READY` → no; `processingFailed: 1`, y el `PENDING` sí cuenta en `active` y en su estado;
  - **E9:** con `uploadedFrom = 2026-10-10T03:00Z` y `uploadedTo = 2026-11-01T03:00Z`, los seis `createdAt` de la segunda tabla de la sección 5 del plan → `uploaded: 3`; sin límites, `uploaded = active`;
  - **E11** y `areaIds: []` → los seis en 0;
  - **consistencia (D7):** documentos en `2026-11-04`, `2026-11-08`, `2026-11-09`, `2026-11-19`, `2026-12-09`, `2026-12-10` y `2027-02-07` → `overdue: 2`, `dueSoon: 3`, `upToDate: 2`, y los tres iguales a contar `reviewStatusOf` sobre esas fechas;
  - **una sola consulta:** con `jest.spyOn(prisma, '$queryRaw')`, una llamada;
  - los demás `*.repository.e2e-spec.ts` de documentos pasan sin cambios.

  Falla porque el repositorio no existe.
- **Depende de:** T01, T02
- **Commit:** `feat(api): contar las métricas de documentos en la base`
- **Estado:** hecha. Falló primero (el repositorio no existía); 10 tests. La versión `REPLACED` en error de E8 se arma en el test con `prisma.documentVersion` (pasa la primera a `REPLACED` y crea una `CURRENT` en `READY`), sin cambiar `seedDocument`. `uploaded` con solo `from` y solo `to` también se prueba acá (4 y 5 de los seis bordes).

### T05 · Servicio y respuesta

- **Qué hace:**
  - `HttpOperation` suma `'métricas'` → "la consulta de las métricas" (D15);
  - crea `DocumentMetricsService` (`UsersDirectory`, `DocumentMetricsRepository` y `Clock`), con el orden de la sección 3.2 del plan: `from > to` → 400; áreas del directorio; `metricsScope` (`null` → 404 "No se encontró el área"; para el ADMIN, un área que no existe sigue de largo y da ceros, sin buscarla: D14); `today = todayInCompany(clock.now())` una vez; `totals({ areaIds: documentMetricsAreaIds(scope), today, dueSoonThrough: dueSoonThrough(today), …toMetricsPeriod(from, to, companyTimeZone()) })`; devuelve `{ filters, totals }`. Todo dentro de `toHttpException(error, logger, 'métricas')`;
  - crea `document-metrics.response.ts`: `DocumentMetricsFiltersResponse`, `DocumentMetricsTotalsResponse` y `DocumentMetricsResponse` (Swagger, con nombres propios; D4, D6) y `toDocumentMetricsResponse(view)`, campo por campo.
- **Cubre:** R2, R3, R5 a R9; D4, D6, D11, D14, D15; plan secciones 3.2 y 3.3.
- **Archivos:** `src/documents/http-errors.ts`, `src/documents/http-errors.spec.ts`, `src/documents/metrics/document-metrics.service.ts`, `src/documents/metrics/document-metrics.service.spec.ts`, `src/documents/metrics/dto/document-metrics.response.ts`, `src/documents/metrics/dto/document-metrics.response.spec.ts`.
- **Verificación:** test primero:
  - `http-errors.spec.ts`: el 503 con `'métricas'` es "No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.", el mismo texto que el de la pareja B;
  - `document-metrics.service.spec.ts`, con `InMemoryUsersDirectory`, un repositorio falso que guarda lo que le piden y un `FixedClock` en `2026-11-10T02:30:00.000Z`:
    - **E1:** el ADMIN pide `areaIds: null`, `today: '2026-11-09'`, `dueSoonThrough: '2026-12-09'` y el período en `null`;
    - **E2:** el SUPERVISOR de Ventas pide `[ventas]`, con las áreas del directorio y no las de la sesión;
    - **E3:** el ADMIN con Operaciones pide `[operaciones]`; `filters.areaId` es Operaciones y `from`/`to` son `null`;
    - **E4:** SUPERVISOR de Ventas con Operaciones → 404 "No se encontró el área" sin llamar al repositorio; ADMIN con un UUID que no es un área → pide `[ese UUID]` al repositorio, devuelve sus ceros y `filters.areaId` = ese UUID (D14);
    - **E9:** `2026-10-10`..`2026-10-31` llega como `2026-10-10T03:00Z` y `2026-11-01T03:00Z`;
    - **E10:** `from > to` → 400 con su mensaje, sin llamar al directorio ni al repositorio; `from = to` es válido;
    - un usuario que el directorio no conoce → `areaIds: []`;
    - directorio de usuarios o repositorio con `RepositoryUnavailableError` → 503; un `Error` cualquiera → 500, sin la causa en el mensaje y con la causa en el log;
  - `document-metrics.response.spec.ts`: con una vista que trae un campo de más, la respuesta es exactamente `filters` y los seis totales (`toStrictEqual`).
- **Depende de:** T02, T04
- **Commit:** `feat(api): calcular las métricas de documentos`
- **Estado:** hecha. Fallaron primero los 3 de `http-errors.spec.ts` y las dos suites nuevas (no existían). 78 tests en las 6 suites que se corrieron. El servicio recibe `UsersDirectory`, `DocumentMetricsRepository` y el `Clock` de `src/common/clock.ts`; el método se llama `documents(user, filters)`. Además de los casos de la tarea: SUPERVISOR con un área que no existe → el mismo 404, y el 500 deja la causa en el log.

### T06 · Endpoint `GET /api/metrics/documents`

- **Qué hace:**
  - crea `DocumentMetricsController`: `@ApiTags('metrics')`, `@ApiBearerAuth()`, `@Controller('metrics')`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('ADMIN', 'SUPERVISOR')` y `@Get('documents')` con `DocumentMetricsQueryDto`, `@CurrentUser()` y `@ApiResponse` para 200, 400, 401, 403, 404 y 503. Sin lógica: pasa `areaId`, `from` y `to` al servicio y mapea con `toDocumentMetricsResponse`;
  - `DocumentsModule` suma el controlador, `DocumentMetricsService` y `{ provide: DocumentMetricsRepository, useClass: PrismaDocumentMetricsRepository }`.
- **Cubre:** R1 a R9; E1 a E11 a nivel API; D1, D2, D11, D12; plan secciones 1, 3 y 5.2.
- **Archivos:** `src/documents/metrics/document-metrics.controller.ts`, `src/documents/documents.module.ts`, `test/documents/metrics.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/metrics.e2e-spec.ts`, con Supertest, la base de tests y `createDocumentsTestApp({ clock: new FixedClock(new Date('2026-11-10T02:30:00.000Z')) })` (plan, sección 5.2):
  - **E1:** ADMIN sin filtros → 200, `active: 3`, `upToDate: 1`, `dueSoon: 1`, `overdue: 1` y `filters` todo `null`;
  - **E2:** `supervisorVentas` → solo Ventas; `supervisorOperaciones` → solo Operaciones;
  - **E3:** ADMIN con Operaciones → solo Operaciones y `filters.areaId` = Operaciones;
  - **E4:** `supervisorVentas` con Operaciones → 404 "No se encontró el área"; `supervisorVentas` con un UUID que no es un área → el mismo 404; ADMIN con ese UUID → 200, los seis en 0 y `filters.areaId` = ese UUID (D14);
  - **E5:** `empleadoVentas` → 403; sin sesión → 401;
  - **E6:** un documento con Ventas y Operaciones → `active: 1` para el ADMIN y para un SUPERVISOR de las dos áreas (creado en el test, como en T11 de la spec 005, y borrado al terminar); con Operaciones y el documento solo en Ventas → 0;
  - **E7:** archivado vencido creado en el período → no cuenta en `active`, `overdue` ni `uploaded`;
  - **E8:** `processingFailed: 1` con una `CURRENT` en `FAILED` y otra `PENDING`;
  - **E9:** cargados el 1/10, el 15/10 y el 31/10 a las 23:30 de Argentina, `from=2026-10-10&to=2026-10-31` → `uploaded: 2` y `active: 3`; bordes del período (02:59:59.999Z del 10/10 y 03:00Z del 1/11) fuera;
  - **E10:** `from=2026-10-31&to=2026-10-01` → 400 "La fecha de inicio no puede ser posterior a la fecha de fin"; `from=2026-02-30`, `areaId=ventas` y `userId=x` → 400;
  - **E11:** solo documentos de Ventas, ADMIN con Operaciones → 200 y los seis en 0;
  - SUPERVISOR sin áreas (creado en el test) → 200 y todo en 0;
  - bordes de R1 de la spec 005: las siete fechas de la sección 5 del plan → `overdue: 2`, `dueSoon: 3`, `upToDate: 2` (con "hoy" en UTC, `2026-11-09` pasaría a `overdue`);
  - R2: un SUPERVISOR creado en Ventas, pasado a Operaciones en la base con el token ya firmado → cuenta Operaciones;
  - ruta: `GET /api/metrics/procedures` sigue respondiendo 200 al ADMIN;
  - las suites de las specs 001 a 006 y `test/executions/metrics.e2e-spec.ts` pasan sin cambios.

  Falla con 404 en todos los casos, porque la ruta no existe.
- **Depende de:** T03, T05
- **Commit:** `feat(api): exponer las métricas de documentos`
- **Estado:** hecha. Antes del controlador fallaban 16 de 17 (404: la ruta no existía; el que pasaba era el de `/api/metrics/procedures`). Con el controlador, 17 de 17. Además de la tarea: "bordes del período" con 23:59:59.999 del 31/10, y solo `from` / solo `to` por HTTP. Con todo junto: `pnpm test` 79 suites, 1194 tests; `pnpm test:e2e` 24 suites, 368 tests, todos pasan.

## Verificación final

### T07 · Verificación de la feature

- **Qué hace:** corre todo, confirma que cada escenario tiene sus tests (tabla de abajo, se marca cada fila), hace las mutaciones de control y anota el resultado en este archivo.
- **Cubre:** spec sección 11 completa; plan secciones 5 y 6.
- **Archivos:** `specs/007-metricas-documentos/tasks.md`.
- **Verificación:**
  1. `pnpm --filter api lint`, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api test` y `pnpm --filter api test:e2e`: todo en verde (los errores de `tsc` que ya estaban en `HEAD` en `src/auth`, de la pareja A, se anotan y no se tocan).
  2. **Swagger:** `/api/docs` muestra `GET /api/metrics/documents` bajo `metrics`, con sus seis códigos y los esquemas `DocumentMetricsResponse`, sin pisar los de procedimientos.
  3. **Mutaciones de control**, una por vez, restaurando antes de la siguiente; cada una tiene que hacer fallar al menos un test:
     - "hoy" en UTC (`timeZone: 'UTC'` en `todayInCompany`) → bordes de R1 en `metrics.e2e-spec.ts`;
     - `JOIN document_areas` en vez de `EXISTS` → **E6**;
     - sin `d.status = 'ACTIVE'` → **E7**;
     - sin `v.status = 'CURRENT'` → **E8** (la `REPLACED` en `FAILED`);
     - `<=` en vez de `<` en el fin del período → bordes del período;
     - ADMIN con área inexistente respondiendo 404 (una búsqueda del área agregada a mano) → **E4** del ADMIN (D14);
     - `today` como `Date` en vez de `::date`, con la sesión de la base en otra zona (`SET TIME ZONE 'Asia/Tokyo'` en la conexión de la prueba) → se anota si se detecta; si no, se deja constancia de que D8 se sostiene por revisión.
  4. **Tabla:** cada fila tiene sus tests, buscados por nombre, y pasan.
  5. **Archivos de la pareja B sin cambios:** `git diff --stat develop...HEAD -- apps/api/src/executions apps/web/lib/metrics apps/web/components/metrics` vacío; y `src/executions` solo aparece en los `import` de `src/documents/metrics/metrics-rules.ts` (`grep -rn "executions" src/documents`).
  6. **Avisos:** a Mayra, el contrato de R8 (spec, sección 10) y la dependencia de D4.
- **Depende de:** T01 a T06
- **Commit:** `docs(specs): verificar métricas de documentos`
- **Estado:** hecha (30/10/2026). El resultado, las mutaciones y los pendientes están en la sección [Verificación](#verificación).

#### Escenario → test

| Escenario | Unitario | Integración | ✔ |
| --- | --- | --- | --- |
| E1 · El ADMIN ve los totales de todas las áreas | `metrics-rules.spec.ts` › E1 (T02); `document-metrics.service.spec.ts` › E1 (T05) | `metrics.repository.e2e-spec.ts` › E1 (T04); `metrics.e2e-spec.ts` › E1 (T06) | ☑ |
| E2 · El SUPERVISOR ve solo sus áreas | `metrics-rules.spec.ts` › E2 (T02); `document-metrics.service.spec.ts` › E2 (T05) | `metrics.repository.e2e-spec.ts` › E2/E3 (T04); `metrics.e2e-spec.ts` › E2 (T06) | ☑ |
| E3 · Filtro por área | `metrics-rules.spec.ts` › E3 (T02); `document-metrics.service.spec.ts` › E3 (T05) | `metrics.e2e-spec.ts` › E3 (T06) | ☑ |
| E4 · Área ajena o inexistente | `metrics-rules.spec.ts` › E4 (T02); `document-metrics.service.spec.ts` › E4 (T05) | `metrics.e2e-spec.ts` › E4 (T06) | ☑ |
| E5 · Un empleado no tiene acceso | `metrics-rules.spec.ts` › E5 (T02) | `metrics.e2e-spec.ts` › E5, 403 y 401 (T06) | ☑ |
| E6 · Documento con varias áreas | — (lo decide la consulta) | `metrics.repository.e2e-spec.ts` › E6 (T04); `metrics.e2e-spec.ts` › E6 (T06) | ☑ |
| E7 · Los archivados no cuentan | — | `metrics.repository.e2e-spec.ts` › E7 (T04); `metrics.e2e-spec.ts` › E7 (T06) | ☑ |
| E8 · Error de procesamiento | — | `metrics.repository.e2e-spec.ts` › E8 (T04); `metrics.e2e-spec.ts` › E8 (T06) | ☑ |
| E9 · Cargados en el período | `metrics-rules.spec.ts` › `toMetricsPeriod` (T02); `document-metrics.service.spec.ts` › E9 (T05) | `metrics.repository.e2e-spec.ts` › E9 (T04); `metrics.e2e-spec.ts` › E9 y bordes del período (T06) | ☑ |
| E10 · Fechas inválidas | `metrics-rules.spec.ts` › `isCalendarDate` (T02); `document-metrics.query.spec.ts` (T03); `document-metrics.service.spec.ts` › E10 (T05) | `metrics.e2e-spec.ts` › E10 (T06) | ☑ |
| E11 · Sin documentos | — | `metrics.repository.e2e-spec.ts` › E11 (T04); `metrics.e2e-spec.ts` › E11 (T06) | ☑ |

Reglas, decisiones y casos borde sin escenario propio:

| Regla, decisión o caso | Tests que lo cubren | ✔ |
| --- | --- | --- |
| R2 · Áreas del directorio, no de la sesión | `document-metrics.service.spec.ts` › E2 (T05); `metrics.e2e-spec.ts` › R2 (T06) | ☑ |
| R5 · Bordes de "por vencer" en hora de Argentina | `review-status.spec.ts` › `dueSoonThrough` (T01); `metrics.repository.e2e-spec.ts` › consistencia (T04); `metrics.e2e-spec.ts` › bordes (T06); mutación del paso 3 | ☑ |
| R6 · Caso borde de las 23:30 del día `to` | `metrics-rules.spec.ts` (T02); `metrics.e2e-spec.ts` › E9 (T06) | ☑ |
| R8 · Solo `filters` y los seis totales | `document-metrics.response.spec.ts` (T05) | ☑ |
| R9 · 503 y 500 | `http-errors.spec.ts` y `document-metrics.service.spec.ts` (T05) | ☑ |
| D3 · Contrato con las funciones de la pareja B | `metrics-rules.spec.ts` (T02); paso 5 de T07 | ☑ |
| D9 · Una sola consulta | `metrics.repository.e2e-spec.ts` (T04) | ☑ |
| D14 · Área inexistente para el ADMIN: 200 con ceros | `document-metrics.service.spec.ts` › E4 (T05); `metrics.e2e-spec.ts` › E4 (T06); mutación del paso 3 | ☑ |
| D15 · Texto del 503, igual al de procedimientos | `http-errors.spec.ts` (T05) | ☑ |
| D16 · `uploaded` por `documents.created_at` | `metrics.repository.e2e-spec.ts` › E9 (T04); `metrics.e2e-spec.ts` › E9 (T06) | ☑ |
| Caso borde: versión vigente sin procesar | `metrics.repository.e2e-spec.ts` › E8 (T04) | ☑ |
| Caso borde: cargado en el período y después archivado | `metrics.e2e-spec.ts` › E7 (T06) | ☑ |
| Caso borde: SUPERVISOR sin áreas | `metrics.repository.e2e-spec.ts` (T04); `metrics.e2e-spec.ts` (T06) | ☑ |
| `GET /api/metrics/procedures` sigue igual | `metrics.e2e-spec.ts` › ruta (T06); `test/executions/metrics.e2e-spec.ts` sin cambios | ☑ |

---

## Verificación

Corrida completa del 30/10/2026, en la rama `feat/metricas-documentos`, con T01 a T07 sin commitear. Cada fila de la tabla de T07 se buscó por nombre de test; todos pasan.

### Totales

| Qué | Comando | Resultado |
| --- | --- | --- |
| API, lint | `oxlint --type-aware src/ test/` | sin avisos |
| API, tipos | `tsc --noEmit` | 3 errores, los mismos que en `HEAD`, en `src/auth/*.spec.ts` (pareja A); ninguno en archivos de esta spec |
| API, formato | `prettier --check` sobre los archivos nuevos y tocados | en verde, salvo `http-errors.spec.ts` y `document-query.service.ts`, que ya fallaban en `HEAD` y no se reformatean |
| API, unitarios | `pnpm --filter api test` | 79 suites, **1194 tests**, todos pasan (46 nuevos: 39 en `src/documents/metrics`, 4 de T01 y 3 de `http-errors.spec.ts`) |
| API, integración | `pnpm --filter api test:e2e` | 24 suites, **368 tests**, todos pasan (antes: 22 suites, 341). Contra `manual_test`, con `prisma migrate reset` antes de cada corrida. Incluye `reviews*.e2e-spec.ts` (spec 005) y `test/executions/metrics.e2e-spec.ts` sin cambios |
| Swagger | `GET /docs-json` en la app de tests | `/api/metrics/documents` bajo `metrics`, con 200, 400, 401, 403, 404 y 503; esquemas `DocumentMetricsResponse`, `DocumentMetricsFiltersResponse` y `DocumentMetricsTotalsResponse` junto a los de procedimientos, que siguen ahí |

### Mutaciones de control

Una por vez, con copia del archivo y restaurándolo antes de la siguiente. Con cada una se corrieron los unitarios de `src/documents` y `test:e2e documents/(metrics|reviews)`. Todas fueron detectadas.

| Mutación | Archivo | Tests que fallaron |
| --- | --- | --- |
| Contar archivados: `WHERE TRUE` en vez de `d.status = 'ACTIVE'` | `prisma-document-metrics.repository.ts` | 2 de integración: E7 en las dos suites |
| Contar dos veces un documento con dos áreas: `JOIN document_areas` en vez de `EXISTS` | `prisma-document-metrics.repository.ts` | 2 de integración: E6 en las dos suites |
| "Hoy" en UTC: `timeZone: 'UTC'` en `todayInCompany` | `company-date.ts` | 9 unitarios (entre ellos E1 de `DocumentMetricsService` y los de la fecha de las specs 001, 003 y 005) y 4 de integración (R5 de las métricas; E4, E9 y bordes de la spec 005) |
| Un SUPERVISOR ve un área ajena: se le suma el área pedida a las suyas antes de `metricsScope` | `document-metrics.service.ts` | 2 unitarios (E4 ajena y E4 inexistente) y 1 de integración (E4) |
| Sin `v.status = 'CURRENT'` | `prisma-document-metrics.repository.ts` | 1 de integración: E8 del repositorio (la `REPLACED` en error) |
| `<=` en el fin del período | `prisma-document-metrics.repository.ts` | 2 de integración: E9 del repositorio y "bordes del período" |
| 404 para el ADMIN con un área que no existe | `document-metrics.service.ts` | 1 unitario (E4, D14) y 1 de integración (E4) |

La primera versión de la mutación del `JOIN` dejó `da` sin unir: fallaron 13 tests, pero por error de SQL y no por contar dos veces, así que no cuenta. Se rehízo con el `JOIN` en el `FROM`.

### Pendientes

- **`today` como `Date` en vez de `::date` (D8):** no se probó por mutación. La base de tests corre con la sesión en UTC, donde un `Date` a medianoche UTC compara igual y ningún test lo detectaría; fijar otra zona de sesión obligaría a tocar la conexión de `PrismaService`. D8 se sostiene por revisión: la consulta solo recibe `today` y `dueSoonThrough` como texto con `::date`.
- **Archivos de la pareja B:** `git status` y `git diff --stat develop...HEAD` sobre `apps/api/src/executions`, `apps/web/lib/metrics` y `apps/web/components/metrics` están vacíos; `src/executions` solo aparece en los `import` de `src/documents/metrics/metrics-rules.ts`. Hay que volver a mirarlo después de los commits.
- **Avisos a Mayra (pareja B):** el contrato de R8, con el ejemplo de respuesta; la dependencia de D4 (documentos importa `metricsScope`, `MetricsScope`, `toMetricsPeriod` e `isCalendarDate`); y que su adaptador `DocumentMetrics` tiene que pasar a la forma de R8. Los manda Matías.

---

## Orden y dependencias

```
T01 (suelta) · T02 (suelta)
T03 ◄─ T02
T04 ◄─ T01, T02
T05 ◄─ T02, T04
T06 ◄─ T03, T05
T07 ◄─ T01 a T06
```
