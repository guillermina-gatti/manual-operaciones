# Plan 007 · Métricas de documentos

- **Spec:** [spec.md](./spec.md) (HU38, parte de la pareja C)
- **Planes de referencia:** [plan 001](../001-carga-documentos/plan.md) (documentos, áreas y directorios), [plan 004](../004-busqueda-documentos/plan.md) (consulta en SQL con alcance por áreas) y [plan 005](../005-avisos-vencimiento/plan.md) ("hoy" en hora de Argentina, reloj inyectable y estado de revisión). Del lado de la pareja B, el endpoint de métricas de procedimientos (`apps/api/src/executions/metrics/`).
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** revisado el 30/10/2026, listo para dividir en tareas. Sin código. Las decisiones están en la sección 8.1; no quedan preguntas abiertas (sección 8.2).

En este plan, R1 a R9 son reglas de esta spec; P1 a P7, sus decisiones (spec, sección 10); E1 a E11, sus escenarios (sección 11, en el orden en que aparecen); y D1 a D16, las decisiones de este plan (sección 8.1). D14 a D16 salen de las preguntas Q1 a Q3 de la primera versión del plan, cerradas en su revisión. Las reglas y decisiones de otros planes se citan con su número y el plan ("R1 de la spec 005", "D5 del plan 005").

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | El ADMIN ve los totales de todas las áreas | E7 | Los archivados no cuentan |
| E2 | El SUPERVISOR ve solo sus áreas | E8 | Error de procesamiento |
| E3 | Filtro por área | E9 | Cargados en el período |
| E4 | Área ajena o inexistente | E10 | Fechas inválidas |
| E5 | Un empleado no tiene acceso | E11 | Sin documentos |
| E6 | Documento con varias áreas | | |

## 0. Punto de partida

**Lo de la pareja B (`apps/api/src/executions/metrics`), que esta spec replica y no modifica**

