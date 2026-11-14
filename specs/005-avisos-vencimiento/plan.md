# Plan 005 · Avisos de vencimiento de documentos

- **Spec:** [spec.md](./spec.md) (HU37)
- **Planes de referencia:** [plan 001](../001-carga-documentos/plan.md) (API de documentos y fecha de revisión), [plan 002](../002-pantallas-documentos/plan.md) (pantallas), [plan 003](../003-ciclo-de-vida-documentos/plan.md) (versión nueva, bloqueo del documento e índices escritos a mano) y [plan 004](../004-busqueda-documentos/plan.md) (ruta antes de `:id` y migración sin `DROP INDEX`)
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** revisado el 30/10/2026, listo para dividir en tareas. Las decisiones están en la sección 10.1; no quedan preguntas abiertas (sección 10.2).

En este plan, R1 a R13 y F1 a F6 son reglas de esta spec; P1 a P8, sus decisiones (spec, sección 10); E1 a E13, sus escenarios (sección 11, en el orden en que aparecen); y D1 a D22, las decisiones de este plan (sección 10.1). D19 a D22 salen de las preguntas Q1 a Q4 de la primera versión del plan, cerradas en su revisión. Las reglas y decisiones de otros planes se citan con su número y el plan ("R6 de la spec 001", "D1 del plan 003").

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | Documento por vencer | E8 | Marcar como revisado |
| E2 | Documento vencido | E9 | Fecha inválida |
| E3 | Documento al día | E10 | Sin permiso para marcar como revisado |
| E4 | La fecha de revisión es hoy | E11 | Documento archivado |
| E5 | Un empleado que no es responsable no ve avisos | E12 | Una versión nueva también cuenta como revisión |
| E6 | Sección "Por revisar" | E13 | Sin pendientes |
| E7 | El ADMIN ve todos los pendientes | | |

## 0. Punto de partida

**API (`apps/api/src/documents`)**

- `Document.reviewDate` es `@db.Date` (sin hora) y ya tiene índice (`@@index([reviewDate])`). Llega a Node como medianoche UTC y `toDateOnly` la devuelve como `YYYY-MM-DD` sin correr el día.
- **"Hoy" ya se calcula en un lugar:** `DocumentWriteSteps.today()` (privado) formatea `new Date()` en `APP_TIMEZONE`, por defecto `America/Argentina/Buenos_Aires` (D1 del plan 001), y `assertReviewDateIsAfterToday` lo usa para R6 de la spec 001 y R7b de la spec 003. Es lo que esta feature reutiliza (sección 1).
- **No hay reloj inyectable en documentos.** Los tests unitarios fijan la hora con `jest.useFakeTimers().setSystemTime(NOON_IN_BUENOS_AIRES)`. Los de integración usan `daysFromToday(n)` (`test/documents/helpers.ts`), que calcula en **UTC** con la hora real: sirve para fechas lejanas, no para "hoy" ni para los bordes de 30 días.
- La pareja B tiene un puerto `Clock` con `SystemClock` en `src/executions/ports/clock.ts`, y sus tests lo reemplazan por un `FixedClock`. Es suyo y esta feature no lo toca (D20).
- `DocumentQueryService` tiene `findVisible` (primero el visor, después el documento; 404 igual para inexistente y ajeno) y `viewerFor` (áreas del directorio, nunca del token), ambos privados.
- `DocumentLifecycleService` tiene el esquema de escritura del plan 003: `findWritable` (404, 409), transacción con `lockForUpdate`, nueva lectura bajo el bloqueo, auditoría dentro de la transacción y `run`, que audita los fallos con `auditFailure`.
- `addVersion` del repositorio cambia `reviewDate` solo si vino (R7b de la spec 003). La firma del puerto es `addVersion(tx, id, version, reviewDate?)` y `version.uploadedById` es el ADMIN que la sube.
- `AuditEntry` tiene `action`, `actorId`, `documentId?`, `result`, `detail?` y `at`. `LoggerAuditLog` los escribe campo por campo (D9 del plan 003: sigue la simulación hasta resolver A1).
- La sesión es el login real de la pareja A: `AuthUser` trae `id`, `role` y `areaIds`, pero las áreas para decidir visibilidad se siguen pidiendo a `UsersDirectory` (D5 del plan 001).

**Base (`apps/api/prisma`)**

- Índices escritos a mano que `schema.prisma` no describe: `chunks_embedding_idx`, `chunks_content_fts_idx` y `chunks_content_fts_es_unaccent_idx`. Toda migración nueva se crea con `--create-only` y se revisa (D1 del plan 003, D3 del plan 004). `test/documents/indexes.e2e-spec.ts` exige que existan.

**Web (`apps/web`)**

- `DocumentCard` muestra "Archivado" como etiqueta junto al título y la fecha de revisión en "Revisión".
- `DocumentDetail` tiene la fila de acciones del ADMIN, los paneles del plan 003 (D8), el aviso con `role="status"` y `finish(message)`, que cierra, avisa y vuelve a pedir el detalle.
- `ReviewDateField` ya pone `min` en mañana en Buenos Aires (`tomorrowIn`) y tiene el modo obligatorio y el opcional.
- `Pagination` arma los enlaces sobre `/documentos` fijo.
- `describeApiError(error, context)` tiene los contextos de las specs 002 a 004.

## 1. Estado de revisión (R1, R2, R3)

### 1.1 La regla, como función pura

`src/documents/review-status.ts`:

```ts
export type ReviewStatus = 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE';
export const DUE_SOON_DAYS = 30; // R1, P1

// R1 y R2. Las dos fechas son YYYY-MM-DD; "today" ya está en hora de Argentina.
export function reviewStatusOf(
  document: { status: DocumentStatus; reviewDate: string },
  today: string,
): ReviewStatus | null {
  if (document.status === 'ARCHIVED') return null;                      // R2
  if (document.reviewDate < today) return 'OVERDUE';                    // ya pasó
  if (document.reviewDate <= addDays(today, DUE_SOON_DAYS)) return 'DUE_SOON'; // hoy..hoy+30
  return 'UP_TO_DATE';                                                  // después de hoy+30
}
```

- **Se compara texto, no instantes.** `YYYY-MM-DD` ordena igual que las fechas que representa (ya lo usa `assertReviewDateIsAfterToday`). Así no hay horas, zonas ni cambios de horario en la comparación: el único lugar donde importa la zona es al calcular `today` (1.2).
- **Bordes (R1 y sección 8 de la spec):** ayer → `OVERDUE`; hoy → `DUE_SOON` (E4); hoy + 30 → `DUE_SOON`; hoy + 31 → `UP_TO_DATE`.
- **Se calcula en cada consulta** (R3, P7): no hay columna de estado ni tarea programada. La base solo guarda `review_date` y la última revisión (sección 4).
- Los nombres van en inglés, como `DocumentStatus` y `ProcessingStatus`; la web los traduce (sección 7).

### 1.2 "Hoy" en hora de Argentina, en un solo lugar

Se saca de `DocumentWriteSteps` lo que ya calcula "hoy" y se lo pone en un módulo propio, `src/documents/company-date.ts`, sin cambiar su comportamiento:

| Función | Qué hace |
| --- | --- |
| `todayInCompany(now: Date): string` | La fecha `YYYY-MM-DD` de ese instante en `APP_TIMEZONE` (por defecto `America/Argentina/Buenos_Aires`). Es el `today()` actual de `DocumentWriteSteps`, con `now` como parámetro en vez de `new Date()` adentro |
| `addDays(date: string, days: number): string` | Suma días a una fecha `YYYY-MM-DD` con `Date.UTC`, que acomoda fin de mes y de año. Es lo mismo que hace `tomorrowIn` en la web |
| `toDbDate(date: string): Date` | `new Date(\`${date}T00:00:00.000Z\`)`: la forma en que se guarda un `@db.Date` (ya se escribe así en la carga y en la versión nueva) |

