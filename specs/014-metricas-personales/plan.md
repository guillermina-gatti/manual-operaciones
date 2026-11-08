# Plan 014 · Métricas personales del empleado

- **Spec:** [spec.md](./spec.md)
- **Planes de referencia:** [plan 012](../012-ejecucion-procedimientos/plan.md) (ejecuciones y áreas activas) y [plan 013](../013-metricas-procedimientos/plan.md) (período, 24 h, consultas agregadas y panel).
- **Responsable:** Mayra Limachi (pareja B)
- **Estado:** implementado. Escrito después del código, el 08/11/2026. Las decisiones están en la sección 6.

## 0. Punto de partida

- Las consultas agregadas de la spec 013 (`executionAggregatesSql`, `stepAggregatesSql`) ya existen y filtran por período.
- `activeAreaIdsOf`, `toMetricsPeriod`, `staleBefore` y `visible-versions.ts` se reutilizan sin cambios de comportamiento.
- En la web, `/metricas` ya tiene los filtros en la dirección y los tiles del resumen.

## 1. API

En `apps/api/src/executions/metrics/`:

| Archivo | Qué hace |
| --- | --- |
| `my-metrics.controller.ts` | `GET /metrics/me`, con `@Roles('EMPLOYEE')` y el mismo DTO de filtros que la spec 013 |
| `my-metrics.service.ts` | Período, áreas activas, alcance, agregados del usuario y versiones visibles |
| `my-metrics.ts` | Funciones puras: alcance (`myAreaScope`), procedimientos, totales, paso más lento y lista para retomar |
| `prisma-execution-metrics.repository.ts` | `mine(userId, window)` |
| `dto/my-metrics.response.ts` | La respuesta, campo por campo |

### 1.1 Consultas

- Las dos consultas agregadas de la spec 013 reciben un `userId` opcional que agrega `e.user_id = $1` al `WHERE`.
- `inProgressSql(userId)`: las ejecuciones en curso del usuario con su paso actual (la única fila sin terminar), **sin período**, la movida más recientemente primero.
- Las tres corren en una transacción `RepeatableRead`: una ejecución que se completa en el medio no puede contarse en curso y faltar en la lista.
- `mine` rechaza un `userId` vacío antes de consultar (R11).

### 1.2 Orden de los controles

1. DTO: `areaId` UUID, `from` y `to` días que existen; `userId` u otra propiedad de más: 400.
2. `from > to`: 400.
3. Áreas activas del usuario; `myAreaScope` → `null` es 404, sin leer ejecuciones.
4. `mine` con `staleBefore` del `Clock`.
5. Una sola búsqueda de versiones para las del período y las de la lista para retomar; se dejan las del alcance.
6. Las funciones puras arman la respuesta.

## 2. Web (`/ejecuciones/mi-actividad`)

- `app/ejecuciones/mi-actividad/page.tsx`: "Mi actividad", link para volver a `/ejecuciones` y `RequireRole role="EMPLOYEE"` ("Solo los empleados pueden ver su actividad.").
- `MyActivityPanel`:
  - filtros de `/metricas` (`MetricsFiltersForm` con `path`), con el selector limitado a "Todas mis áreas" y sus áreas;
  - "Tu resumen" con `MetricTiles`: Empezadas, Completadas, En curso, "Sin avanzar hace más de 24 h" y Tu tiempo medio;
  - `ResumeList` ("Para retomar"): una tarjeta por ejecución con el paso actual, el último avance, el estado con punto y texto, y "Retomar →";
  - `RecentProceduresTable` ("Tus procedimientos recientes").
- Cliente `lib/api/my-metrics.ts` (nunca manda un usuario) y mensajes en `lib/api/metrics-errors.ts` (`describeMyMetricsError`).
- `/ejecuciones` suma el link "Ver mi actividad →", solo para empleados.
- Refactor previo, sin cambiar cómo se ve `/metricas`: `metricsHref` y `MetricsFiltersForm` reciben la ruta, y los tiles pasan a `MetricTiles`.

## 3. Pruebas

- **Unitarios de la API:** funciones puras (alcance, paso más lento, 24 h justas), servicio (usuario de la sesión, áreas del directorio, 404 sin leer, 400, 503, 500), controlador (401, 403, 400 con `userId`) y SQL del repositorio (siempre con `user_id`; id vacío rechazado).
- **Integración:** `test/executions/my-metrics.e2e-spec.ts`: dos empleadas mezcladas, `userId` en la consulta, área ajena e inactiva, procedimiento movido, período en días de Argentina, lista sin período y 24 h.
- **Web:** filtros reutilizados, resumen, "Para retomar", tabla, estados de carga, vacío y error (400, 401, 403, 404, 503), sesión, y que "abandonada" no aparezca ni en el texto ni en atributos accesibles.

## 4. Pendiente: comparación con los demás

Cuando se haga, va en el mismo endpoint como campos nuevos, con las reglas de privacidad de la spec (P6), una consulta aparte sobre ejecuciones completadas de otros usuarios en los últimos 90 días, y un umbral que devuelve `null` si no hay al menos 5 ejecuciones de al menos 3 personas.

## 5. Riesgos

- Mientras el catálogo sea en memoria, los nombres de los procedimientos son los de ejemplo.
- Los e2e de las 24 h usan el reloj real con márgenes de 1 h (23 h y 25 h): no dependen del día del mes, porque la API no tiene período por defecto.

## 6. Decisiones

| Decisión | Por qué |
| --- | --- |
| D1 · Un endpoint nuevo y no un parámetro en `/metrics/procedures` | El usuario sale de la sesión; nadie puede pedir los datos de otro |
| D2 · Reutilizar las consultas con un `userId` opcional | Las mismas reglas de conteo que la spec 013 |
| D3 · La lista para retomar sin período | Una ejecución vieja todavía se puede retomar |
| D4 · Página propia | `/metricas` es para ADMIN y SUPERVISOR |
| D5 · "Sin avanzar" en durazno | Rosa es "Se abandona" en `/metricas`; acá la ejecución sigue viva |