- `ProcedureMetricsController`: `@Controller('metrics')`, `@UseGuards(JwtAuthGuard, RolesGuard)` y `@Roles('ADMIN', 'SUPERVISOR')` en la clase; `@Get('procedures')`. Sin sesión, 401; EMPLOYEE, 403 (el guard, antes del servicio). Su comentario de cabecera ya prevé que la pareja C exponga `/metrics/documents` "en su propio módulo".
- `ProcedureMetricsQueryDto`: `areaId` (`@IsUUID('all')`), `from` y `to` con un validador `IsCalendarDate` **no exportado**, armado sobre `isCalendarDate` de `metrics-period.ts`. El `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) rechaza parámetros de más.
- `ProcedureMetricsService.build`, en este orden:
  1. `from > to` (comparando el texto `YYYY-MM-DD`) → 400 "La fecha de inicio no puede ser posterior a la fecha de fin", sin leer nada;
  2. las áreas del usuario, de `UsersDirectory.findById` (nunca de la sesión); un usuario que el directorio no conoce queda sin áreas;
  3. `metricsScope(role, viewerAreaIds, areaId)`; `null` → 404 "No se encontró el área";
  4. la consulta, con `toMetricsPeriod(from, to, timeZone)`;
  5. todo dentro de `toHttpException(error, logger, 'metrics')`: `HttpException` pasa; una dependencia caída es 503 "No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde."; lo demás, 500, con la causa solo en el log.
- `metricsScope` (función pura, solo importa el tipo `Role`): ADMIN sin área → `{ all: true }`; ADMIN con área → `{ all: false, areaIds: [areaId] }` **sin comprobar que exista**; SUPERVISOR sin área → sus áreas; con una de sus áreas → esa; con otra → `null`; EMPLOYEE → `null`.
- `toMetricsPeriod(from, to, timeZone)` (función pura, sin imports): `[from, to)` en instantes, con `from` al comienzo de su día y `to` al comienzo del día siguiente, en la zona recibida; `null` del lado que no vino. Con `America/Argentina/Buenos_Aires`, `2026-10-01` → `2026-10-01T03:00:00.000Z`.
- `PrismaExecutionMetricsRepository`: cuenta en PostgreSQL con `count(*) FILTER (WHERE …)::int` y `$queryRaw`, sin traer filas a Node; un error de disponibilidad pasa a ser un error propio, que el servicio convierte en 503.
- Sus tests: `metrics-access.policy.spec.ts` (alcances), `metrics-period.spec.ts`, `procedure-metrics.query.spec.ts` (DTO), `procedure-metrics.service.spec.ts` (con su propio `FixedClock` y repositorio falso) y `procedure-metrics.controller.spec.ts` (HTTP con el servicio simulado).

**Documentos (`apps/api/src/documents`)**

- `company-date.ts` (plan 005, 1.2): `todayInCompany(now)`, `addDays` y `toDbDate`. La zona (`APP_TIMEZONE`, por defecto Buenos Aires) la resuelve `companyTimeZone()`, **privada**.
- `review-status.ts` (plan 005, 1.1): `DUE_SOON_DAYS = 30` y `reviewStatusOf(document, today)`, que compara texto `YYYY-MM-DD`: `< today` → `OVERDUE`; `<= today + 30` → `DUE_SOON`; si no, `UP_TO_DATE`. `DocumentQueryService.pendingReview` calcula su límite por separado, con `addDays(today, 30)`.
- `src/common/clock.ts`: el `Clock` de documentos (D20 del plan 005), registrado en `DocumentsModule`. Las suites de integración lo fijan con `createDocumentsTestApp({ clock: new FixedClock(…) })`.
- `UsersDirectory.findById(id)` ya está en `DocumentsModule`, con su adaptador de Prisma. Un directorio caído lanza `RepositoryUnavailableError`.
- `http-errors.ts`: `toHttpException(error, logger, operation)` con `HttpOperation` y sus frases; mismo texto de 503 que el de la pareja B ("No se pudo completar <frase>. Intentá de nuevo más tarde.").
- `prisma-documents.repository.ts`: `isUnavailable(error)` existe pero es privada. `searchRankingSql` ya filtra por áreas con `EXISTS (SELECT 1 FROM document_areas da WHERE da.document_id = d.id AND da.area_id = ANY(${areaIds}::uuid[]))`.
- **Base:** `documents.status` y `documents.created_at` tienen índice; `document_areas` tiene clave `(document_id, area_id)` e índice en `area_id`; `document_versions` tiene como máximo una `CURRENT` por documento (`document_versions_one_current_idx`) y `processing_status` indexado. Esta spec **no cambia el esquema**.
- **Tests:** `test/documents/helpers.ts` tiene `FixedClock`, `createDocumentsTestApp`, `cleanDocuments`, `seedDocument` (con `areaIds`, `status`, `createdAt` y `reviewDate`) y `authHeaders`. Los fixtures tienen dos áreas (`AREA_IDS.ventas`, `AREA_IDS.operaciones`) y un usuario por rol y área.

**Web (pareja B, fuera de alcance):** `apps/web/lib/metrics/team-c-metrics.ts` declara `DocumentMetrics { active, consulted, processingFailed }` como propuesta. La adapta la pareja B a R8 (spec, sección 10); esta spec no toca `apps/web`.

## 1. Dónde vive el endpoint (D1, D2)

Dentro de documentos, en una carpeta propia, como `metrics/` dentro de `executions`:

```
apps/api/src/documents/
├── metrics/
│   ├── document-metrics.controller.ts        GET /metrics/documents, sin lógica
│   ├── document-metrics.service.ts           el caso de uso (sección 3)
│   ├── document-metrics.repository.ts        el puerto: totals(query) → DocumentMetricsTotals
│   ├── prisma-document-metrics.repository.ts la consulta (sección 4)
│   ├── metrics-rules.ts                      el único archivo que importa de src/executions (sección 2)
│   └── dto/
│       ├── document-metrics.query.ts         areaId, from, to
│       └── document-metrics.response.ts      filters + totals, campo por campo
├── documents.module.ts                       + el controlador, el servicio y el repositorio
├── review-status.ts                          + dueSoonThrough(today) (sección 4.3)
├── company-date.ts                           + export de companyTimeZone
├── http-errors.ts                            + la operación 'métricas'
└── prisma-documents.repository.ts            + export de isUnavailable
```

- **En `DocumentsModule`, no en un módulo nuevo** (D1): el servicio necesita `UsersDirectory` y el `Clock` de documentos, que ya están ahí. Un módulo aparte tendría que volver a registrarlos o exportarlos. `DocumentsModule` pasa a `controllers: [DocumentsController, DocumentMetricsController]`.
- **Un controlador propio, no un método en `DocumentsController`** (D2): ese controlador tiene `@Controller('documents')` y guards sin `@Roles` (cualquier usuario con sesión), y la ruta del contrato es `/api/metrics/documents`. `DocumentMetricsController` lleva `@Controller('metrics')`, `@Get('documents')` y los mismos decoradores de clase que el de la pareja B (`@ApiTags('metrics')`, `@ApiBearerAuth()`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('ADMIN', 'SUPERVISOR')`). Dos controladores con el prefijo `metrics` en módulos distintos no chocan: las rutas completas son distintas, y en Swagger quedan bajo la misma etiqueta.
- **Un puerto de repositorio propio** (`DocumentMetricsRepository`), no un método más en `DocumentsRepository` (D5): como el `ExecutionMetricsRepository` de la pareja B, separa la lectura agregada de las operaciones sobre un documento, y los tests unitarios del servicio usan un falso de un solo método.

## 2. Qué se reutiliza de la pareja B (D3, D4)

### 2.1 Opciones

| | A · Importar sin modificar | B · Replicar |
| --- | --- | --- |
| Qué | `metricsScope`, `MetricsScope`, `toMetricsPeriod`, `isCalendarDate` | Copiar las cuatro a `src/documents/metrics` |
| Reglas iguales a las de procedimientos (P3) | Por construcción: es el mismo código | Hasta que una de las dos copias cambie |
| Riesgo | Si la pareja B cambia una función, cambian las métricas de documentos | Divergencia silenciosa; ~90 líneas duplicadas, entre ellas el cálculo del comienzo del día con el desfase de la zona (`startOfDay`, `offsetMs`), que es lo más delicado |
| Acoplamiento de módulos | Solo de archivos: las dos son funciones puras (una importa el tipo `Role` de `common/auth`, la otra nada). No se importa ningún módulo, servicio ni token de Nest de `executions` | Ninguno |