- `DocumentWriteSteps.assertReviewDateIsAfterToday` pasa a usar `todayInCompany(this.clock.now())`. **El mensaje y la regla no cambian** (R7 pide "las mismas reglas que en la carga"), y "Marcar como revisado" usa exactamente esa función (D3).
- Ningún cálculo de "hoy" se hace en SQL: nada de `CURRENT_DATE` ni `now()`. La zona del servidor de la base no es la de la empresa y los tests no podrían controlarla. La fecha límite de "Por revisar" se calcula en Node y viaja como parámetro (sección 3.1, D4).
- **Una sola fecha por pedido.** Cada servicio calcula `today` una vez al empezar y la usa para el filtro y para todas las etiquetas de esa respuesta. Así, un pedido que cruza la medianoche no puede filtrar con un día y etiquetar con otro.

### 1.3 Un reloj inyectable (D2)

Para que los tests no dependan de la hora en que corren (sección 9 de la spec), el instante "ahora" llega por un puerto:

- Documentos crea **su propio** `Clock` (clase abstracta con `now(): Date`) y `SystemClock` (`new Date()`) en `src/common/clock.ts`, con la misma forma que el de la pareja B. **`src/executions` no se toca** (D20).
- Son clases distintas de las de `src/executions/ports/clock.ts`, así que también son tokens de inyección distintos: reemplazar el reloj de documentos en un test no cambia el de las ejecuciones, y al revés.
- `DocumentsModule` suma `{ provide: Clock, useClass: SystemClock }`, con el `Clock` de `src/common/clock.ts`.
- `DocumentQueryService`, `DocumentUploadService` y `DocumentLifecycleService` reciben `clock: Clock = new SystemClock()` como **último** parámetro del constructor, con valor por defecto. Nest inyecta el del módulo; los tests unitarios existentes, que construyen los servicios con `new` y sin ese parámetro, siguen compilando y siguen usando `jest.setSystemTime`, porque `SystemClock` lee `new Date()`.
- `DocumentWriteSteps` recibe el reloj del servicio que la crea (también como último parámetro, con el mismo valor por defecto, para que `document-write-steps.spec.ts` no cambie).

### 1.4 Cómo se prueba sin depender de la hora

| Nivel | Cómo se fija "ahora" |
| --- | --- |
| Unitarios de las funciones puras | No hay reloj: `todayInCompany(new Date('…'))` y `reviewStatusOf(doc, '2026-11-09')` reciben todo por parámetro |
| Unitarios de los servicios nuevos | Un `FixedClock` en el constructor, como en `procedure-metrics.service.spec.ts`. Los tests existentes siguen con `jest.setSystemTime` |
| Integración (Supertest + PostgreSQL) | `createDocumentsTestApp({ clock })` hace `.overrideProvider(Clock).useValue(clock)`, con el `Clock` de `src/common/clock.ts`, solo si recibe uno; las suites de las specs 001 a 004 no lo pasan y no cambian. La suite de esta spec usa **`2026-11-10T02:30:00.000Z`**, que en Buenos Aires es el 9/11 a las 23:30 y en UTC ya es el 10/11 (D5) |
| Web | La web no calcula el estado: muestra el que manda la API (sección 7). Solo el `min` del campo de fecha depende de la hora, y ya se prueba con `tomorrowIn` (plan 003) |

Con ese instante, `today` es `2026-11-09`. Si algún código calculara "hoy" en UTC, obtendría `2026-11-10` y fallarían E4 (hoy sería ayer → "Vencido") y E9 (la fecha de "hoy" pasaría como mañana). Las fechas de los tests de integración son literales, a partir de ese día:

| Uso | Fecha |
| --- | --- |
| Vencido hace 5 días (E2) | `2026-11-04` |
| Hoy (E4, E9) | `2026-11-09` |
| Mañana, la primera válida (R7) | `2026-11-10` |
| Dentro de 10 días (E1) | `2026-11-19` |
| Hoy + 30, último "por vencer" | `2026-12-09` |
| Hoy + 31, primer "al día" | `2026-12-10` |
| Dentro de 90 días (E3) | `2027-02-07` |
| Dentro de 6 meses (E8) | `2027-05-09` |
| Por defecto de `seedDocument` (sin cambios) | `2027-01-15`: al día |

## 2. Quién ve el estado (R4, R11)

### 2.1 Un campo `review` en la respuesta, solo para quien corresponde

`DocumentResponse` y `DocumentSummary` (y por herencia `DocumentSearchResult`) suman un campo **opcional**:

```json
{
  "id": "…", "title": "Manual de caja", "status": "ACTIVE", "ownerId": "…",
  "reviewDate": "2026-11-04", "…": "…",
  "review": {
    "status": "OVERDUE",
    "lastReviewedAt": "2026-05-04T14:12:09.000Z",
    "lastReviewedById": "…"
  }
}
```

| Campo | Valor |
| --- | --- |
| `review` | **Solo** si quien pide es ADMIN o es el responsable (`ownerId`) de ese documento. Para cualquier otro usuario, **la clave no está** (D6) |
| `review.status` | `UP_TO_DATE`, `DUE_SOON` u `OVERDUE` (R1), o `null` si el documento está archivado (R2). El ADMIN ve archivados; el responsable que no es ADMIN, no (R10 de la spec 001) |
| `review.lastReviewedAt` | ISO 8601 de la última revisión, o `null` si nunca se revisó (R11) |
| `review.lastReviewedById` | Quién la hizo, o `null`. La web resuelve el nombre, como con `ownerId` (Q1 del plan 002) |

**Por qué sin la clave y no con `review: null`:** R4 dice que para los demás "el documento se ve como hasta ahora". Sin la clave, la respuesta para un EMPLOYEE que no es responsable es **idéntica** a la de hoy, byte a byte, y los tests de las specs 001 a 004 que comparan la forma completa (`toStrictEqual` en `document.response.spec.ts`) siguen pasando sin cambios.

### 2.2 Dónde se decide

- **La regla vive en la política**, como las demás. `document-access.policy.ts` suma:

  ```ts
  // R4 y R6 (spec 005): el ADMIN o el responsable. Sin mirar áreas: para llegar acá ya pasó canView.
  export function canReview(user: { id: string; role: Role }, document: { ownerId: string }): boolean {
    return user.role === 'ADMIN' || document.ownerId === user.id;
  }
  ```

  La usan la respuesta (R4), "Por revisar" (R5) y "Marcar como revisado" (R6): una sola regla para las tres.

- **El mapeo arma `review` en un solo lugar.** `review-status.ts` suma `reviewFor(user, record, today): DocumentReviewInfo | undefined`, que devuelve `undefined` si `canReview` es falso. Los mapeos de `document.response.ts` reciben ese valor como parámetro opcional:

  ```ts
  toDocumentResponse(record, review?)   // ...(review && { review })
  toDocumentSummary(record, review?)
  toDocumentSearchResult(record, fragment, review?)
  ```

  Sin el parámetro, la salida es la de hoy. Se sigue mapeando **campo por campo**: `lastReviewedAt` y `lastReviewedById` del registro nunca llegan a la respuesta por fuera de `review`, aunque `DocumentRecord` los tenga.

- **Quién llama a `reviewFor`:** todos los servicios que devuelven documentos.

  | Servicio | Respuesta | Para quién |
  | --- | --- | --- |
  | `DocumentQueryService.findOne` | detalle | el usuario de la sesión |
  | `DocumentQueryService.list` | cada tarjeta del listado | ídem |
  | `DocumentQueryService.search` | cada resultado (D7) | ídem |
  | `DocumentQueryService.pendingReview` | cada tarjeta de "Por revisar" | ídem: siempre presente |
  | `DocumentUploadService.upload` | 201 | el ADMIN que carga |
  | `DocumentLifecycleService.run` | 200/201 del ciclo de vida y de "Marcar como revisado" | el actor |

- **El responsable ADMIN** (caso borde): la regla es una disyunción, así que el documento tiene una sola etiqueta, nunca dos. En "Por revisar" aparece una vez (sección 3.1).
- **El responsable que pierde el acceso** (caso borde): `findVisible` y `listWhere` lo filtran antes de llegar a `reviewFor`, así que deja de ver el documento y su aviso. El ADMIN lo sigue viendo.

## 3. Endpoints

Todos con el prefijo `/api`, los guards del controlador (`JwtAuthGuard`, `RolesGuard`) **sin** `@Roles` (cualquier usuario con sesión: la regla de R5 y R6 depende del documento, no del rol), errores con el formato de NestJS y Swagger con un `@ApiResponse` por código (sección 9 de la spec).

