# Tareas 012 · Ejecución de procedimientos paso a paso

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Mayra Limachi (pareja B)
- **Estado (08/11/2026):** T01 a T09 **hechas** y en `develop`. T10 queda pendiente: depende de HU32 (Micaela). Esta lista se armó después del código, con los commits reales.

## Convenciones

- **Commits:** en inglés, en imperativo, con tipo y ámbito (`feat(executions): …`, `feat(web): …`, `test(api): …`).
- **Tests:** unitarios con cada tarea; los e2e de la API los corre Mayra (`pnpm test:e2e test/executions --runInBand`, desde `apps/api`, con Docker).
- **Archivos de otros:** solo líneas nuevas en `schema.prisma` (bloque de la pareja B) y `app.module.ts`, avisadas antes. No se tocan `documents/`, `common/`, `seed.ts` ni contratos de otros equipos.

## Backend

### T01 · Modelo y migración

- **Qué hace:** `Execution`, `ExecutionStep` y `ExecutionStatus`, con el índice único parcial de una ejecución en curso por usuario y procedimiento.
- **Cubre:** R5, R6, R7; plan sección 2.
- **Commit:** `739f042 feat(executions): add executions model and migration`
- **Estado:** hecha.

### T02 · Puerto del catálogo y adaptador en memoria

- **Qué hace:** `ProceduresCatalog` (`findPublished`, `findVersion`, `CatalogUnavailableError`) y el catálogo en memoria con los procedimientos de ejemplo.
- **Cubre:** R3, R4, R9; D1.
- **Commit:** `e20d703 feat(executions): add procedures catalog port and in-memory adapter`
- **Estado:** hecha.

### T03 · Reglas puras de progreso y acceso

- **Qué hace:** `execution-progress.ts` (paso actual, completable, siguiente, duración, completa) y `execution-access.policy.ts`.
- **Cubre:** R2, R6, R8, R10; CA2, CA3, CA4.
- **Commit:** `63ad65e feat(executions): add progress and access pure functions`
- **Estado:** hecha.

### T04 · Servicio, DTOs y errores

- **Qué hace:** `ExecutionService` con los tres casos de uso y el puerto del repositorio; DTOs de entrada y respuesta; `toHttpException`. Las áreas pasan al nivel del procedimiento (D2).
- **Cubre:** R1 a R13; plan secciones 3 y 4.
- **Commits:** `7645c52 feat(executions): add executions service and repository port`, `6fbcd64 feat(executions): add DTOs and error mapping, move areas to procedure level`
- **Estado:** hecha.

### T05 · Repositorio Prisma

- **Qué hace:** crear con el paso 1 en una transacción, recuperar ante `P2002`, completar con `SELECT … FOR UPDATE`.
- **Cubre:** R5, R6, R7; D3, D4.
- **Commit:** `26394b4 feat(executions): add Prisma executions repository`
- **Estado:** hecha.

### T06 · Controlador, módulo e integración

- **Qué hace:** las tres rutas con Swagger y el módulo; tests e2e de los flujos y los errores.
- **Cubre:** todas las reglas; criterios de aceptación.
- **Commits:** `95145cf feat(executions): add executions controller and module`, `3adc613 test(executions): add e2e tests for executions`, `0a43647 test(executions): sort status codes numerically`
- **Estado:** hecha.

### T07 · Login real, solo EMPLOYEE y áreas activas

- **Qué hace:** los tests pasan a JWT reales y al guard de la pareja A; ADMIN y SUPERVISOR reciben 403; las áreas se leen activas en cada pedido.
- **Cubre:** R1, R2, R3; D6, D7.
- **Commits:** `aee14c9`, `ba397d8`, `e281fec`, `cc5098f`, `bfbb259` (login real en los tests), `b45969b`, `c6faebf`, `e5856e3` (solo EMPLOYEE), `fe46de4 feat(executions): read only the active areas of the viewer`, `eef9ba8 fix(executions): deny access through deactivated areas`
- **Estado:** hecha.

## Web

### T08 · Cliente y pantallas

- **Qué hace:** cliente de ejecuciones y sus mensajes de error, utilidades y procedimientos de ejemplo, `/ejecuciones` y `/ejecuciones/[id]`.
- **Cubre:** flujo principal; plan sección 5.
- **Commits:** `dff12a9`, `eda1d10`, `6c5644d`, `88ddc5d`
- **Estado:** hecha.

### T09 · Diseño pispIAr

- **Qué hace:** marco y encabezado, selector de procedimientos, progreso por segmentos, pasos con sus tres estados, tarjeta de resumen y panel de completado.
- **Commits:** `7dc8b1d`, `8549bef`, `1c7c96a`, `eeac94b`, `7f4e594`, `bac5283`
- **Estado:** hecha.

## Pendiente

### T10 · Catálogo real, nombre del procedimiento y descripción de los pasos

- **Qué hace:** cambiar `useClass` en `executions.module.ts` al adaptador de Micaela; mostrar en `/ejecuciones` sus procedimientos en lugar de los de ejemplo; mostrar el nombre real y la instrucción de cada paso.
- **Depende de:** HU32 (adaptador real de `ProceduresCatalog`) y de que el puerto entregue el título del procedimiento y la descripción de cada paso. Al 08/11/2026 no están en `develop`.
- **Estado:** pendiente.