### 2.2 Propuesta: A, con un solo punto de entrada y tests de contrato

- **Se importan, sin modificarlas**, `metricsScope` y `MetricsScope` (`metrics-access.policy.ts`), `toMetricsPeriod` e `isCalendarDate` (`metrics-period.ts`). Son exactamente las reglas que P3 pide replicar, y son puras.
- **Un solo archivo las importa:** `src/documents/metrics/metrics-rules.ts` las reexporta y suma lo propio de documentos (2.3). El resto de `src/documents` importa de ahí. Si la pareja B las mueve o las renombra, se cambia un archivo.
- **Tests de contrato** en `metrics-rules.spec.ts`: fijan el comportamiento del que depende esta spec (los alcances de R2 y R3, el período de R6 en hora de Argentina, las fechas de R7). Si la pareja B cambia una regla, falla un test de documentos y no una métrica en producción sin aviso.
- **No se reutilizan** (D4):
  - el validador `IsCalendarDate` del DTO: no está exportado, y exportarlo sería modificar su archivo. Se arma uno igual en `document-metrics.query.ts` sobre `isCalendarDate`, con el mismo mensaje ("$property debe ser una fecha AAAA-MM-DD que exista");
  - `toHttpException` de `executions/http-errors.ts`: documentos tiene el suyo, con el mismo texto de 503. Se suma la operación `'métricas'` → "la consulta de las métricas", que da exactamente el mensaje de la pareja B;
  - `DEFAULT_TIME_ZONE` y el `Clock` de `executions`: documentos tiene su zona (`companyTimeZone`, que pasa a exportarse) y su reloj (D20 del plan 005);
  - las clases de respuesta (`MetricsFiltersResponse`): tendrían en Swagger el nombre de la pareja B y su descripción de procedimientos. Se crean `DocumentMetricsFiltersResponse` y `DocumentMetricsTotalsResponse`, con nombres propios para que los esquemas de Swagger no choquen.
- **Lo que nunca se toca:** ningún archivo de `src/executions`, `apps/web/lib/metrics` ni `apps/web/components/metrics`. La tarea de verificación lo comprueba con `git diff --stat`.
- **Aviso a la pareja B (Mayra):** que documentos importa esas cuatro funciones, para que un cambio en ellas se acuerde (D4). Lo manda Matías.

### 2.3 Lo propio de documentos en `metrics-rules.ts`

```ts
// R2: las áreas por las que se cuenta. null = todas (ADMIN sin areaId), como SearchScope (spec 004).
export function documentMetricsAreaIds(scope: MetricsScope): string[] | null {
  return scope.all ? null : scope.areaIds;
}
```

`inScope` de la pareja B no se usa: decide en memoria si un procedimiento está en el alcance, y acá el alcance se aplica en la consulta (sección 4).

## 3. El endpoint `GET /api/metrics/documents`

### 3.1 Entrada

`DocumentMetricsQueryDto`, con los mismos campos y validaciones que `ProcedureMetricsQueryDto`:

| Campo | Regla | Si no |
| --- | --- | --- |
| `areaId` | Opcional, `@IsUUID('all')` | 400 |
| `from` | Opcional, `YYYY-MM-DD` de un día que exista (`isCalendarDate`) | 400 (`2026-02-30`, `01/10/2026`, `2026-10-27T10:00:00Z`, vacío) |
| `to` | Ídem | 400 |
| Cualquier otro | — | 400 (`forbidNonWhitelisted`) |

Swagger describe que `from` y `to` se aplican **solo a `uploaded`** (P1).

### 3.2 Orden de los controles

| # | Control | Si falla | Regla |
| --- | --- | --- | --- |
| 1 | `JwtAuthGuard` | 401 | R1 |
| 2 | `RolesGuard` con `@Roles('ADMIN', 'SUPERVISOR')` | 403 (EMPLOYEE) | R1 |
| 3 | `ValidationPipe` sobre el DTO | 400 | R7 |
| 4 | `from > to`, comparando texto | 400 "La fecha de inicio no puede ser posterior a la fecha de fin" | R7 |
| 5 | Áreas del usuario: `UsersDirectory.findById(user.id)?.areaIds ?? []` | 503 si el directorio no responde | R2, R9 |
| 6 | `metricsScope(role, viewerAreaIds, areaId)`; `null` (SUPERVISOR con un área que no es suya) | 404 "No se encontró el área" | R3 |
| 7 | `today = todayInCompany(clock.now())`, una vez por pedido; el período con `toMetricsPeriod(from, to, companyTimeZone())` | — | R5, R6 |
| 8 | `DocumentMetricsRepository.totals(…)` | 503 si la base no responde | R4 a R6, R9 |
| 9 | 200 con `filters` y `totals` | — | R8 |