### 3.1 `GET /api/documents/pending-review`: "Por revisar" (R5)

- **Posición en el controlador:** antes de `@Get(':id')`, junto a `search`, por el mismo motivo (plan 004, sección 0). Un test de integración lo cubre.
- **Entrada:** `ListDocumentsQuery`, sin cambios: `page` desde 1 y `limit` de 1 a 100, por defecto 20 (R13 de la spec 001, D3 del plan 001).
- **Qué devuelve:** los documentos `ACTIVE` con `reviewDate <= hoy + 30` (por vencer o vencidos) que el usuario puede revisar.

  | Usuario | Filtro (`pendingReviewWhere` en la política) |
  | --- | --- |
  | ADMIN | `{ status: 'ACTIVE', reviewDate: { lte: límite } }`: todos, de cualquier responsable (E7) |
  | Cualquier otro | `{ ...listWhere(viewer), ownerId: user.id, reviewDate: { lte: límite } }`: los suyos **que todavía puede ver** (caso borde del responsable sin acceso), de todas sus áreas juntas (caso borde de varias áreas) |

  `límite = toDbDate(addDays(today, 30))`, calculado en Node (D4).

- **Orden:** `reviewDate` ascendente y, a igual fecha, `id` ascendente para que el orden no cambie entre páginas. **No hace falta ordenar por estado:** todo vencido tiene una fecha anterior a hoy y todo "por vencer", una fecha de hoy en adelante, así que ordenar por fecha ya pone los vencidos primero y, dentro de cada grupo, de la más antigua a la más nueva (R5, D8). Lo usa el índice `documents_review_date_idx`, que ya existe.
- **Salida 200:**

  ```json
  {
    "data": [ { "…DocumentSummary…": "…", "review": { "status": "OVERDUE", "lastReviewedAt": null, "lastReviewedById": null } } ],
    "total": 2, "page": 1, "limit": 20,
    "isReviewer": true
  }
  ```

  - `data`: `DocumentSummary` con `review` siempre presente (el usuario puede revisar cada uno, por construcción).
  - `total`: la cantidad de pendientes. Es el número de F2 (sección 7.2).
  - `isReviewer`: `true` si es ADMIN o si es responsable de al menos un documento `ACTIVE` que puede ver, **aunque esté al día**. Le dice a la web si mostrar el acceso de F2 cuando no hay pendientes (E13; D19).
  - Una página que no existe responde 200 con `data: []` y el `total` real, como el listado.
- **Errores** (en este orden):

  | Código | Cuándo | Regla |
  | --- | --- | --- |
  | 401 | Sin sesión | — |
  | 400 | `page` o `limit` inválidos (`limit=101`) | R13 de la spec 001 |
  | 503 | La base o el directorio de usuarios no responden | R13 |

  **No hay 403:** un usuario que no es responsable de nada recibe `data: []`, `total: 0` e `isReviewer: false`. La lista es "lo que el usuario puede revisar", y para él es vacía (D9).

- **Servicio:** `DocumentQueryService.pendingReview(user, query)`, dentro de `mapErrors`:
  1. `viewerFor(user)` (si el directorio falla, 503 y nunca se lista sin filtro);
  2. `today = todayInCompany(clock.now())`;
  3. `documents.listForReview(pendingReviewWhere(…), page, limit)`;
  4. `isReviewer`: `true` si es ADMIN o si `total > 0`; si no, `documents.count({ ...listWhere(viewer), ownerId: user.id })` (`listWhere` ya exige `ACTIVE`). La consulta extra solo se hace cuando no hay pendientes;
  5. cada fila con `toDocumentSummary(record, reviewFor(user, record, today))`.

### 3.2 `POST /api/documents/:id/review`: "Marcar como revisado" (R6 a R9)

Es una acción con efectos (fecha, última revisión y auditoría), como archivar: `POST` sobre una subruta y no un `PATCH` de `reviewDate` (D5 del plan 003; D10).

- **Entrada:** JSON, `MarkReviewedDto`:

  | Campo | Regla |
  | --- | --- |
  | `reviewDate` | **Obligatorio**, `YYYY-MM-DD` que exista. Las mismas validaciones que `CreateDocumentDto.reviewDate` (`@Matches` + `@IsISO8601({ strict: true })`). La comparación con mañana la hace el servicio (R7) |

- **Orden de los controles:**

  | # | Control | Si falla | Regla |
  | --- | --- | --- | --- |
  | 1 | `JwtAuthGuard` | 401 | R6 |
  | 2 | `ParseUUIDPipe` sobre `id` | 400 | — |
  | 3 | `ValidationPipe` sobre `MarkReviewedDto` | 400 (`reviewDate` falta o está mal formada) | R7 |
  | 4 | `assertReviewDateIsAfterToday(reviewDate)`: posterior a hoy en Buenos Aires | 400 (`reviewDate tiene que ser posterior a hoy (…)`) | R7, R6 de la spec 001 |
  | 5 | `viewerFor(user)` y `findByIdWithAreas(id)`; no existe o `!canView` | 404 | R6, R11 de la spec 001 |
  | 6 | `!canReview(user, record)` | 403 | R6 |
  | 7 | `status === 'ARCHIVED'` (solo llega el ADMIN: para los demás un archivado ya es 404 en el paso 5) | 409 `reason: "ARCHIVED"` | R9 |
  | 8 | Transacción: `lockForUpdate(tx, id)` y nueva lectura bajo el bloqueo; si ya no existe → 404; si se archivó → 409; si cambió el responsable y el actor ya no puede revisar → 403 | 404 / 409 / 403 | R6, R9 |
  | 9 | `markReviewed(tx, id, …)` y auditoría dentro de la transacción (sección 6) | 503 y no cambia nada | R8, R12, R13 |
  | 10 | Commit y 200 con el documento | — | R8 |

  Como en el plan 003 (sección 1), **lo que se comprueba solo con la petición va primero**, sin consultar la base. Un 400 de fecha sobre un documento ajeno no revela nada: es la misma respuesta exista o no. Después, la existencia y la visibilidad (404) van antes que el permiso (403), para que un 403 nunca confirme que existe un documento que el usuario no puede ver (R11 de la spec 001).

- **Escritura** (`DocumentsRepository.markReviewed(tx, id, { reviewDate, reviewedById, at })`): una sola sentencia sobre `documents`, que pone `review_date`, `last_reviewed_at`, `last_reviewed_by_id` y `updated_at`. **No** toca `document_versions`, `chunks` ni el almacenamiento, ni encola nada (R8).
- **Respuesta 200:** `DocumentResponse` con `review` (el actor siempre puede verlo). En E8: `reviewDate` = la nueva, `review.status: "UP_TO_DATE"`, `review.lastReviewedById` = el actor y `review.lastReviewedAt` = ahora.
- **Errores**, en el orden en que se controlan:

  | Código | Cuándo | Regla |
  | --- | --- | --- |
  | 401 | Sin sesión | R6 |
  | 400 | `id` que no es UUID; `reviewDate` falta, mal formada o no existe | R7 |
  | 400 | `reviewDate` es hoy o anterior, en hora de Argentina (E9) | R7 |
  | 404 | El documento no existe o el usuario no puede verlo | R6 |
  | 403 | Lo ve, pero no es ADMIN ni el responsable (E10) | R6 |
  | 409 | Está archivado (`reason: "ARCHIVED"`, E11) | R9 |
  | 503 | La base o el directorio no responden; no cambió nada | R13 |

  Los mensajes de los 400 empiezan con `reviewDate`, así la web los pone junto al campo (plan 002, 5.1).

