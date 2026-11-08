# Plan 013 · Métricas de procedimientos

- **Spec:** [spec.md](./spec.md) (HU38, parte de la pareja B)
- **Planes de referencia:** [plan 012](../012-ejecucion-procedimientos/plan.md) (ejecuciones, catálogo y áreas activas) y [plan 007](../007-metricas-documentos/plan.md) (la pareja C reutiliza `metricsScope`, `toMetricsPeriod` e `isCalendarDate`).
- **Responsable:** Mayra Limachi (pareja B)
- **Estado:** implementado. Escrito después del código, el 08/11/2026: describe lo que está en `develop`. Las decisiones están en la sección 7.

## 0. Punto de partida

- Las ejecuciones y sus pasos están en `executions` y `execution_steps` (spec 012), con índices en `user_id` y `procedure_id`.
- El catálogo de procedimientos es el puerto `ProceduresCatalog` con adaptador en memoria: da las versiones, sus pasos y las áreas actuales, pero no el título del procedimiento.
- `activeAreaIdsOf` ya da las áreas activas del usuario.

## 1. Estructura

En `apps/api/src/executions/metrics/`, dentro de `ExecutionsModule` (comparte el catálogo, los directorios y el `Clock`):

| Archivo | Qué hace |
| --- | --- |
| `procedure-metrics.controller.ts` | `GET /metrics/procedures`, con `@Roles('ADMIN', 'SUPERVISOR')` |
| `procedure-metrics.service.ts` | Valida el período, calcula el alcance, pide los agregados y arma la respuesta |
| `metrics-access.policy.ts` | `metricsScope`, `inScope`, `filterableAreaIds` (R2, R3) |
| `metrics-period.ts` | `isCalendarDate`, `toMetricsPeriod` (días de la empresa → instantes), `staleBefore`, `STALE_AFTER_HOURS` |
| `procedure-metrics.ts` | Funciones puras: conteos, tasas, promedios, pasos y orden (R7 a R10) |
| `visible-versions.ts` | Las versiones con ejecuciones cuyo procedimiento está hoy en el alcance |
| `execution-metrics.repository.ts` y `prisma-execution-metrics.repository.ts` | Puerto y consultas SQL agregadas |
| `dto/` | `ProcedureMetricsQueryDto` y la respuesta |

## 2. Orden de los controles

1. El DTO valida `areaId` (UUID), `from` y `to` (día que existe); propiedades de más: 400.
2. `from > to`: 400, sin leer nada.
3. Las áreas activas del usuario (`activeAreaIdsOf`). El ADMIN no depende de ellas.
4. `metricsScope`: `null` → 404 de área (R3).
5. El repositorio agrega las ejecuciones del período, por versión y por paso, con `staleBefore = now - 24 h` del `Clock`.
6. Se piden al catálogo las versiones encontradas; se dejan las que están en el alcance (R4) y se descarta con un log la que el catálogo no conoce (R9).
7. Las funciones puras arman los procedimientos, los totales y el orden.

Los pasos 3 a 7 van dentro de `try/catch` con `toHttpException(error, logger, 'metrics')`.

## 3. Consultas en la base

- **Por versión:** `started`, `completed`, `inProgress` (todavía incluye las abandonadas), la suma de duraciones de las completadas y el último inicio, agrupado por procedimiento y versión.
- **Por paso:** `reached`, `finished`, la suma de duraciones de los terminados y `abandoned` (la fila sin `finished_at` de una ejecución en curso cuyo `started_at` es anterior a `staleBefore`), agrupado por versión y paso.
- Cada ejecución en curso tiene una sola fila sin terminar, así que las abandonadas de una versión son la suma de sus pasos abandonados; las funciones puras las restan de `inProgress`.
- El período filtra `executions.started_at` con `>= from` y `< to`; sin límites, `TRUE`.
- La consulta por versión también trae la duración mínima y máxima de las completadas (`min` y `max` con `FILTER`).
- El resumen por área sale de las versiones de todo el alcance del usuario (sin `areaId`); las del alcance pedido se filtran de ellas, así que el catálogo se consulta una vez por versión.
- Las dos consultas corren en una transacción `RepeatableRead`: una ejecución que se completa entre una y otra no se cuenta distinta.
- Los conteos se castean a `int`; las duraciones salen en milisegundos (`extract(epoch …) * 1000`).
- La base caída (`P1001` y similares) → `ExecutionsRepositoryUnavailableError` → 503.