- Lo que se decide solo con la petición (pasos 1 a 4) va primero, sin consultar nada, como en la pareja B.
- **Área que no existe** (R3, D14): como en procedimientos, nadie busca el área. Para el SUPERVISOR, `metricsScope` ya responde `null` si no está entre sus áreas, exista o no. Para el ADMIN, `metricsScope` devuelve `{ all: false, areaIds: [areaId] }`, la consulta no encuentra documentos con esa área y la respuesta es 200 con todo en 0 y `filters.areaId` = el pedido. No se usa `AreasDirectory`.
- **Pasos 5 a 8** van dentro de `try/catch` con `toHttpException(error, this.logger, 'métricas')`: los 400 y 404 pasan como están; `RepositoryUnavailableError` (base o directorio de usuarios) → 503 "No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde."; cualquier otro → 500 "No se pudo completar la consulta de las métricas.", con la causa solo en el log (R9, D15).

### 3.3 Salida

```json
{
  "filters": { "areaId": null, "from": null, "to": null },
  "totals": { "active": 12, "upToDate": 8, "dueSoon": 3, "overdue": 1, "processingFailed": 0, "uploaded": 4 }
}
```

- `filters` repite lo recibido, `null` lo que no vino (como `view.filters` de la pareja B).
- `toDocumentMetricsResponse(view)` mapea **campo por campo**, como `toProceduresMetricsResponse`: nada que devuelva el repositorio llega a la respuesta por fuera de esos seis números.
- **Sin `areaIds` ni `staleAfterHours`:** la respuesta de procedimientos los tiene, pero R8 es el contrato y no los incluye. El panel ya recibe las áreas filtrables del endpoint de procedimientos (D6).
- Swagger: `@ApiResponse` para 200 (`DocumentMetricsResponse`), 400, 401, 403, 404 y 503, con las descripciones en español del controlador de la pareja B.

## 4. Cómo se cuenta en la base (R4 a R6)

### 4.1 Una sola consulta

`PrismaDocumentMetricsRepository.totals(query)` hace **un** `$queryRaw` que devuelve **una** fila. Ningún documento llega a Node: PostgreSQL cuenta.

```ts
export interface DocumentMetricsQuery {
  areaIds: string[] | null;   // null: todas las áreas (documentMetricsAreaIds)
  today: string;              // YYYY-MM-DD en hora de Argentina
  dueSoonThrough: string;     // YYYY-MM-DD: today + 30 (4.3)
  uploadedFrom: Date | null;  // [from, to) de toMetricsPeriod
  uploadedTo: Date | null;
}
```

```sql
SELECT count(*)::int                                                        AS active,
       count(*) FILTER (WHERE d.review_date >  ${dueSoonThrough}::date)::int AS "upToDate",
       count(*) FILTER (WHERE d.review_date >= ${today}::date
                          AND d.review_date <= ${dueSoonThrough}::date)::int AS "dueSoon",
       count(*) FILTER (WHERE d.review_date <  ${today}::date)::int          AS overdue,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM document_versions v
         WHERE v.document_id = d.id AND v.status = 'CURRENT'
           AND v.processing_status = 'FAILED'))::int                         AS "processingFailed",
       count(*) FILTER (WHERE <período sobre d.created_at>)::int             AS uploaded
FROM documents d
WHERE d.status = 'ACTIVE'                                   -- R4: los archivados no cuentan en nada
  <AND EXISTS (SELECT 1 FROM document_areas da
               WHERE da.document_id = d.id
                 AND da.area_id = ANY(${areaIds}::uuid[]))> -- R2, solo si areaIds no es null
```

- **Una vez por documento (R4, P5, E6):** el alcance es un `EXISTS`, no un `JOIN` con `document_areas`. Un documento con Ventas y Operaciones es una sola fila de `documents`, haya una o dos áreas en el alcance. Es la misma forma que `searchRankingSql` (spec 004).
- **Los tres estados suman `active`** (R5): las tres condiciones son disjuntas y cubren todas las fechas (`< hoy`, `hoy..hoy+30`, `> hoy+30`), y `review_date` es obligatoria (no hay `NULL` que se escape).
- **`processingFailed` (P2, E8):** solo la versión `CURRENT`, que es una por documento. `PENDING`, `PROCESSING` y `READY` no cuentan; una versión reemplazada en error, tampoco.
- **`uploaded` (R6, P1):** `created_at` del documento (la carga, no las versiones nuevas: D16) en `[uploadedFrom, uploadedTo)`, con `>=` y `<` como `periodCondition` de la pareja B; sin límites, `TRUE`, y `uploaded` es igual a `active`. Un documento cargado en el período y después archivado no pasa el `WHERE` (caso borde).
- **Sin documentos (E11) o SUPERVISOR sin áreas:** `count(*)` sobre cero filas da `0` en todas las columnas; la fila siempre existe. Con `areaIds = []`, `= ANY('{}')` es falso y todo da 0, sin un caso especial en el servicio.
- **Los conteos se castean a `int`** para que lleguen como `number` y no como `bigint`, y el repositorio arma el resultado campo por campo.
- **Una sola sentencia es una sola foto** de la base: no hace falta la transacción `RepeatableRead` que la pareja B usa para sus dos consultas.
- **Índices:** el `WHERE` usa el índice de `documents.status`; el `EXISTS` de áreas, la clave de `document_areas`; el de versiones, `document_versions_one_current_idx`. Sin índices nuevos ni migración.
- **Errores:** `isUnavailable(error)` (que pasa a exportarse desde `prisma-documents.repository.ts`, sin cambiar) → `RepositoryUnavailableError`, que el servicio convierte en 503. Lo demás se propaga y es 500.
- La sentencia la arma una función exportada, `documentMetricsSql(query)`, como `searchRankingSql` y `executionAggregatesSql`.