- **Dónde vive:** en `DocumentLifecycleService.markReviewed(id, dto, actor)`, que reutiliza `run` (auditoría de fallos y `toHttpException`), `lockForUpdate` y el mismo error `documentArchived()`. Lo que cambia respecto de las otras acciones es el acceso: en vez de `findWritable` (que no mira visibilidad porque el guard ya exigió ADMIN), usa la visibilidad de 2.2. Para no duplicarla, `viewerFor` y la comprobación de `findVisible` salen de `DocumentQueryService` a una función compartida, `findVisibleDocument(users, documents, user, id)` en `document-access.ts` (D11).
- **Misma fecha que ya tenía:** se acepta y se registra la revisión. Marcar como revisado es confirmar que sigue vigente, no cambiar la fecha (D12).
- **Dos personas a la vez** (caso borde): el bloqueo del documento las ordena. La segunda lee bajo el bloqueo la fecha que dejó la primera, la audita como "anterior" y escribe la suya. Queda la última y las dos quedan en la auditoría, cada una con su fecha anterior real.

### 3.3 Cambios en lo que ya existe

- **`DocumentResponse`, `DocumentSummary` y `DocumentSearchResult`:** el campo opcional `review` (2.1), con `@ApiPropertyOptional({ type: DocumentReviewInfo })`. Al implementar, se anota en el plan 001, sección 3.1, como se hizo con `archivedAt`.
- **`DocumentRecord`** suma `lastReviewedAt?: Date | null` y `lastReviewedById?: string | null`, opcionales como `archivedAt`, para los registros armados a mano en los tests. `toRecord` los completa siempre.
- **`DocumentsRepository`** suma:

  | Método | Qué hace |
  | --- | --- |
  | `listForReview(where, page, limit)` | Como `list`, pero ordenado por `reviewDate` y `id` ascendentes (3.1). Las dos lecturas en el mismo `$transaction([...])` que `list` |
  | `count(where)` | Cuántos documentos cumplen el filtro (para `isReviewer`) |
  | `markReviewed(tx, id, { reviewDate, reviewedById, at })` | La escritura de 3.2 |

  `addVersion` no cambia de firma; cambia lo que escribe cuando viene `reviewDate` (sección 5).
- **`HttpOperation`** suma `'revisión'` → "el registro de la revisión".
- **`AuditAction`** y **`AuditEntry`**: sección 6.

## 4. Modelo de datos y migración

### 4.1 Qué cambia en `schema.prisma`

```prisma
model Document {
  // …sin cambios hasta reviewDate…
  reviewDate       DateTime  @map("review_date") @db.Date // obligatoria (R4, spec P3)
  // Última revisión (spec 005, R8, R10, R11): null si nunca se revisó. Se escriben siempre juntas.
  lastReviewedAt   DateTime? @map("last_reviewed_at") @db.Timestamptz(3)
  lastReviewedById String?   @map("last_reviewed_by_id") @db.Uuid // users de A, solo por ID
  // …
}
```

- **Dos columnas en `documents`, no una tabla de revisiones** (D13). La spec pide solo la **última** revisión (R11); el historial completo ya queda en la auditoría (R12). Una tabla aparte sumaría un join a cada listado para mostrar un dato.
- **Nulas, sin valor por defecto ni relleno:** los documentos que ya existen no se revisaron nunca (R11: "un documento que nunca se revisó no la muestra"). La carga tampoco cuenta como revisión: un documento nuevo nace con las dos en `null`.
- **`Timestamptz(3)`**, como `archivedAt` (M10 del plan 001): es un instante, no un día.
- **Sin clave foránea a `users`**, como `ownerId` y `createdById` (comentario de la cabecera: con tablas de otras parejas, solo por ID).
- **Sin índice nuevo:** "Por revisar" filtra y ordena por `review_date`, que ya tiene `documents_review_date_idx`, y las columnas nuevas solo se leen junto con el documento.
- **Sin `CHECK` de "las dos o ninguna":** Prisma no describe restricciones `CHECK` y habría que sumarla a la lista de cosas escritas a mano (2.3 del plan 003). Las escriben solo dos métodos del repositorio, y los dos ponen ambas (sección 8.2 lo prueba).

### 4.2 La migración `add_document_reviews`

El SQL esperado es solo esto:

```sql
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "last_reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_reviewed_by_id" UUID;
```

Agregar columnas nulas sin valor por defecto no reescribe la tabla en PostgreSQL: es instantáneo y no bloquea a nadie.

### 4.3 Cómo se crea sin borrar los índices de `chunks`

Es el mismo procedimiento de la sección 2.3 del plan 004. Como en T01 de la spec 003, **el agente cambia `schema.prisma` y escribe el test; los comandos de Prisma los corre el usuario**:

1. **Agente:** cambia `schema.prisma` (4.1) y escribe el test de integración que lo comprueba (la fila "Columnas" de 8.2: las dos columnas con valor juntas después de una revisión y las dos `null` en un documento recién cargado). **Usuario:** corre `pnpm --filter api exec prisma migrate dev --create-only --name add_document_reviews`. Como el esquema no describe los índices escritos a mano, el `migration.sql` generado **va a traer, además del `ALTER TABLE`**, `DROP INDEX "chunks_embedding_idx"`, `DROP INDEX "chunks_content_fts_idx"` y `DROP INDEX "chunks_content_fts_es_unaccent_idx"`.
2. **Usuario y agente, juntos:** revisan el `migration.sql`.
   - Se borra **todo `DROP INDEX`**.
   - Tiene que quedar **solo** el `ALTER TABLE` de 4.2.
   - Si aparece cualquier otra cosa (por ejemplo, un cambio en tablas de otra pareja porque su esquema y su migración no coinciden), **no se aplica**: se avisa a esa pareja y se resuelve antes.
3. **Usuario:** `pnpm --filter api exec prisma migrate deploy` para aplicarla y `pnpm --filter api exec prisma generate`. **No** `migrate dev`, que volvería a comparar y podría generar otra migración con los `DROP INDEX`.
4. **`indexes.e2e-spec.ts` no cambia** y tiene que seguir pasando: es el que detecta, después del `prisma migrate reset` del `global-setup`, si algún índice se perdió.
5. El comentario de `Chunk` en `schema.prisma` ya explica los pasos 1 a 3; no hace falta tocarlo.

## 5. La versión nueva también registra la revisión (R10)

**Cambio:** en `PrismaDocumentsRepository.addVersion`, el paso 4 (la actualización del documento) pasa de

```ts
data: { ...(reviewDate && { reviewDate }), updatedAt: now }
```

a

```ts
data: {
  ...(reviewDate && {
    reviewDate,
    lastReviewedAt: now,                     // R10: la versión nueva con fecha cuenta como revisión
    lastReviewedById: version.uploadedById,  // el ADMIN que la sube
  }),
  updatedAt: now,
}
```

con `const now = new Date()` una sola vez, para que `updatedAt` y `lastReviewedAt` coincidan.

- **Sin `reviewDate`, la última revisión no cambia** (R10): el `...(reviewDate && …)` no escribe nada.
- **Por qué en el repositorio y sin cambiar la firma** (D14):
  - `version.uploadedById` ya es el actor (lo pone `DocumentLifecycleService.addVersion`), así que el repositorio tiene todo lo que necesita;
  - la firma de `addVersion(tx, id, version, reviewDate?)` y las llamadas que verifican los tests unitarios del plan 003 (`toHaveBeenCalledWith(TX, id, {...}, fecha)`) quedan iguales;
  - la fecha y la última revisión se escriben en la misma sentencia, dentro de la transacción del plan 003 (sección 4): si la versión nueva falla (R9 de la spec 003), tampoco queda registrada la revisión.
- **El instante es `new Date()`**, como el `updatedAt` que el repositorio ya escribía, y no `clock.now()`: es cuándo pasó, no un cálculo de días. Los tests de integración comprueban que quede entre el antes y el después del pedido.
- **Qué tests de la spec 003 cambian:** ninguno.
  - Los unitarios usan el repositorio simulado.
  - Los de integración (`lifecycle.e2e-spec.ts`, `lifecycle.repository.e2e-spec.ts`) leen columnas que no cambian; las nuevas no aparecen en sus `expect`.
  - E12 y "sin fecha, no cambia" se prueban en la suite nueva (8.2).
- **La auditoría de la versión nueva** sigue como está (`DOCUMENT_VERSION_UPLOAD`). R12 pide la auditoría de "Marcar como revisado"; la versión nueva ya queda auditada con su propia acción (D15).

## 6. Auditoría (R12)