## 4. Web (`/metricas`)

- `app/metricas/page.tsx` con `MetricsAccess` (ADMIN y SUPERVISOR) y `MetricsPanel`.
- **Filtros** (`MetricsFiltersForm`, `AreaSelect`, `lib/metrics/filters.ts`): área con buscador, períodos rápidos (Hoy, Este mes, Últimos 3 meses), fechas a mano, "Limpiar filtros" y el pie "Mostrando…". Viven en la dirección (`?area=&desde=&hasta=`); sin fechas, el mes en curso en hora de Argentina.
- **Resumen** (`MetricsSummary`, `MetricTiles`, `FeatherBar`): empezadas, completadas, en curso, abandonadas, el tiempo medio (`totals.avgCompletionMs`) y la barra de distribución con su texto. Las cantidades del selector de área salen de `areaSummary`, también con un área elegida.
- **Tiempo por procedimiento** (`ProcedureTimeTable`): el tiempo medio de una ejecución completa, la más rápida y la más lenta, el más lento primero.
- **Detalle por área** (`AreaMetricsSection`, `ProcedureMetricsCard`, `StepMetricsTable`): una tarjeta por área con ejecuciones, cada procedimiento con su barra, sus pasos (alcanzaron, terminaron, abandonaron y tiempo), la fila "Procedimiento completo" con el tiempo de cada versión y las versiones anteriores plegadas.
- **Pareja C** (`TeamCMetrics`, puerto `lib/metrics/team-c-metrics.ts`): documentos desde `GET /api/metrics/documents` (spec 007); el asistente dice "Todavía no disponible." hasta que exista su endpoint.
- Estados de carga, vacío y error (400, 401, 403, 404 con "Ver todas mis áreas", 503 con reintento). Nunca se muestra el texto crudo de la API.
- El nombre del procedimiento sale de `metricsProcedureName` (nombres de ejemplo, o "Procedimiento" con un código corto del id).

## 5. Pruebas

- **Unitarios (Jest):** política de acceso, período (bordes de día en Argentina, días que no existen), funciones puras, servicio con falsos y `FixedClock`, controlador detrás del guard real, DTOs y SQL del repositorio.
- **Integración:** `test/executions/metrics.e2e-spec.ts`, con JWT reales y datos insertados por Prisma (relativos al reloj real para las 24 h, y fechas fijas para el período).
- **Web (Vitest):** filtros, formato, cálculos del resumen y de los pasos, y `MetricsPanel` con el reloj fijo en el 27/10/2026.

## 6. Contrato con la pareja C

- Documentos importa, sin modificarlas, `metricsScope`, `MetricsScope`, `toMetricsPeriod` e `isCalendarDate` desde un único archivo (`src/documents/metrics/metrics-rules.ts`), con tests de contrato. Un cambio en esas funciones se acuerda con Matías.
- La forma de `GET /api/metrics/documents` es R8 de la spec 007; la web la copia en `DocumentMetrics`.

## 7. Decisiones

| Decisión | Por qué |
| --- | --- |
| D1 · Endpoint en `ExecutionsModule` | Usa el mismo catálogo, los directorios y el `Clock` |
| D2 · Agregar en SQL, armar en funciones puras | La base devuelve pocas filas; las reglas se prueban sin base |
| D3 · Abandonada calculada, no guardada | No hace falta un proceso que cierre ejecuciones; el empleado puede retomarla |
| D4 · `RepeatableRead` | Las consultas por versión y por paso ven la misma foto |
| D5 · Áreas actuales del procedimiento | Coincide con el acceso de la spec 012 |
| D6 · Sin usuarios en la respuesta | Las métricas no sirven para controlar a una persona |
| D7 · Puerto de la pareja C en la web | El panel no inventa números mientras no hay endpoint |
| D8 · Guard local en la web | `RequireRole` acepta un solo rol y es compartido |