### 4.2 Las fechas viajan como texto, no como instantes (D8)

`review_date` es `@db.Date`. Si `today` viajara como un `Date` de JavaScript, llegaría a PostgreSQL como `timestamptz` y la comparación `date < timestamptz` convertiría la columna con la zona de la **sesión** de la base, que no es la de la empresa ni la controlan los tests. Por eso `today` y `dueSoonThrough` viajan como `YYYY-MM-DD` con `::date`: se compara día con día, como `reviewStatusOf` compara texto.

Como en el plan 005 (D4), **ningún "hoy" se calcula en SQL**: nada de `CURRENT_DATE` ni `now()`.

En cambio, `uploadedFrom` y `uploadedTo` **sí** son instantes (`created_at` es `timestamptz`), calculados por `toMetricsPeriod` en hora de Argentina: el caso borde de las 23:30 del día `to` (ya el día siguiente en UTC) cuenta porque `to` termina a las 00:00 de Argentina del día siguiente, que son las 03:00 UTC.

### 4.3 Una sola definición de "por vencer" (D7)

La regla de R1 de la spec 005 ya existe en `reviewStatusOf`, y "Por revisar" calcula su límite aparte (`addDays(today, 30)`). Esta spec agrega un tercer uso, así que el límite pasa a una función de `review-status.ts`:

```ts
// R1 de la spec 005: el último día "por vencer" (hoy + 30). Lo usan reviewStatusOf, "Por revisar" y las métricas.
export const dueSoonThrough = (today: string): string => addDays(today, DUE_SOON_DAYS);
```

- `reviewStatusOf` y `DocumentQueryService.pendingReview` pasan a usarla, **sin cambiar su comportamiento**: sus tests de la spec 005 son la red de seguridad.
- La consulta recibe `today` y `dueSoonThrough(today)` y aplica las mismas tres comparaciones que `reviewStatusOf` (`<`, `<=`, `>`), con los mismos bordes. Un test de integración lo comprueba: siembra documentos en cada borde y compara los totales de la base con los de aplicar `reviewStatusOf` a las mismas fechas (5.2, "Consistencia").

## 5. Estrategia de pruebas

El criterio de los planes anteriores: reglas en tests unitarios, base real en integración. **Sin pantallas ni Playwright**: el panel es de la pareja B (spec, sección 4).

**Reloj:** la integración usa el instante de la spec 005, **`2026-11-10T02:30:00.000Z`** (D5 del plan 005): en Buenos Aires es el 9/11 a las 23:30 y en UTC ya es el 10/11. Si algo calculara "hoy" en UTC, los bordes de la tabla de abajo cambiarían de grupo. Los unitarios del servicio reciben el `FixedClock` en el constructor.

| Uso (con `today = 2026-11-09`) | `reviewDate` | Estado |
| --- | --- | --- |
| Vencido (E1) | `2026-11-04` | `overdue` |
| Ayer, último vencido | `2026-11-08` | `overdue` |
| Hoy, primer por vencer | `2026-11-09` | `dueSoon` (en UTC sería `overdue`) |
| Por vencer (E1) | `2026-11-19` | `dueSoon` |
| Hoy + 30, último por vencer | `2026-12-09` | `dueSoon` |
| Hoy + 31, primer al día | `2026-12-10` | `upToDate` |
| Al día (E1) | `2027-02-07` | `upToDate` |

| Uso (`uploaded`, período `2026-10-10` a `2026-10-31`) | `createdAt` | ¿Cuenta? |
| --- | --- | --- |
| 1/10 (E9) | `2026-10-01T15:00:00.000Z` | no |
| Último instante antes de `from` | `2026-10-10T02:59:59.999Z` (9/10, 23:59:59 en Argentina) | no |
| Primer instante de `from` | `2026-10-10T03:00:00.000Z` | sí |
| 15/10 (E9) | `2026-10-15T15:00:00.000Z` | sí |
| 31/10 a las 23:30 de Argentina (caso borde) | `2026-11-01T02:30:00.000Z` | sí |
| 1/11 a las 00:00 de Argentina | `2026-11-01T03:00:00.000Z` | no |

E9 de la spec habla de documentos "cargados el 1/10, el 15/10 y el 31/10": el del 31/10 es el de las 23:30, que además cubre el caso borde.

### 5.1 Tests unitarios (Jest)