- **`AuditAction`** suma `'DOCUMENT_REVIEW'`.
- **`AuditEntry`** suma dos campos opcionales, solo fechas (nunca contenido, tokens ni credenciales):

  ```ts
  previousReviewDate?: string; // YYYY-MM-DD, la que tenía antes
  newReviewDate?: string;      // YYYY-MM-DD, la elegida
  ```

- **Éxito**, dentro de la transacción y después de escribir (como las acciones del plan 003):

  ```ts
  { action: 'DOCUMENT_REVIEW', actorId, documentId, result: 'SUCCESS',
    previousReviewDate: <la leída bajo el bloqueo>, newReviewDate: dto.reviewDate, at: clock.now() }
  ```

  La fecha anterior sale de la lectura **bajo el bloqueo** (3.2, paso 8), así que con dos revisiones simultáneas cada una registra la fecha que de verdad reemplazó.
- **Fallo:** `run` llama a `auditFailure` como siempre (`FAILURE`, el código HTTP en `detail`, fuera de la transacción, como mejor esfuerzo). `auditFailure` suma un último parámetro opcional, `extra?: Pick<AuditEntry, 'previousReviewDate' | 'newReviewDate'>`, y `markReviewed` le pasa `newReviewDate` cuando la fecha pasó el DTO (un 400 de formato no tiene una fecha que registrar). La anterior va solo si ya se había leído el documento. Las llamadas existentes no cambian.
- **`LoggerAuditLog`** escribe los dos campos nuevos **campo por campo**, solo si vienen (como `documentId` y `detail`). Lo que no esté en su lista sigue sin llegar al log.
- Cuando se resuelva A1 (la auditoría real de la pareja A), hereda la acción y los campos, como en D9 del plan 003.

## 7. Pantallas

### 7.1 Piezas

```
apps/web/
├── app/documentos/por-revisar/page.tsx    nuevo: servidor, título y <Suspense> con PendingReviewList
├── components/documents/
│   ├── ReviewStatusBadge.tsx              nuevo: "Vencido" / "Vence pronto" (F1)
│   ├── DocumentCard.tsx                   + la etiqueta junto al título
│   ├── DocumentDetail.tsx                 + la etiqueta, "Última revisión" y la sección "Revisión"
│   ├── MarkReviewedForm.tsx               nuevo: fecha + "Marcar como revisado" (F4)
│   ├── PendingReviewLink.tsx              nuevo: el acceso con la cantidad (F2)
│   ├── PendingReviewList.tsx              nuevo: la lista paginada (F3)
│   ├── ReviewDateField.tsx                + prop `label`
│   ├── Pagination.tsx                     + prop `basePath` (por defecto /documentos)
│   └── DocumentList.tsx                   + PendingReviewLink arriba
└── lib/
    ├── api/documents.ts                   + tipos, listPendingReview y markReviewed
    ├── api/error-messages.ts              + contexto 'review'
    └── documents/format.ts                + formatDay (el "23/10/2026" que hoy está dentro de DocumentDetail)
```

**La web no calcula el estado** (D16): muestra `review.status` tal como llega. Así no hay dos implementaciones de R1 que puedan diferir en el borde de la medianoche, ni tests de pantalla que dependan de la hora. Tampoco decide quién puede revisar: si llegó `review`, el usuario es ADMIN o responsable (R4).

### 7.2 Etiquetas (F1)

`ReviewStatusBadge({ status })`:

| `status` | Texto | Estilo |
| --- | --- | --- |
| `OVERDUE` | "Vencido" | rojo: `bg-red-100 text-red-900`, `dark:bg-red-950 dark:text-red-100` |
| `DUE_SOON` | "Vence pronto" | ámbar: `bg-amber-100 text-amber-900`, `dark:bg-amber-950 dark:text-amber-100` |
| `UP_TO_DATE`, `null` o sin `review` | nada | — |

- **Siempre con la palabra**, nunca solo el color (F1). Los pares de colores tienen contraste AA en claro y en oscuro, y la misma forma que "Archivado" (`rounded-full px-2 py-0.5 text-xs font-medium`).
- **En la tarjeta:** junto al título, en el mismo lugar que "Archivado" (`shrink-0`, así un título largo se recorta y la etiqueta no se pierde en el celular).
- **En el detalle:** junto al `<h1>`, como "Archivado".

### 7.3 Acceso a "Por revisar" (F2)

`PendingReviewLink`, en `DocumentList`, en la fila de arriba junto a "Cargar documento" (y también con una búsqueda activa):

- Pide `listPendingReview(1, 1)`: una sola tarjeta, para leer `total` e `isReviewer` sin traer la lista entera. La clave de `useApiResource` incluye al usuario.
- **Se muestra** si `isReviewer` es `true`: el ADMIN siempre; los demás, si son responsables de algún documento, aunque no tengan pendientes (E13).
- **El texto:** "Por revisar (3)", con `aria-label="Por revisar: 3 documentos"` (o "1 documento", o "ningún documento"). Enlace a `/documentos/por-revisar`, con la forma de botón secundario y 44 px de alto (F10 del plan 002).
- **Mientras carga** no se muestra nada (no hay "Por revisar (…)" que salte). **Si falla:** el ADMIN ve el enlace sin número; los demás no lo ven, porque no se sabe si son responsables. El listado no se ve afectado.
- **Para quien no es responsable** (E5), el enlace no aparece y la pantalla queda como hasta ahora.

### 7.4 Lista "Por revisar" (F3)

`/documentos/por-revisar` (`app/documentos/por-revisar/page.tsx`): un segmento fijo, que Next resuelve antes que `[id]`. Componente de servidor sin datos, con título "Por revisar", un enlace "Volver a Documentos" y `<Suspense>` con `PendingReviewList`, como `/documentos` (regla general del plan 002, sección 1).

`PendingReviewList` (cliente):

- Lee `?pagina=` con `parsePageParam` y pide `listPendingReview(page, PAGE_SIZE)`.
- **Las mismas tarjetas** (`DocumentCard`), con la etiqueta y la fecha de revisión que ya muestran ("Revisión"), en el orden de la API (vencidos primero; R5). La web no reordena.
- Los nombres de áreas y responsables se piden una vez por página, como en `DocumentListing`.
- **Estados:**

  | Estado | Qué se ve |
  | --- | --- |
  | Cargando | `ScreenState kind="loading"` con las tarjetas esqueleto |
  | Sin pendientes (E13) | `ScreenState kind="empty"` con "No tenés documentos para revisar" |
  | Con pendientes | La grilla del listado y `Pagination` con `basePath="/documentos/por-revisar"` si hay más de 20 |
  | Página que no existe | "Esta página no existe" con enlace a la primera página de "Por revisar" |
  | Error | `describeApiError(error, 'list')` con "Reintentar", como el listado |

- Quien abre la dirección sin ser responsable ve "No tenés documentos para revisar": la API le responde vacío (D9).

### 7.5 "Marcar como revisado" en el detalle (F4, R11)

- **"Última revisión"**, un `Field` más en la lista de datos, solo si `review?.lastReviewedAt`: "30/10/2026, por Ana Pérez" (`formatDay` en Buenos Aires y el nombre con `usersDirectory.getNames`, en el mismo pedido que el responsable: `getNames([ownerId, lastReviewedById])`). Si nunca se revisó, el campo no aparece (R11).
- **La sección "Revisión"**, debajo de los datos y antes del historial, solo si `doc.review` existe **y** `doc.status === 'ACTIVE'` (R6, R9). Siempre visible, no un panel que se abre: es la acción principal del responsable, que no tiene la fila de acciones del ADMIN (D17). Contiene `MarkReviewedForm`:
  - `ReviewDateField` en modo obligatorio, con `label="Próxima fecha de revisión"` y `min` en mañana en Buenos Aires (R7). Arranca vacío.
  - El botón "Marcar como revisado". Validación antes de enviar con la misma regla que la carga (`validateUpload` de la fecha): vacía → "Elegí la próxima fecha de revisión."; antes de mañana → el mensaje de `FIELD_MESSAGES.reviewDate`.
  - Mientras espera: el botón queda deshabilitado con "Guardando…" y no se puede enviar dos veces (F5 del plan 002).
  - **Al terminar:** `finish('Revisión registrada')`: el aviso con `role="status"` y el detalle se vuelve a pedir, con lo que la etiqueta desaparece (o queda "Vence pronto" si la fecha elegida cae dentro de 30 días, caso borde) y aparece "Última revisión".
  - **Errores (F5):** con `describeApiError(error, 'review')`, sin borrar la fecha elegida.

    | Respuesta | Mensaje |
    | --- | --- |
    | 400 con `reviewDate…` | Junto al campo: "La fecha de revisión tiene que ser a partir de mañana." |
    | 403 | "No tenés permiso para marcar este documento como revisado." |
    | 404 | "No se encontró el documento." |
    | 409 `ARCHIVED` | "El documento fue archivado. Ya no se puede modificar." |
    | 503 / sin conexión | Los mensajes de siempre, con la fecha intacta para volver a intentar |

