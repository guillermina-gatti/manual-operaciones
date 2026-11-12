# Plan 012 · Ejecución de procedimientos paso a paso

- **Spec:** [spec.md](./spec.md) (HU12)
- **Planes de referencia:** [plan 001](../001-carga-documentos/plan.md) (directorios de usuarios y áreas, errores con el formato de NestJS) y [plan 006](../006-procedimientos/plan.md) (procedimientos, versiones y el contrato con ejecuciones, sección 7).
- **Responsable:** Mayra Limachi (pareja B)
- **Estado:** implementado. Escrito después del código, el 08/11/2026: describe lo que está en `develop`. Las decisiones están en la sección 8.

## 0. Punto de partida

- **Directorios:** `UsersDirectory` y `AreasDirectory` de la pareja A, con adaptadores Prisma. Las áreas activas del usuario se leen con `activeAreaIdsOf` (`src/executions/viewer-areas.ts`), que también usan las métricas de documentos de la pareja C.
- **Sesión:** `JwtAuthGuard` y `RolesGuard` de la pareja A; el usuario llega como `AuthUser` con `@CurrentUser()`.
- **Procedimientos:** las tablas de Micaela (spec 006) existen, pero no hay adaptador de `ProceduresCatalog` ni endpoint para publicar (HU32). Ejecuciones usa un catálogo en memoria.
- **Base:** PostgreSQL con Prisma; `executions` y `execution_steps` van en el bloque de la pareja B de `schema.prisma`.

## 1. Estructura

Todo vive en `apps/api/src/executions/`:

| Archivo | Qué hace |
| --- | --- |
| `executions.controller.ts` | Las tres rutas, con `@Roles('EMPLOYEE')` en la clase |
| `execution.service.ts` | Los casos de uso: empezar, consultar y completar |
| `execution-access.policy.ts` | `canAccessProcedure` (comparte un área activa) e `isOwner` |
| `execution-progress.ts` | Funciones puras: paso actual, si se puede completar, paso siguiente, duración, si está completa |
| `viewer-areas.ts` | `activeAreaIdsOf`: las áreas activas del usuario, leídas en cada pedido |
| `executions.repository.ts` y `prisma-executions.repository.ts` | Puerto y adaptador de la base |
| `ports/procedures-catalog.ts` | Puerto `ProceduresCatalog` (`findPublished`, `findVersion`) |
| `adapters/in-memory-procedures-catalog.ts` y `procedure-fixtures.ts` | Catálogo en memoria con "Cierre de caja" (Ventas, versiones 1 y 2) y "Recepción de mercadería" (Operaciones) |
| `ports/clock.ts` | `Clock` y `SystemClock` |
| `http-errors.ts` | Errores de los casos de uso → HTTP (503, 500) |
| `dto/` | `StartExecutionDto` y `ExecutionResponse` |

## 2. Modelo de datos

```prisma
enum ExecutionStatus { IN_PROGRESS COMPLETED }

model Execution {
  id, userId, procedureId, procedureVersionId, status, startedAt, finishedAt
  @@unique([userId, procedureId], where: { status: "IN_PROGRESS" }) // R5
  @@index([userId]) @@index([procedureId])
}

model ExecutionStep {
  id, executionId, stepId, stepOrder, startedAt, finishedAt
  @@unique([executionId, stepId]) @@unique([executionId, stepOrder])
}
```

- Migración `20261026232335_add_executions`.
- `userId`, `procedureId`, `procedureVersionId` y `stepId` son solo ids, sin claves foráneas a tablas de otros equipos.
- La fila de un paso se crea cuando el paso empieza: un paso pendiente no tiene fila.
- Fechas `Timestamptz(3)`.

## 3. Casos de uso

### 3.1 Empezar (`POST /executions`)

1. Lee las áreas activas del usuario.
2. Pide al catálogo la versión publicada. Si no existe, no tiene pasos o no comparte un área con el usuario: 404 de procedimiento (R9).
3. Si hay una ejecución en curso del usuario para ese procedimiento, la devuelve con 200 (R5).
4. Si no, crea la ejecución y la fila del paso 1 en una transacción, y responde 201.
5. Si el insert choca con el índice único parcial (otro pedido la creó en el medio, `P2002`), vuelve a leer la que está en curso y responde 200.

### 3.2 Consultar (`GET /executions/:id`)

1. Busca la ejecución. Si no existe o no es del usuario: 404 de ejecución (R8).
2. Pide la versión con `findVersion` (también reemplazadas, R4) y vuelve a comprobar el área (R3).
3. Arma la respuesta con los pasos de la versión y las filas registradas; `currentStepId` es el primer paso no terminado.