| Qué se prueba | Casos |
| --- | --- |
| `metrics-rules.spec.ts` (contrato con la pareja B) | `metricsScope`: ADMIN sin área → todas (**E1**); ADMIN con área → esa (**E3**); SUPERVISOR sin área → sus áreas (**E2**); SUPERVISOR con área ajena → `null` (**E4**); SUPERVISOR sin áreas → `[]`; EMPLOYEE → `null`. `toMetricsPeriod('2026-10-10', '2026-10-31', 'America/Argentina/Buenos_Aires')` → `2026-10-10T03:00Z` y `2026-11-01T03:00Z`; sin fechas → `null` y `null`; solo `from` o solo `to`. `isCalendarDate`: `2026-02-30` y `2026-10-27T10:00:00Z` → no (**E10**). `documentMetricsAreaIds`: `{ all: true }` → `null`; con áreas → las áreas |
| `review-status.spec.ts` | `dueSoonThrough('2026-11-09')` → `2026-12-09`; cruce de año (`2026-12-15` → `2027-01-14`); los tests de la spec 005 pasan sin cambios |
| `company-date.spec.ts` | `companyTimeZone()` → Buenos Aires por defecto y `APP_TIMEZONE` si está |
| `document-metrics.query.spec.ts` | Todo opcional; `areaId` que no es UUID, `2026-02-30`, `01/10/2026`, `2026-10-27T23:59:59Z` y vacío → error en ese campo; un parámetro desconocido → error (**E10**) |
| `document-metrics.service.spec.ts` | Con `InMemoryUsersDirectory`, un repositorio falso que guarda lo que le piden y un `FixedClock` en `2026-11-10T02:30:00.000Z`: **E1** el ADMIN pide `areaIds: null`, `today: '2026-11-09'` y `dueSoonThrough: '2026-12-09'`; **E2** el SUPERVISOR de Ventas pide `[ventas]`, con las áreas del directorio aunque la sesión diga otras (R2); **E3** el ADMIN con Operaciones pide `[operaciones]` y `filters.areaId` es Operaciones; **E4** SUPERVISOR con área ajena → 404 "No se encontró el área" **sin llamar al repositorio**; ADMIN con un área que no existe → pide `[ese id]` y devuelve los ceros del repositorio, con `filters.areaId` = ese id (D14); **E9** el período `2026-10-10`..`2026-10-31` llega como `2026-10-10T03:00Z` y `2026-11-01T03:00Z`; **E10** `from > to` → 400 con su mensaje, sin llamar al directorio ni al repositorio; `from = to` es válido; un usuario que el directorio no conoce → `areaIds: []`; `filters` con `null` en lo que no vino; directorio de usuarios o repositorio caídos (`RepositoryUnavailableError`) → 503 con el mensaje de la sección 3.2; un error cualquiera → 500 y la causa en el log, no en la respuesta |
| `document-metrics.response.spec.ts` | El mapeo devuelve exactamente `filters` y los seis totales (`toStrictEqual`): un campo de más en la vista no llega a la respuesta |
| `http-errors.spec.ts` | El 503 con `'métricas'` dice "No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.", igual que el de la pareja B |

Los tests HTTP van en integración, como el resto de documentos (no hay tests de controlador con el servicio simulado en `src/documents`).

### 5.2 Tests de integración (Supertest + PostgreSQL)

Dos suites, con `cleanDocuments` antes de cada test:

- `test/documents/metrics.repository.e2e-spec.ts`: `PrismaDocumentMetricsRepository` contra la base, sin HTTP;
- `test/documents/metrics.e2e-spec.ts`: `GET /api/metrics/documents` con `createDocumentsTestApp({ clock: new FixedClock(new Date('2026-11-10T02:30:00.000Z')) })` y `authHeaders`.

Los documentos se siembran con `seedDocument` (`areaIds`, `status`, `reviewDate`, `createdAt`). Para la versión en error se actualiza `processing_status` de la versión sembrada a `FAILED` (D10: un helper `setProcessingStatus(prisma, versionId, status)` en `helpers.ts`, como `seedProcessedVersion`).