- **SUPERVISOR y EMPLOYEE que no son responsables** (E5): no reciben `review`, así que no ven etiqueta, "Última revisión" ni la sección.
- El ADMIN con el panel de "Subir versión nueva" abierto sigue viendo la sección "Revisión": son acciones independientes.

### 7.6 Cambios en `lib/api`

- **Tipos:** `ReviewStatus`, `DocumentReview { status: ReviewStatus | null; lastReviewedAt: string | null; lastReviewedById: string | null }`, y `review?: DocumentReview` en `DocumentFields`. `PendingReviewResponse` = `DocumentListResponse` + `isReviewer: boolean`.
- **Funciones:**
  - `listPendingReview(page, limit, signal)` → `GET /api/documents/pending-review?page=…&limit=…`;
  - `markReviewed(id, reviewDate, signal)` → `POST /api/documents/:id/review` con `{ reviewDate }` en JSON.
- **`describeApiError`** suma el contexto `'review'`: el 400 va por `describeUploadBadRequest` (el campo `reviewDate`), el 403 tiene su mensaje y el 409 usa `describeConflict` (ya conoce `ARCHIVED`).

### 7.7 Celular (F6)

- Etiquetas con `shrink-0` junto a títulos que se recortan o hacen `break-words`.
- `MarkReviewedForm` en columna en el celular (campo y botón a todo el ancho) y en fila desde `sm:`.
- `PendingReviewLink` y "Cargar documento" se apilan con `flex-wrap`.
- Playwright lo comprueba en el proyecto `Pixel 7`, con `scrollWidth <= innerWidth` (como F7 del plan 004).

## 8. Estrategia de pruebas

El mismo criterio que los planes anteriores: reglas en tests unitarios, base real en integración, pantallas en tests de componentes y navegador real en Playwright. Cada escenario tiene al menos un test de API y uno de pantalla.

### 8.1 Tests unitarios (API, Jest)

| Qué se prueba | Casos |
| --- | --- |
| `todayInCompany` | `2026-11-10T02:30Z` → `2026-11-09` (23:30 en Buenos Aires); `2026-11-10T03:00Z` → `2026-11-10` (medianoche); con `APP_TIMEZONE=UTC` → `2026-11-10` |
| `addDays` | +30 dentro del mes y cruzando mes (`2026-11-09` → `2026-12-09`); cruce de año (`2026-12-31` + 1); febrero (`2027-02-28` + 1 → `2027-03-01`) |
| `reviewStatusOf` | **E2** ayer y hace 5 días → `OVERDUE`; **E4** hoy → `DUE_SOON`; **E1** +10 → `DUE_SOON`; +30 → `DUE_SOON`; +31 → `UP_TO_DATE`; **E3** +90 → `UP_TO_DATE`; archivado vencido → `null` (R2) |
| `canReview` y `reviewFor` | ADMIN → sí; responsable EMPLOYEE o SUPERVISOR → sí; otro EMPLOYEE (**E5**) → `undefined`; ADMIN responsable → un solo `review`; `lastReviewedAt` en ISO o `null` |
| `pendingReviewWhere` | ADMIN → sin áreas ni `ownerId`; otro → `listWhere` + `ownerId`; siempre `ACTIVE` y `lte` = hoy + 30 |
| Mapeos (`document.response`) | Sin `review` → la salida de hoy (los `toStrictEqual` existentes, sin cambios); con `review` → la clave con sus tres campos; `lastReviewedAt` y `lastReviewedById` del registro **no** aparecen fuera de `review` |
| `DocumentQueryService` | `findOne`, `list` y `search`: `review` para el ADMIN y el responsable, ausente para los demás, con el `today` del `FixedClock`. `pendingReview`: pasa el filtro y el límite de la política; **E6** devuelve en el orden del repositorio; `isReviewer` sin consulta extra si `total > 0`, con `count` si no; directorio caído → 503 y nunca se lista |
| `DocumentLifecycleService.markReviewed` | El orden de 3.2 con mocks: **E9** hoy → 400 sin leer la base; 404 inexistente; 404 ajeno (otra área); **E10** visible sin ser responsable → 403 sin abrir la transacción; **E11** archivado → 409; bajo el bloqueo: archivado → 409, responsable cambiado → 403; **E8** llama a `markReviewed` con la fecha, el actor y `clock.now()` y audita `SUCCESS` con la fecha anterior y la nueva; falla la base → 503 y `FAILURE` con `newReviewDate`; misma fecha que la actual → 200 (D12) |
| `MarkReviewedDto` | Sin `reviewDate`, `2026-11-31`, `09/11/2026`, `2026-11-09T00:00` → error; `2026-11-10` pasa |
| `LoggerAuditLog` | Escribe `previousReviewDate` y `newReviewDate` cuando vienen y no escribe campos que no estén en su lista |
| Lo que ya existe | `document-write-steps.spec.ts`, `document-upload.service.spec.ts`, `document-lifecycle.service.spec.ts` y `document-query.service.spec.ts` pasan **sin cambios** (el reloj tiene valor por defecto) |

### 8.2 Tests de integración (API, Supertest + PostgreSQL real)

En `test/documents/reviews.e2e-spec.ts`, con `createDocumentsTestApp({ clock: new FixedClock(new Date('2026-11-10T02:30:00.000Z')) })` (1.4). Cambios en los helpers, sin tocar a quienes ya los usan:

- `createDocumentsTestApp(options?: { clock?: Clock })`, y un `FixedClock` en `test/documents/helpers.ts` que extiende el `Clock` de `src/common/clock.ts` (no el de `src/executions`, D20);
- `seedDocument` suma `reviewDate?: string`, `ownerId?: string` y `lastReview?: { at: Date; byId: string }`. Sin ellos, todo igual que hoy (`2027-01-15`, responsable ADMIN, sin revisión).

Los responsables son usuarios de `FIXTURE_USERS` (por ejemplo, `empleadoVentas` como responsable de un documento de Ventas).

