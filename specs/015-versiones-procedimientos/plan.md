# Plan 015 · Versiones inmutables de procedimientos: publicar, historial, comparar y cambio crítico

- **Spec:** [spec.md](./spec.md) · **Tareas:** [tasks.md](./tasks.md)
- **Responsable:** Micaela Franco (pareja B)
- **Estado:** implementado (10/11/2026). La migración está aplicada; los e2e los corre Micaela. La estructura final de la API es la de `tasks.md` (un archivo por responsabilidad, el adaptador del catálogo en `adapters/`).

Este plan dice cómo se construye dentro del sistema que ya existe. Las reglas (R1 a R13), los escenarios (E1 a E23) y las decisiones de la spec (D1 a D17) no se repiten acá: se citan.

## 0. Punto de partida

Lo que ya existe y se usa tal cual (se leyó en `develop` y en esta rama; nada de otros se modifica):

- **Modelo (pareja B):** `Procedure`, `ProcedureVersion` (con `ProcedureVersionStatus`: `DRAFT`, `PUBLISHED`, `SUPERSEDED`), `Step`, `ProcedureArea`, con el índice único parcial `procedure_versions_one_draft_idx`.
- **Módulo `procedures`:** `ProceduresController` (`@Roles('ADMIN')` a nivel de clase), `ProcedureDraftService` (incluye `createDraft`, que ya cumple spec 006 R4 y R9), `ProcedureAreasService`, el puerto `ProceduresRepository` y su adaptador `PrismaProceduresRepository` (con `lockProcedure`, `lockVersion`, `translate` y `TRANSACTION_OPTIONS`), `http-errors.ts`, `procedure-access.policy.ts` (`canManage`, `currentVersion`, `canViewProcedure`: no se cambian, los usa `chat-context.ts`).
- **Auth:** `JwtAuthGuard`, `RolesGuard`, `@Roles()` y `@CurrentUser()` de `common/auth`; los tests de controlador corren detrás del guard real con el patrón de `test/executions/real-auth.ts`.
- **Directorios de otras parejas:** `UsersDirectory` (documentos) para el nombre de quien publicó, con su adaptador `PrismaUsersDirectory`.
- **Puerto de Mayra:** `executions/ports/procedures-catalog.ts` (`ProceduresCatalog`, `CatalogProcedureVersion`, `CatalogUnavailableError`); solo se importa.
- **Web:** `components/procedures/*` (HU09 y HU10, con `design.tsx` propio), `components/documents/design.tsx` y `list-design.tsx` (se importan, no se copian), `ScreenState`, `RequireRole`, `lib/api/procedures.ts` y `lib/procedures/*`.

## 1. API

Tres rutas nuevas y una que ya existe, todas bajo `/api/procedures/:id`, todas solo ADMIN (R1):

| Ruta | Qué hace | Regla |
| --- | --- | --- |
| `POST /versions/:versionId/publish` | Publica el borrador. Cuerpo opcional `{ isCritical?, changeSummary? }`. 200 con la versión | R2 a R5 |
| `GET /versions` | Historial paginado, de la más nueva a la más vieja | R8 |
| `GET /versions/compare?from&to` | Pasos agregados, quitados y modificados | R10 |
| `GET /versions/:versionId` | Detalle de una versión con sus pasos | R9 |
| `POST /versions` | Ya existe (spec 006, R4): borrador nuevo desde la vigente | R7 |

`compare` se declara antes que `:versionId` en el controlador para que la ruta no se confunda con un id (D7).

**Flujo de publicar** (R2 a R4), en una sola transacción con el procedimiento bloqueado (`SELECT … FOR UPDATE`), como `createDraft`:

1. Bloquear el procedimiento; si no existe, `NOT_FOUND`.
2. Leer la versión dentro del procedimiento; si no está, `NOT_FOUND` (mismo 404 que un procedimiento inexistente).
3. Si no es `DRAFT`: `NOT_A_DRAFT` (409 `VERSION_NOT_DRAFT`).
4. Si no tiene pasos: `NO_STEPS` (409). Si el procedimiento no tiene áreas: `NO_AREAS` (409).
5. Pasar la `PUBLISHED` actual (si hay) a `SUPERSEDED`, y la versión a `PUBLISHED` con `publishedAt`, `publishedById`, `isCritical` y `changeSummary`.

El índice único parcial `procedure_versions_one_published_idx` es la red de seguridad: si algo más escribiera una segunda `PUBLISHED`, la base la rechaza y el repositorio lo traduce al mismo 409.

**Comparar** (R10): el repositorio trae las dos versiones con sus pasos y la clave de cada paso; una función pura, `compareVersions`, arma `added`, `removed`, `modified` (con `changedFields`) y `unchanged`. La función no toca la base: se prueba con datos en memoria.

## 2. Modelo de datos (propuesta; se aplica en T02, con la revisión de Micaela)

Solo líneas nuevas en el bloque de la pareja B de `schema.prisma`:

- `ProcedureVersion`: `publishedAt DateTime? @map("published_at") @db.Timestamptz(3)`, `publishedById String? @map("published_by_id") @db.Uuid` (users de A, sin relación), `isCritical Boolean @default(false) @map("is_critical")`, `changeSummary String? @map("change_summary") @db.VarChar(300)`, y el índice único parcial `@@unique([procedureId], map: "procedure_versions_one_published_idx", where: { status: "PUBLISHED" })` (D5).
- `Step`: `stepKey String @default(dbgenerated("gen_random_uuid()")) @map("step_key") @db.Uuid` y `@@unique([procedureVersionId, stepKey])` (D11). El valor por defecto lo pone la base: así los pasos nuevos, los de los tests y los de datos de prueba que se insertan con SQL reciben su clave sin cambiar nada.
- **Los pasos existentes** quedan con `step_key = id`. Prisma genera `ADD COLUMN … NOT NULL` sin tener en cuenta las filas que ya hay, por eso la migración se edita a mano (se revisa junto con Micaela): agregar la columna con el default, completar las filas existentes con `UPDATE steps SET step_key = id` y dejar el índice único. Es la misma revisión del SQL que exige el equipo (borrar cualquier `DROP INDEX "chunks_..."`).
- **`createDraft` conserva la clave:** hoy copia `stepOrder`, `title` y `description` y deja que Prisma genere el id; ahora copia también `stepKey` (cambio de una línea en `prisma-procedures.repository.ts`, con su test primero, T03).
- No se agrega `PENDING_APPROVAL` (D10). No hay relaciones de Prisma con otras parejas.

## 3. Acceso

- Todas las rutas nuevas: `@Roles('ADMIN')` (a nivel de clase en el controlador nuevo) más `canManage(role)` en el servicio, como el resto del módulo. SUPERVISOR y EMPLOYEE: 403 antes de mirar si el recurso existe (R1, D16). Sin sesión: 401.
- El ADMIN no tiene restricción de área; no hay IDOR entre áreas en estas rutas. El 404 vale para "no existe" y para "la versión no es de ese procedimiento" (R3, R9, R10); el servicio usa un único `procedureNotFound()`, así que el mensaje es idéntico.
- Las áreas del usuario no se usan acá. `ProceduresCatalog` devuelve las áreas actuales del procedimiento (R12).

## 4. Errores

- Se reutiliza `toHttpException` de `http-errors.ts` y se suman operaciones: `publish`, `listVersions`, `getVersion` y `compareVersions`, con su frase en español (D9).
- 409 con `reason`: `VERSION_NOT_DRAFT`, `NO_STEPS` y `NO_AREAS` (D1); `VERSION_NOT_EDITABLE` ya existe.
- Base caída: `ProceduresRepositoryUnavailableError` → 503 sin cambios a medias (E20); cualquier otro error → 500 sin filtrar la causa.

## 5. Estructura de archivos

Todo lo de versiones va en archivos nuevos y cortos, para no agrandar los largos del módulo (`prisma-procedures.repository.ts`, `procedures.controller.ts`, `procedure-draft.service.ts`).

```
apps/api/src/procedures/
  procedure-versions.controller.ts   (+ .spec)   rutas de versiones, sin lógica
  procedure-versions.service.ts      (+ .spec)   publicar, historial, detalle, comparar
  version-compare.ts                 (+ .spec)   función pura de comparación
  versions.repository.ts                         puerto: VersionsRepository
  prisma-versions.repository.ts      (+ .spec)   adaptador Prisma (transacción de publicar)
  dto/publish-version.dto.ts         (+ .spec)   isCritical y changeSummary
  dto/list-versions.query.ts         (+ .spec)   page y limit del historial
  dto/compare-versions.query.ts      (+ .spec)   from y to (UUID)
  dto/version-history.response.ts    (+ .spec)   ítem del historial y detalle
  dto/compare.response.ts            (+ .spec)   resultado de comparar
  adapters/prisma-procedures-catalog.ts (+ .spec) adaptador del puerto de Mayra
  (cambios chicos) http-errors.ts, procedures.module.ts, prisma-procedures.repository.ts
apps/api/test/procedures/
  versions-indexes.e2e-spec.ts       índice de una sola PUBLISHED y step_key
  versions.repository.e2e-spec.ts    publicar, historial y comparar contra Postgres
  versions.e2e-spec.ts               flujos críticos con la aplicación completa
  catalog.e2e-spec.ts                el adaptador de Mayra contra Postgres
apps/web/
  lib/api/procedure-versions.ts      cliente de las rutas nuevas y sus tipos
  lib/procedures/versions.ts         funciones puras (tono del punto, orden, texto de la comparación)
  components/procedures/
    useVersions.ts, usePublishVersion.ts, useCompareVersions.ts   hooks (lógica)
    VersionTimeline.tsx, PublishVersion.tsx, VersionReadOnly.tsx,
    CompareVersions.tsx, CompareResult.tsx                        vista, cada uno ≤ 120 líneas
  tests/…                            un archivo de test por pieza
```

`ProcedureEditor` se limita a decidir qué mostrar según el estado de la versión: borrador (editor actual) o publicada/reemplazada (solo lectura).