| Escenario | Suite | Preparación | Qué comprueba |
| --- | --- | --- | --- |
| **E1** ADMIN, todas | HTTP | Ventas `2027-02-07`, Operaciones `2026-11-19`, Ventas `2026-11-04` | 200; `active: 3`, `upToDate: 1`, `dueSoon: 1`, `overdue: 1`, `uploaded: 3`; `filters` todo `null` |
| **E2** SUPERVISOR | HTTP | Dos en Ventas y uno en Operaciones | `supervisorVentas` → `active: 2`; `supervisorOperaciones` → `active: 1` |
| **E3** filtro por área | HTTP | Ídem | ADMIN con `areaId` de Operaciones → `active: 1` y `filters.areaId` = Operaciones; `supervisorVentas` con Ventas → 2 |
| **E4** área ajena o inexistente | HTTP | Documentos en Ventas y Operaciones | `supervisorVentas` con Operaciones → 404 "No se encontró el área"; `supervisorVentas` con un UUID que no es un área → el mismo 404; ADMIN con ese UUID → 200, los seis en 0 y `filters.areaId` = ese UUID (D14) |
| **E5** empleado | HTTP | — | `empleadoVentas` → 403; sin sesión → 401 |
| **E6** varias áreas | HTTP y repositorio | Un documento con Ventas y Operaciones | ADMIN → `active: 1`; `areaIds: [ventas, operaciones]` en el repositorio → 1; con Ventas → 1; un SUPERVISOR de las dos (creado en el test, como en T11 de la spec 005) → 1 |
| Área que el documento no tiene (caso borde) | HTTP | El mismo, solo con Ventas | ADMIN con Operaciones → `active: 0` |
| **E7** archivados | HTTP | Archivado con `2026-11-04`, `createdAt` dentro del período | No cuenta en `active`, `overdue` ni `uploaded`, con y sin período |
| **E8** error de procesamiento | HTTP y repositorio | Uno con la versión `CURRENT` en `FAILED`, uno `PENDING`, uno `READY`, y uno cuya versión `REPLACED` está en `FAILED` y la `CURRENT` en `READY` | `processingFailed: 1`; el `PENDING` cuenta en `active` y en su estado de revisión (caso borde) |
| **E9** período | HTTP | 1/10, 15/10 y 31/10 a las 23:30 de Argentina | `from=2026-10-10&to=2026-10-31` → `uploaded: 2` y `active: 3`, como dice la spec; solo `from` o solo `to` limitan un lado |
| Bordes del período | HTTP | Los seis `createdAt` de la segunda tabla de la sección 5 | Con el mismo período, `uploaded: 3` (10/10 a las 03:00Z, 15/10 y 31/10 a las 23:30); los de las 02:59:59.999Z del 10/10 y las 03:00Z del 1/11 no cuentan |
| **E10** fechas inválidas | HTTP | — | `from=2026-10-31&to=2026-10-01` → 400 con el mensaje de R7; `from=2026-02-30` → 400; `areaId=ventas` → 400; `userId=x` → 400 |
| **E11** sin documentos | HTTP | Solo documentos de Ventas | ADMIN con Operaciones → 200 y los seis en 0 |
| SUPERVISOR sin áreas (caso borde) | HTTP | Un SUPERVISOR sin filas en `user_areas` (creado en el test) | 200 y todo en 0 |
| Bordes de R1 de la spec 005 | HTTP | Uno por cada fecha de la primera tabla de la sección 5 | `overdue: 2`, `dueSoon: 3`, `upToDate: 2`; con el reloj en 23:30 de Argentina |
| Consistencia (D7) | repositorio | Las mismas fechas | Los tres totales son iguales a contar `reviewStatusOf({ status: 'ACTIVE', reviewDate }, '2026-11-09')` sobre esas fechas |
| Áreas del directorio (R2) | HTTP | Un SUPERVISOR creado en el test en Ventas; con el token ya firmado, se lo pasa a Operaciones en `user_areas` | Cuenta los de Operaciones, no los de Ventas |
| Una sola consulta | repositorio | — | Con `jest.spyOn(prisma, '$queryRaw')`, `totals` hace una llamada |
| Ruta | HTTP | — | `GET /api/metrics/procedures` sigue respondiendo 200 al ADMIN: el controlador nuevo no la tapa |

**Lo que ya existe:** las suites de las specs 001 a 006 y `test/executions/metrics.e2e-spec.ts` pasan sin cambios.

El 503 (R9) se prueba en los unitarios con los puertos simulados, como en las demás consultas (D13 del plan 001).

## 6. Escenario → test

| Escenario | Unitario | Integración |
| --- | --- | --- |
| E1 · ADMIN, todas las áreas | `metrics-rules.spec.ts`, `document-metrics.service.spec.ts` | `metrics.e2e-spec.ts` |
| E2 · SUPERVISOR, sus áreas | `metrics-rules.spec.ts`, `document-metrics.service.spec.ts` | `metrics.e2e-spec.ts` |
| E3 · Filtro por área | `metrics-rules.spec.ts`, `document-metrics.service.spec.ts` | `metrics.e2e-spec.ts` |
| E4 · Área ajena o inexistente | `metrics-rules.spec.ts`, `document-metrics.service.spec.ts` | `metrics.e2e-spec.ts` |
| E5 · Empleado | `metrics-rules.spec.ts` (`metricsScope` → `null`) | `metrics.e2e-spec.ts` (403 del guard) |
| E6 · Varias áreas | — (lo decide la consulta) | `metrics.repository.e2e-spec.ts`, `metrics.e2e-spec.ts` |
| E7 · Archivados | — | `metrics.e2e-spec.ts` |
| E8 · Error de procesamiento | — | `metrics.repository.e2e-spec.ts`, `metrics.e2e-spec.ts` |
| E9 · Período | `metrics-rules.spec.ts` (`toMetricsPeriod`), `document-metrics.service.spec.ts` | `metrics.e2e-spec.ts` |
| E10 · Fechas inválidas | `document-metrics.query.spec.ts`, `document-metrics.service.spec.ts` | `metrics.e2e-spec.ts` |
| E11 · Sin documentos | — | `metrics.e2e-spec.ts` |

## 7. Dependencias nuevas