| Escenario | Preparación | Qué comprueba |
| --- | --- | --- |
| **E1** por vencer | Ventas, responsable `empleadoVentas`, `2026-11-19` | El responsable: listado y detalle con `review.status = "DUE_SOON"` |
| **E2** vencido | `2026-11-04` | El ADMIN: detalle con `OVERDUE` |
| **E3** al día | `2027-02-07` | El responsable: `UP_TO_DATE` |
| **E4** hoy | `2026-11-09` | `DUE_SOON`. Con el reloj en 23:30 de Argentina y 02:30 UTC: si se calculara en UTC, saldría `OVERDUE` |
| Bordes | `2026-12-09` y `2026-12-10` | `DUE_SOON` y `UP_TO_DATE`; el primero está en "Por revisar" y el segundo no |
| **E5** empleado sin avisos | Vencido de Ventas con otro responsable | `empleadoVentas`: el cuerpo del listado y del detalle **no tiene la clave `review`**; "Por revisar" → `data: []`, `isReviewer: false` |
| **E6** "Por revisar" | Vencido, por vencer y al día del mismo responsable | `data` = [vencido, por vencer], en ese orden; el al día no está; `total = 2`; `isReviewer: true` |
| **E7** ADMIN | Por vencer de tres responsables distintos, en Ventas y en Operaciones | El ADMIN los ve todos; un ADMIN que también es responsable de uno lo ve una sola vez |
| Varias áreas | Un responsable SUPERVISOR con documentos en dos áreas suyas | "Por revisar" los muestra juntos |
| Responsable sin acceso | Documento vencido de Operaciones sembrado con `empleadoVentas` como responsable (es el estado que deja perder el acceso; `seedDocument` no pasa por `canBeOwner`) | `empleadoVentas`: no está en su "Por revisar" y marcarlo → 404. El ADMIN lo ve con `OVERDUE` |
| R5 paginado | 25 pendientes | `page=2` → 5, `total = 25`; `limit=101` → 400; mismo orden en dos pedidos seguidos |
| **E8** marcar | Vencido con fragmentos (`seedProcessedVersion`) | 200; `reviewDate = 2027-05-09`, `review.status = "UP_TO_DATE"`, `lastReviewedById` = el responsable, `lastReviewedAt` = el instante del reloj; en la base: misma versión `CURRENT`, una sola versión, fragmentos con el mismo `is_active` y `area_ids`, `FakeProcessingQueue.enqueued` vacío y ningún objeto nuevo en `InMemoryFileStorage`; auditoría `DOCUMENT_REVIEW` con `2026-11-04` → `2027-05-09` |
| Fecha nueva dentro de 30 días | Vencido, marcado con `2026-11-20` | 200 y `DUE_SOON` (caso borde) |
| **E9** fecha inválida | Vencido | `2026-11-09` (hoy) → 400 y `review_date` sigue en `2026-11-04`; sin `reviewDate`, `2026-13-01` → 400; `2026-11-10` (mañana) → 200 |
| **E10** sin permiso | Ventas, responsable otra persona | `empleadoVentas` → 403 y nada cambió; `empleadoOperaciones` → 404 (no lo ve); sin sesión → 401 |
| **E11** archivado | Archivado (endpoint real) con fecha vencida | No está en "Por revisar" del ADMIN; marcar → 409 `ARCHIVED`; el responsable que no es ADMIN → 404 |
| **E12** versión nueva | Vencido; el ADMIN sube una versión con `reviewDate = 2027-11-09` (endpoint real de la spec 003) | `UP_TO_DATE`; `lastReviewedById` = ese ADMIN; `lastReviewedAt` entre el antes y el después del pedido |
| R10 sin fecha | Revisado antes (`lastReview` sembrado); versión nueva **sin** `reviewDate` | `last_reviewed_at` y `last_reviewed_by_id` no cambiaron |
| **E13** sin pendientes | Responsable con dos documentos al día | `data: []`, `total: 0`, `isReviewer: true` |
| Simultáneas | Dos `POST …/review` a la vez (`Promise.all`) con fechas distintas | Las dos 200; `review_date` es una de las dos; dos entradas `SUCCESS` en la auditoría, y la "anterior" de una es la "nueva" de la otra |
| Ruta | — | `GET /api/documents/pending-review` → 200, no el 400 del `ParseUUIDPipe` de `:id` |
| Columnas | Revisión hecha | En la base, las dos columnas tienen valor juntas; en un documento recién cargado, las dos `null` |

**Lo que ya existe:** `indexes.e2e-spec.ts` sigue pasando después de la migración (4.3), y las suites de las specs 001 a 004 pasan sin cambios, con `SystemClock`.

El 503 (R13) se prueba en los unitarios con el repositorio simulado, como en las demás consultas (D13 del plan 001).

### 8.3 Tests de componentes (web, Vitest)

| Qué se prueba | Escenarios y casos |
| --- | --- |
| `ReviewStatusBadge` | `OVERDUE` → "Vencido"; `DUE_SOON` → "Vence pronto"; `UP_TO_DATE` y `null` → nada (F1) |
| `DocumentCard` | **E1**, **E2** con su etiqueta; **E3** y sin `review` (**E5**) → sin etiqueta; con "Archivado" y sin estado |
| `DocumentDetail` | **E2** etiqueta; "Última revisión" con fecha y nombre (**E8**), ausente si nunca se revisó; **E5**: sin `review` no hay etiqueta, ni campo, ni "Marcar como revisado"; archivado con `review` → sin la sección; responsable que no es ADMIN → la sección sin la fila de acciones del ADMIN |
| `MarkReviewedForm` | `min` en mañana; vacía → error sin pedido; **E8**: manda `{ reviewDate }` y llama a `onDone`; **E9**: 400 → error junto al campo y la fecha sigue; **E10**: 403 con su mensaje; **E11**: 409 `ARCHIVED`; 503 sin perder la fecha (F5); un solo envío |
| `DocumentDetail` + `MarkReviewedForm` | Después de un 200: "Revisión registrada" con `role="status"` y un segundo pedido del detalle |
| `PendingReviewLink` | `isReviewer` + `total: 3` → "Por revisar (3)" con su `aria-label`; **E13** `total: 0` e `isReviewer` → "Por revisar (0)"; `isReviewer: false` → nada (**E5**); error → el ADMIN ve el enlace sin número y los demás nada |
| `PendingReviewList` | **E6**: las tarjetas en el orden de la API; **E13**: "No tenés documentos para revisar"; `?pagina=2` pide `page=2`; página que no existe; 503 con "Reintentar" |
| `Pagination` | Con `basePath`, enlaces a `/documentos/por-revisar?pagina=2`; sin él, los de siempre |
| `describeApiError` | Contexto `'review'`: 400 por campo, 403, 404, 409 `ARCHIVED`, 503 |
| `lib/api/documents` | `listPendingReview` y `markReviewed`: método, ruta y cuerpo |

### 8.4 Playwright

- **Con la API simulada**, en `e2e/avisos.spec.ts`, en escritorio y celular. `mock-api.ts` suma `/api/documents/pending-review`, `POST /api/documents/:id/review` y `review` en los documentos de prueba:
  - **E1**, **E2** y **E3**: etiquetas en el listado y en el detalle;
  - **E4**: un documento con `DUE_SOON` cuya fecha es hoy muestra "Vence pronto" (la pantalla solo refleja lo que decide la API);
  - **E5**: como EMPLOYEE, sin etiquetas, sin "Por revisar" y sin "Marcar como revisado";
  - **E6** y **E7**: el acceso con la cantidad lleva a la lista, en el orden recibido;
  - **E8**: elige la fecha, marca, ve "Revisión registrada" y "Última revisión", y la etiqueta desaparece;
  - **E9**, **E10** y **E11**: los mensajes de 400, 403 y 409, con la fecha intacta;
  - **E13**: "No tenés documentos para revisar";
  - F6: sin desplazamiento horizontal en el celular.
- **Contra la API real**, en `e2e/integracion/avisos.spec.ts`: el ADMIN carga un documento (`[e2e] …`, como T26 del plan 002) con fecha de revisión dentro de 10 días, lo ve con "Vence pronto" y en "Por revisar", lo marca como revisado con una fecha dentro de 6 meses y la etiqueta desaparece (**E1**, **E6**, **E8** de punta a punta). Un documento **vencido** no se puede crear desde la API (la fecha tiene que ser desde mañana), así que **E2** de punta a punta queda en la integración de la API (8.2). Diez días y seis meses están lejos de cualquier borde, así que la hora de la corrida no cambia el resultado.

### 8.5 Escenario → test

| Escenario | Unitario (API) | Integración (API) | Componente (web) | Playwright |
| --- | --- | --- | --- | --- |
| E1 · Por vencer | `reviewStatusOf` | ✔ | `DocumentCard` | simulada + real |
| E2 · Vencido | `reviewStatusOf` | ✔ | `DocumentDetail` | simulada |
| E3 · Al día | `reviewStatusOf` | ✔ | `DocumentCard` | simulada |
| E4 · Hoy | `reviewStatusOf`, `todayInCompany` | ✔ reloj en 23:30 de Argentina | — (lo decide la API) | simulada |
| E5 · Empleado sin avisos | `reviewFor`, `canReview` | ✔ sin la clave `review` | `DocumentDetail`, `PendingReviewLink` | simulada |
| E6 · "Por revisar" | `pendingReview` | ✔ orden y filtro | `PendingReviewList` | simulada + real |
| E7 · ADMIN ve todos | `pendingReviewWhere` | ✔ | — | simulada |
| E8 · Marcar | `markReviewed` | ✔ sin tocar versión, archivo ni fragmentos | `MarkReviewedForm`, `DocumentDetail` | simulada + real |
| E9 · Fecha inválida | `markReviewed`, DTO | ✔ 400 sin cambios | `MarkReviewedForm` | simulada |
| E10 · Sin permiso | `markReviewed` | ✔ 403 y 404 | `MarkReviewedForm` | simulada |
| E11 · Archivado | `markReviewed`, `reviewStatusOf` | ✔ 409 y fuera de la lista | `DocumentDetail` | simulada |
| E12 · Versión nueva | — (repositorio) | ✔ con el endpoint real | — (la pantalla es la del plan 003) | — |
| E13 · Sin pendientes | `pendingReview` (`isReviewer`) | ✔ | `PendingReviewList`, `PendingReviewLink` | simulada |

