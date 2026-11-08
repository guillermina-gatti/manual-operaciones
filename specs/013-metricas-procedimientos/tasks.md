# Tareas 013 · Métricas de procedimientos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Mayra Limachi (pareja B)
- **Estado (08/11/2026):** T01 a T07 **hechas** y en `develop`. T08 a T10 quedan pendientes: dependen de otras parejas o de campos nuevos de la API. Esta lista se armó después del código, con los commits reales.

## Convenciones

- **Commits:** en inglés, en imperativo, con tipo y ámbito.
- **Tests:** unitarios con cada tarea; los e2e de la API los corre Mayra (`pnpm test:e2e test/executions --runInBand`, desde `apps/api`, con Docker).
- **Archivos de otros:** en `apps/web/lib/api/index.ts` solo se agregan líneas. No se toca `RequireRole` ni otros componentes compartidos.

## Backend

### T01 · Período y cálculos

- **Qué hace:** `metrics-period.ts` (días de Argentina → instantes, 24 h) y las funciones puras de `procedure-metrics.ts`.
- **Cubre:** R5 a R10.
- **Commit:** `92dc2d1 feat(api): add metrics period and calculation helpers`
- **Estado:** hecha.

### T02 · Política de acceso

- **Qué hace:** `metricsScope`, `inScope` y `filterableAreaIds`.
- **Cubre:** R1 a R3.
- **Commit:** `a0c7e0d feat(api): add metrics access policy`
- **Estado:** hecha.

### T03 · Repositorio

- **Qué hace:** las consultas agregadas por versión y por paso, en una transacción `RepeatableRead`.
- **Cubre:** R6 a R8; plan sección 3.
- **Commit:** `78e6b24 feat(api): add execution metrics repository`
- **Estado:** hecha.

### T04 · Servicio, endpoint e integración

- **Qué hace:** `ProcedureMetricsService`, `GET /api/metrics/procedures` con Swagger y los tests e2e.
- **Cubre:** todas las reglas; criterios de aceptación.
- **Commits:** `baf98fe`, `f0974fb`, `a868f08`, `56317b7`
- **Estado:** hecha.

### T05 · Login real y áreas activas

- **Qué hace:** el controlador se prueba detrás del guard real; las áreas inactivas no cuentan para el SUPERVISOR.
- **Cubre:** R2, R3; P6.
- **Commits:** `e5a9c07 test(api): run metrics controller spec behind the real guard`, `bd19b1c fix(executions): leave deactivated areas out of supervisor metrics`
- **Estado:** hecha.

## Web

### T06 · Cliente, puerto de la pareja C y panel

- **Qué hace:** cliente de métricas y sus mensajes de error, el puerto de la pareja C con adaptador vacío y el panel `/metricas`.
- **Commits:** `05e08de`, `35f5e0b`, `c8e0bd4`
- **Estado:** hecha.

### T07 · Rediseño, filtros y documentos

- **Qué hace:** áreas inactivas en el filtro, tarjeta de documentos conectada a la API (spec 007), diseño pispIAr, períodos rápidos y pie "Mostrando", selector de área con buscador, resumen con la barra de distribución, tiempo por procedimiento y detalle por área.
- **Commits:** `a14dc49`, `114b626`, `a8d129f`, `dced686`, `89be11c`, `5ee8f1d`, `254ef21`, `e8389c9`, `d8980e6`, `f15c5ce`, `81e57df`
- **Estado:** hecha.

## Pendiente

### T08 · Tarjeta del asistente

- **Qué hace:** conectar la tarjeta "Asistente" a `GET /api/metrics/assistant`, con la forma que tenga el código de la pareja C, y quitar el adaptador "no disponible".
- **Depende de:** que la pareja C publique el endpoint en `develop`. Al 08/11/2026 no existe.
- **Estado:** pendiente.

### T09 · Campos nuevos de la API

- **Qué hace:** sumar a la respuesta, sin cambiar los campos actuales, la duración mínima y máxima de las ejecuciones completadas, el tiempo medio exacto del total, el tiempo por versión y el resumen por área para el selector; en la web, las columnas "Más rápida" y "Más lenta", la fila "Procedimiento completo" con varias versiones y el tiempo medio del resumen.
- **Depende de:** —
- **Estado:** pendiente.

### T10 · Nombre real del procedimiento

- **Qué hace:** reemplazar `metricsProcedureName` y los procedimientos de ejemplo por el título que entregue el catálogo.
- **Depende de:** HU32 (catálogo real de Micaela) y de que el puerto entregue el título.
- **Estado:** pendiente.