### 3.3 Completar (`POST /executions/:id/steps/:stepId/complete`)

1. El acceso y la versión se resuelven primero, fuera de la transacción: las versiones son inmutables y así nunca se llama al catálogo con la fila bloqueada.
2. Dentro de una transacción, bloquea la fila de la ejecución y vuelve a leer el estado y los pasos.
3. Comprueba con `checkCompletable` (R6, R10): la ejecución no está completa, el paso es el actual y no está terminado.
4. Cierra el paso con el instante del `Clock`, y crea la fila del siguiente con ese mismo instante o marca la ejecución como `COMPLETED` (R7).

## 4. Errores

- Las reglas de negocio ya son `HttpException` (404, 409 con `reason`) y pasan tal cual.
- `ExecutionsRepositoryUnavailableError`, `CatalogUnavailableError` y `RepositoryUnavailableError` (el directorio de usuarios) → 503 con el texto de R12.
- Cualquier otro error → 500 "No se pudo completar {operación}.", con la causa solo en el log.

## 5. Web

| Ruta | Componentes | Qué muestra |
| --- | --- | --- |
| `/ejecuciones` | `ProcedurePicker` | Los procedimientos de ejemplo (`lib/executions/sample-procedures.ts`, con los mismos ids que el catálogo en memoria) y un botón para empezar o retomar |
| `/ejecuciones/[id]` | `ExecutionView`, `ExecutionProgress`, `StepList`, `CompletedPanel`, `ExecutionSummaryCard` | El progreso por segmentos, los pasos con sus tres estados, el resumen y el panel de completado |

- Las dos páginas van dentro de `RequireRole role="EMPLOYEE"`: otro rol ve "Solo los empleados pueden ejecutar procedimientos." y no se monta nada.
- Cliente: `lib/api/executions.ts` y los mensajes de `lib/api/execution-errors.ts`. La web nunca muestra el texto crudo de la API.
- Un id que no es UUID no se pide; un doble clic empieza o completa una sola vez; una respuesta que llega después de dejar la pantalla no navega.
- El nombre del procedimiento sale de los datos de ejemplo hasta que el catálogo lo entregue.
- Desde un paso se abre el asistente de la pareja C (spec 010), que recibe el paso actual.

## 6. Pruebas

- **Unitarios (Jest):** funciones puras de progreso y acceso, servicio con falsos de los puertos y `FixedClock` (CA1 a CA4), controlador detrás del guard real, DTOs, repositorio con Prisma simulado y el módulo.
- **Integración (Supertest + PostgreSQL):** `test/executions/executions.e2e-spec.ts` y `executions.repository.e2e-spec.ts`, con JWT reales, el catálogo en memoria del test y `cleanExecutions` (solo las tablas de esta feature).
- **Web (Vitest + Testing Library):** cliente, mensajes de error, utilidades y cada componente; `tests/app/ejecuciones-pages.test.tsx` para quién ve cada página.

## 7. Contrato con el catálogo (para HU32)

El adaptador real de `ProceduresCatalog` tiene que:

- devolver en `findPublished` la versión `PUBLISHED` más reciente con al menos un paso, o `null`;
- devolver en `findVersion` cualquier versión, también `SUPERSEDED`;
- informar en `areaIds` las áreas actuales del procedimiento, iguales en todas sus versiones;
- tirar `CatalogUnavailableError` si la base no responde.

Cuando exista, el cambio es una línea en `executions.module.ts` (`useClass`), y lo hace Mayra.

## 8. Decisiones

| Decisión | Por qué |
| --- | --- |
| D1 · Catálogo como puerto con adaptador en memoria | Las tablas de Micaela no existían; ejecuciones no depende de su modelo |
| D2 · Áreas en el procedimiento, no en la versión | Mover un procedimiento de área rige también para las ejecuciones en curso (R3) |
| D3 · Índice único parcial para R5 | Garantiza una sola ejecución en curso aun con pedidos simultáneos |
| D4 · Bloqueo de la fila al completar | Dos pedidos para el mismo paso no pueden cerrarlo dos veces |
| D5 · 404 igual para ajena, inexistente y sin área | No revela que la ejecución existe (CA4) |
| D6 · Solo EMPLOYEE | Acordado con la pareja A el 01/11/2026; ADMIN y SUPERVISOR ven métricas, no ejecutan |
| D7 · Solo áreas activas, leídas en cada pedido | Un área desactivada no da acceso, como en el guard de la pareja A |
| D8 · `Clock` inyectable | Los tests fijan los instantes de cada paso |