E12 no tiene test de pantalla propio: "Subir versión nueva" ya se prueba en el plan 003, y después el detalle muestra lo que manda la API, que cubren E8 y E3.

## 9. Dependencias nuevas

Ninguna:

- el cálculo de fechas usa `Intl.DateTimeFormat` y `Date.UTC`, como hoy;
- el reloj de documentos son dos clases propias en `src/common/clock.ts` (D20);
- la migración solo agrega dos columnas;
- todo lo demás reutiliza piezas de las specs 001 a 004.

## 10. Decisiones y preguntas abiertas

### 10.1 Decisiones

D1 a D18, propuestas al escribir el plan y aceptadas en su revisión, el 30/10/2026. D19 a D22 salen de las preguntas Q1 a Q4 de esa primera versión, cerradas en la misma revisión.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D1 · ¿Dónde se calcula el estado? | En la API, con una función pura, `reviewStatusOf(document, today)`, que compara fechas `YYYY-MM-DD` como texto. Sin columna de estado ni tarea programada (1.1) | R1, R2, R3 |
| D2 · ¿Cómo se controla "ahora" en los tests? | Con un puerto `Clock` propio de documentos, en `src/common/clock.ts` (D20), inyectado como último parámetro de los servicios, con `SystemClock` por defecto para no tocar los tests existentes. La integración lo reemplaza con `overrideProvider` (1.3, 1.4) | Sección 9 de la spec |
| D3 · ¿"Hoy" se calcula de nuevo para esta feature? | No: se saca de `DocumentWriteSteps` a `company-date.ts` (`todayInCompany`) y lo usan la carga, la versión nueva, "Marcar como revisado" y el estado. "Marcar como revisado" usa la misma `assertReviewDateIsAfterToday` (1.2) | R1, R7 |
| D4 · ¿Se puede usar `CURRENT_DATE` en la consulta de "Por revisar"? | No: la fecha límite se calcula en Node, en hora de Argentina, y viaja como parámetro. Una sola `today` por pedido para el filtro y las etiquetas | R1, R5 |
| D5 · ¿Qué instante usa el reloj de la integración? | `2026-11-10T02:30:00.000Z`: 23:30 del 9/11 en Argentina y ya 10/11 en UTC. Un cálculo en UTC hace fallar E4 y E9 | R1, R7 |
| D6 · ¿Cómo se evita mandar el estado a los demás? | `review` es opcional y **no se incluye** si el usuario no es ADMIN ni responsable: la respuesta queda idéntica a la de hoy. La regla es `canReview` en la política, y el mapeo sigue siendo campo por campo (2.1, 2.2) | R4, R11 |
| D7 · ¿La búsqueda (spec 004) también lleva la etiqueta? | Sí, con la misma regla: sus resultados usan `DocumentCard`, y que la etiqueta aparezca en el listado y no en la búsqueda sería confuso. Es un parámetro más en `toDocumentSearchResult` | F1 |
| D8 · ¿Cómo se ordena "Por revisar"? | Por `reviewDate` y `id` ascendentes: eso ya pone los vencidos primero y cada grupo de la más antigua a la más nueva, usa el índice existente y no necesita una columna calculada (3.1) | R5 |
| D9 · ¿"Por revisar" responde 403 a quien no es responsable? | No: responde vacío con `isReviewer: false`. La lista es "lo que el usuario puede revisar" | R5 |
| D10 · ¿"Marcar como revisado" como `POST /:id/review` o `PATCH /:id` con `reviewDate`? | `POST /:id/review` con `{ reviewDate }` y 200: es una acción con efectos (última revisión y auditoría) y no la edición libre de un campo (la spec 003, P5, deja fuera editar el documento) | R6 a R8 |
| D11 · ¿Dónde vive "Marcar como revisado"? | En `DocumentLifecycleService`, que ya tiene el bloqueo, el 409 de archivado y la auditoría de fallos. La visibilidad (`viewerFor` y la comprobación de `findVisible`) se saca a una función compartida para no duplicarla | R6, R9 |
| D12 · ¿Marcar como revisado con la misma fecha que ya tiene? | Se acepta (200) y se registra la revisión: confirmar que sigue vigente es justamente eso | R8 |
| D13 · ¿Dos columnas en `documents` o una tabla de revisiones? | Dos columnas nulas (`last_reviewed_at`, `last_reviewed_by_id`): la spec pide solo la última, y el historial está en la auditoría. Sin `CHECK`, sin clave foránea y sin índice nuevo (4.1) | R8, R11 |
| D14 · ¿Cómo registra la versión nueva la última revisión sin romper la spec 003? | En el repositorio, en la misma sentencia que ya cambia `reviewDate`, con `version.uploadedById` como revisor. La firma de `addVersion` no cambia y sus tests tampoco (sección 5) | R10 |
| D15 · ¿Se audita aparte la revisión que hace una versión nueva? | No: ya queda `DOCUMENT_VERSION_UPLOAD`. `DOCUMENT_REVIEW` es solo para "Marcar como revisado", con la fecha anterior y la nueva (sección 6) | R12 |
| D16 · ¿La web calcula el estado o la visibilidad? | No: muestra `review.status` y usa la presencia de `review` como permiso. Una sola implementación de R1 y R4, y tests de pantalla que no dependen de la hora | R1, R4 |
| D17 · ¿"Marcar como revisado" es un panel que se abre o una sección fija? | Sección fija en el detalle, para el ADMIN y el responsable, en documentos `ACTIVE`: es la acción principal del responsable, que no tiene la fila de acciones del ADMIN, y son dos controles | F4 |
| D18 · ¿Cómo sabe la web la cantidad para el acceso? | Con el mismo endpoint y `limit=1`: `total` es la cantidad e `isReviewer` dice si mostrar el acceso. Sin un endpoint de conteo aparte | F2 |
| D19 · F2 da el acceso a "quien sea responsable de algún documento" y E13 pide que un responsable sin pendientes vea "No tenés documentos para revisar": ¿`isReviewer` en la respuesta, o el acceso solo cuando hay pendientes? (era Q1) | `isReviewer` en la respuesta de "Por revisar" (3.1, 7.3): cumple F2 y E13 con una consulta extra solo cuando no hay pendientes. Con la alternativa, el responsable al día no tendría cómo llegar a la lista | F2, F3 |
| D20 · ¿Documentos reutiliza el `Clock` de `src/executions`? (era Q2) | No: ese archivo es de la pareja B y no se toca. Documentos crea su propio `Clock` y `SystemClock` en `src/common/clock.ts`, con la misma forma. Son tokens de inyección distintos, así que reemplazar uno en un test no cambia el otro (1.3) | Sección 9 de la spec |
| D21 · ¿Se suman al seed de desarrollo un documento vencido y uno por vencer? (era Q3) | No, queda fuera de esta spec: `prisma/seed.ts` no crea documentos. Un vencido solo se ve en los tests de integración, que lo siembran directo en la base (8.2) | — |
| D22 · ¿Se avisa a la pareja B que `review.status` ya está en las respuestas? (era Q4) | Sí, para que no calculen R1 por su cuenta mientras se acuerda el contrato de métricas (P8). El aviso a Mayra lo manda Matías. Cuando se acuerde, la cuenta (al día, por vencer, vencidos) sale de las mismas funciones, `todayInCompany` y `reviewStatusOf` | R1, P8 |

### 10.2 Preguntas abiertas

Ninguna. Q1 a Q4 de la primera versión del plan pasaron a D19 a D22.