`procedures.module.ts` suma el controlador, el servicio, `VersionsRepository` y `UsersDirectory`. No toca `app.module.ts`.

## 6. Decisiones del plan

| # | Decisión | Por qué |
| --- | --- | --- |
| PD1 | Un controlador, un servicio y un repositorio nuevos para versiones, con el mismo prefijo `procedures` que el controlador actual | Los tres existentes ya pasan de 250 líneas |
| PD2 | `lockProcedure` se exporta de `prisma-procedures.repository.ts` (se agrega la palabra `export`) para usarlo en el repositorio nuevo | Evita duplicar la consulta de bloqueo |
| PD3 | `step_key` con valor por defecto en la base (`gen_random_uuid()`) y copia explícita en `createDraft` | Los inserts con SQL de los tests y de los datos de prueba siguen funcionando |
| PD4 | `compareVersions` es una función pura sin dependencias | Casos borde (paso movido, sin cambios, vacío) sin base ni mocks |
| PD5 | El historial resuelve el nombre de quien publicó con `UsersDirectory.findById`, una vez por persona distinta | Una consulta por quien publicó, no por versión; sin nombre, `name: null` |
| PD6 | `changeSummary` se limpia (trim) y se valida en el DTO; "obligatorio si es crítico" con `@ValidateIf` | Es validación de formato: 400 antes de llegar al servicio |
| PD7 | El front lee el historial y el detalle desde la API; la copia de `sessionStorage` solo guarda el borrador que se edita, y se actualiza al crear una versión nueva (queda como en HU09) | No hay GET de procedimientos hasta HU11 |
| PD8 | El adaptador del catálogo lee con Prisma directo, sin pasar por los servicios, y devuelve `null` en vez de lanzar | Es lo que espera el puerto; la caída de la base se traduce a `CatalogUnavailableError` |

## 7. Contrato con ejecuciones (R12, D12, D17)

`PrismaProceduresCatalog` cumple lo que pide el puerto (comentarios de `procedures-catalog.ts`): `findPublished` devuelve la `PUBLISHED` más reciente **con al menos un paso**, `findVersion` devuelve cualquier versión (también `SUPERSEDED`), `areaIds` son las actuales del procedimiento y una versión sin pasos cuenta como sin publicar. Los pasos van ordenados con `id`, `order` y `title`.

- **Título:** Mayra agrega `title` a `CatalogProcedureVersion`. Si cuando se escribe el adaptador el puerto ya lo tiene, se llena con el título de la versión; si no, el adaptador funciona sin él y llenarlo queda como tarea pendiente (T14, con una nota en el estado de `tasks.md`).
- **Cableado:** el adaptador queda exportado; el cambio de una línea en `executions.module.ts` lo hace Mayra. No se toca `executions/`.

## 8. Riesgos y coordinación

| Riesgo | Qué hago |
| --- | --- |
| La migración agrega una columna `NOT NULL` a una tabla con datos | Se edita el SQL a mano (default y relleno) y se revisa con Micaela antes de aplicar (freno 2) |
| Dos ADMIN publican a la vez | Bloqueo del procedimiento + índice único parcial; test e2e con dos pedidos simultáneos |
| `schema.prisma` y `prisma/migrations` los comparte todo el equipo | "Avisar al equipo antes de mergear" en T02; la rama de Camila (HU29) también toca `schema.prisma` en otro bloque |
| `chat-context.ts` (Pareja C) importa `canViewProcedure` y `currentVersion` | No se cambian ni su firma ni sus reglas |
| `title` del catálogo depende de Mayra | El adaptador funciona sin él y se completa cuando el puerto lo tenga |
| Datos de prueba con pasos insertados con SQL | El valor por defecto de `step_key` en la base los cubre (PD3) |
| Pantalla sin GET de procedimientos hasta HU11 | PD7: historial y detalle por API; el borrador, de la copia de sesión |

## 9. Orden de implementación

1. Spec, plan y tareas (T01).
2. **Freno 2:** esquema y migración (T02); Micaela revisa el SQL y la aplica.
3. Parte 1 de la API, test primero, de abajo hacia arriba: `createDraft` conserva la clave (T03), errores y DTOs (T04), repositorio (T05), servicio (T06, T07), controlador (T08), e2e (T09).
4. Parte 1 del front (T10 a T13).
5. Adaptador del catálogo (T14), que cierra la Parte 1.
6. Parte 2: cambio crítico (T15), comparar (T16, T17), e2e (T18) y front (T19, T20).
7. Verificación y evidencia (T21).

## 10. Qué deja HU32 para otros

- **Mayra:** el adaptador real para su catálogo, listo para cambiar una línea; `title` a llenar cuando el puerto lo tenga; HU33 puede apoyarse en versiones publicadas.
- **HU28:** el enum y las transiciones de "pendiente de aprobación" se agregan encima de `DRAFT → PUBLISHED`.
- **HU11:** reutiliza `GET …/versions/:versionId` y el adaptador de lectura.
- **HU41:** los datos de demostración pueden publicar versiones con la misma operación.