Ninguna. Ni paquetes ni migraciones: la consulta usa tablas, columnas e índices que ya existen.

## 8. Decisiones y preguntas abiertas

### 8.1 Decisiones

D1 a D13, propuestas al escribir el plan y aceptadas en su revisión, el 30/10/2026. D14 a D16 salen de las preguntas Q1 a Q3 de esa primera versión, cerradas en la misma revisión. La D5 de la primera versión (404 para el ADMIN con un área que no existe) se descartó con Q1, y las siguientes se renumeraron.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D1 · ¿Módulo nuevo o `DocumentsModule`? | `DocumentsModule`, que ya tiene `UsersDirectory` y el `Clock` de documentos. El código va en `src/documents/metrics/` (1) | — |
| D2 · ¿Dónde está la ruta? | Un controlador propio, `DocumentMetricsController`, con `@Controller('metrics')` y `@Get('documents')`, y los guards y roles de la clase de la pareja B. No en `DocumentsController`, que es `/documents` y no restringe roles (1) | R1 |
| D3 · ¿Se importan o se replican las reglas de la pareja B? | Se importan sin modificarlas `metricsScope`, `MetricsScope`, `toMetricsPeriod` e `isCalendarDate`, solo desde `metrics-rules.ts`, con tests de contrato que fallan si la pareja B cambia una regla (2.2) | R2, R3, R6, R7, P3 |
| D4 · ¿Qué no se reutiliza? | El validador `IsCalendarDate` (no está exportado), `toHttpException` de `executions`, su zona, su `Clock` y sus clases de respuesta. Cada uno tiene su equivalente en documentos o se arma sobre las funciones importadas. Se avisa a Mayra de la dependencia (2.2) | R7, R9 |
| D5 · ¿Un método más en `DocumentsRepository` o un puerto aparte? | Un puerto aparte, `DocumentMetricsRepository`, con un solo método, como `ExecutionMetricsRepository` (1) | — |
| D6 · ¿La respuesta incluye `areaIds` como la de procedimientos? | No: R8 es el contrato y solo tiene `filters` y `totals` (3.3) | R8 |
| D7 · ¿Cómo se asegura que la base cuente igual que `reviewStatusOf`? | El límite pasa a `dueSoonThrough(today)` en `review-status.ts`, que usan `reviewStatusOf`, "Por revisar" y las métricas; la consulta repite las tres comparaciones y un test de integración compara los totales con `reviewStatusOf` en los bordes (4.3) | R5, R1 de la spec 005 |
| D8 · ¿Cómo llegan las fechas a la consulta? | `today` y `dueSoonThrough` como `YYYY-MM-DD::date`, nunca como `Date` ni con `CURRENT_DATE`, para no depender de la zona de la sesión de la base. El período, como instantes de `toMetricsPeriod` (4.2) | R5, R6 |
| D9 · ¿Cuántas consultas? | Una sentencia con `count(*) FILTER`, alcance con `EXISTS` (una vez por documento) y la versión en error con otro `EXISTS`. Una sola foto, sin transacción, sin traer documentos a Node (4.1) | R4, R5, R6 |
| D10 · ¿Cómo se siembra una versión en error? | Con un helper nuevo en `test/documents/helpers.ts`, `setProcessingStatus(prisma, versionId, status)`. `seedDocument` no cambia (5.2) | R5, P2 |
| D11 · ¿Qué reloj usan los tests? | El `Clock` de documentos: `FixedClock` en el constructor en los unitarios y `createDocumentsTestApp({ clock })` en integración, con `2026-11-10T02:30:00.000Z` (D5 del plan 005) | R5 |
| D12 · ¿Se prueba el controlador con el servicio simulado, como la pareja B? | No: los tests HTTP van en integración, como el resto de documentos. Los 401, 403 y 400 se prueban ahí (5.2) | R1, R7 |
| D13 · ¿Pantallas o Playwright? | No: la tarjeta y su adaptador son de la pareja B (spec, sección 4) | — |
| D14 · ¿Qué recibe el ADMIN con un `areaId` que no existe? (era Q1) | Como en procedimientos: 200 con los seis totales en 0 y `filters.areaId` = el pedido. El 404 "No se encontró el área" queda solo para el SUPERVISOR con un área que no es suya, exista o no. Nadie busca el área: no se usa `AreasDirectory` (3.2). R3 y E4 de la spec se corrigieron en esta revisión | R3, P3 |
| D15 · ¿El 503 dice "en unos minutos" o "más tarde"? (era Q2) | "Intentá de nuevo más tarde.", el texto de los dos módulos: sale de `toHttpException` de documentos con la operación `'métricas'`, igual al de la pareja B. R9 de la spec se corrigió en esta revisión | R9, P3 |
| D16 · ¿`uploaded` cuenta las versiones nuevas? (era Q3) | No: solo los documentos, por `documents.created_at`. R6 habla de documentos cargados, y una versión nueva no es un documento nuevo; contarlas sería otro número y cambiaría el contrato de R8 (4.1) | R6, R8 |

### 8.2 Preguntas abiertas

Ninguna. Q1 a Q3 de la primera versión del plan pasaron a D14 a D16.
