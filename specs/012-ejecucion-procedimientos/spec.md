# Spec 012 · Ejecución de procedimientos paso a paso

- **Historia:** HU12 (ejecutar un procedimiento paso a paso).
- **Responsable:** Mayra Limachi (pareja B).
- **Depende de:** spec 006 (procedimientos, versiones y pasos de Micaela, que llegan por el puerto `ProceduresCatalog`), `docs/contracts/` (usuarios, áreas y matriz de permisos) y el login real de la pareja A (`JwtAuthGuard`).
- **Habilita:** spec 013 (métricas de procedimientos, HU38), spec 014 (métricas personales del empleado) y spec 010 de la pareja C (el asistente desde un paso).
- **Estado:** implementada y en `develop`. Esta spec se escribió después del código, el 08/11/2026, y refleja las decisiones tomadas durante el trabajo (sección 10).

## 1. Problema y objetivo

Un empleado necesita seguir un procedimiento de su área sin saltearse pasos, poder dejarlo y retomarlo donde quedó, y que quede registrado cuánto tardó en cada paso.

Esta feature agrega las ejecuciones: un empleado empieza un procedimiento publicado, completa sus pasos en orden y la ejecución termina cuando completa el último. Cada paso guarda cuándo empezó y cuándo terminó. Esos datos alimentan las métricas de las specs 013 y 014.

## 2. Actores

- **EMPLOYEE:** empieza, consulta y continúa sus propias ejecuciones, solo de procedimientos de sus áreas activas.
- **ADMIN y SUPERVISOR:** no ejecutan (403). Ven los datos agregados en las métricas (spec 013).
- **Catálogo de procedimientos (Micaela):** entrega la versión publicada y sus pasos por el puerto `ProceduresCatalog`.

## 3. Alcance

- `POST /api/executions`: empezar una ejecución, o devolver la que está en curso.
- `GET /api/executions/:id`: la ejecución con sus pasos y el paso actual.
- `POST /api/executions/:id/steps/:stepId/complete`: completar el paso actual.
- Las tablas `executions` y `execution_steps`.
- Las pantallas `/ejecuciones` (elegir un procedimiento) y `/ejecuciones/[id]` (la ejecución paso a paso).

## 4. Fuera de alcance

- El catálogo real de procedimientos: hoy es un adaptador en memoria con dos procedimientos de ejemplo. El adaptador real llega con HU32 de Micaela (spec 006, P17).
- La descripción de cada paso y el nombre del procedimiento: el puerto solo trae el título del paso. Se suman cuando el catálogo los entregue.
- Cancelar o reiniciar una ejecución, saltear pasos o volver atrás.
- Consultar ejecuciones de otros empleados (la matriz de permisos lo marca como pendiente de validación).
- Proponer cambios a un procedimiento desde la ejecución (HU33).

## 5. Flujo principal

1. El empleado entra a `/ejecuciones` y elige un procedimiento.
2. La web pide `POST /api/executions` con el `procedureId`. Si no tenía una ejecución en curso de ese procedimiento, la API crea una sobre la versión publicada, con el paso 1 empezado, y responde 201. Si ya la tenía, responde 200 con esa misma.
3. La web abre `/ejecuciones/[id]`, que pide `GET /api/executions/:id` y muestra el progreso, los pasos y el paso actual.
4. El empleado completa el paso actual. La web pide `POST /api/executions/:id/steps/:stepId/complete`. La API cierra ese paso y empieza el siguiente, o completa la ejecución si era el último.
5. Si el empleado se va y vuelve, la ejecución sigue en el paso donde quedó.

## 6. Reglas de negocio

- **R1 · Quién.** Solo EMPLOYEE. Sin sesión: 401. ADMIN o SUPERVISOR: 403 (acordado con la pareja A; matriz de permisos, "Procedimientos y ejecuciones").
- **R2 · Áreas activas.** Las áreas del empleado se leen de los directorios de usuarios y de áreas en cada pedido, nunca de la sesión (`activeAreaIdsOf`). Solo cuentan las áreas activas; un usuario inactivo no tiene ninguna. Un empleado puede ejecutar un procedimiento si comparte al menos un área activa con él.
- **R3 · Áreas actuales del procedimiento.** Las áreas de un procedimiento son las que tiene hoy, en todas sus versiones. Si el procedimiento deja de compartir un área con el empleado, o esa área se desactiva, el empleado recibe 404 también en una ejecución que ya estaba en curso.
- **R4 · Versión fija (CA1).** Una ejecución usa siempre la versión con la que empezó, aunque después se publique otra. El catálogo devuelve también versiones reemplazadas (`findVersion`).
- **R5 · Una en curso por procedimiento (CA3).** Un empleado tiene como máximo una ejecución `IN_PROGRESS` de cada procedimiento. Empezar otra vez devuelve la que está en curso (200), con el paso donde quedó. Dos pedidos simultáneos no crean dos.
- **R6 · Pasos en orden (CA2).** Solo se puede completar el paso actual: el primero, por orden, que no está terminado. Completar un paso guarda cuándo terminó y empieza el siguiente en ese mismo instante. La duración de un paso es `finishedAt - startedAt`, en milisegundos.
- **R7 · Fin.** Al completar el último paso, la ejecución pasa a `COMPLETED`, con `finishedAt` y sin paso actual (`currentStepId: null`).
- **R8 · Ejecuciones ajenas (CA4).** Solo quien empezó una ejecución puede verla o continuarla. Para cualquier otro usuario, una ejecución ajena, una que no existe, una cuya área perdió el empleado y un paso que no es de la versión reciben el mismo 404 "No se encontró la ejecución".
- **R9 · Procedimiento no disponible.** Un procedimiento que no existe, que no tiene versión publicada (o la tiene sin pasos) o que no es de las áreas del empleado: 404 "No se encontró el procedimiento".
- **R10 · Conflictos.** Completar un paso que no se puede completar responde 409 con un `reason`:
  - `EXECUTION_COMPLETED`: "La ejecución ya está completa".
  - `STEP_OUT_OF_ORDER`: "Ese paso no es el paso actual de la ejecución".
  - `STEP_ALREADY_FINISHED`: "Ese paso ya está terminado".
- **R11 · Validación.** `procedureId`, `id` y `stepId` tienen que ser UUID, y el cuerpo no acepta propiedades de más: si no, 400.
- **R12 · Errores.** Con el formato de NestJS. Si la base, el catálogo o los directorios no responden: 503 "No se pudo completar {operación}. Intentá de nuevo más tarde.", donde la operación es "el inicio de la ejecución", "la consulta de la ejecución" o "el registro del paso". Cualquier otro error: 500, con la causa solo en el log.
- **R13 · Respuesta.** La ejecución, armada campo por campo y sin `userId`: `id`, `procedureId`, `procedureVersionId`, `status`, `startedAt`, `finishedAt`, `currentStepId` y `steps` (cada paso con `stepId`, `order`, `title`, `startedAt`, `finishedAt` y `durationMs`; los pasos sin empezar tienen fechas `null`).

## 7. Estados

- `IN_PROGRESS` → `COMPLETED`, al completar el último paso. No hay otros estados ni vuelta atrás.
- Un paso de la ejecución está **pendiente** (sin fila), **en curso** (`startedAt` sin `finishedAt`) o **terminado**.
- Una ejecución en curso cuyo paso actual lleva más de 24 h sin terminar sigue siendo `IN_PROGRESS`: las specs 013 y 014 la cuentan como abandonada o "sin avanzar", pero el empleado la puede retomar.

## 8. Casos borde

- Un empleado de Ventas pide una ejecución de otra empleada de Ventas: 404, el mismo texto que una que no existe.
- Un empleado con una ejecución en curso pierde el área del procedimiento: 404 al abrirla y al completar un paso. Si recupera el área, la ejecución sigue donde estaba.
- Se publica una versión nueva mientras hay ejecuciones en curso: siguen con su versión; las nuevas usan la nueva.
- Dos clics seguidos en "Empezar": una sola ejecución (índice único parcial y 200 en el segundo).
- Dos pedidos para completar el mismo paso a la vez: uno responde 200 y el otro 409 `STEP_ALREADY_FINISHED` o `STEP_OUT_OF_ORDER` (la fila de la ejecución se bloquea en la transacción).
- Un `stepId` de otra versión: 404, como una ejecución ajena.
- Un id que no es un UUID en `/ejecuciones/[id]`: la web no lo pide y muestra "No se encontró la ejecución.".

## 9. Restricciones no funcionales

- Errores con el formato de NestJS y endpoints en Swagger (etiqueta `executions`).
- Las ejecuciones solo guardan ids de usuarios, procedimientos, versiones y pasos: no hay claves foráneas a tablas de otros equipos.
- El reloj es un puerto (`Clock`) para que los tests fijen cuándo empieza y termina cada paso.
- Pantallas con el diseño de `DESIGN.md`: el estado nunca se indica solo con color, el progreso se anuncia a los lectores de pantalla y el foco pasa al paso siguiente.
- No se modifican archivos de otras parejas; los cambios mínimos en archivos compartidos (`schema.prisma`, `app.module.ts`) se avisaron antes.

## 10. Decisiones

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Quién ejecuta? | Solo EMPLOYEE; ADMIN y SUPERVISOR reciben 403. Acordado con la pareja A el 01/11/2026 | R1 |
| P2 · ¿Qué áreas cuentan? | Solo las activas, leídas en cada pedido; un usuario inactivo no tiene ninguna (01/11/2026) | R2 |
| P3 · ¿Las áreas del procedimiento son las de la versión? | No: las actuales del procedimiento, iguales en todas sus versiones | R3 |
| P4 · ¿Qué pasa al publicar una versión nueva? | Las ejecuciones en curso siguen con la suya | R4 |
| P5 · ¿Empezar dos veces? | Devuelve la que está en curso, con 200 en vez de 201 | R5 |
| P6 · ¿Se puede saltear un paso? | No: solo el paso actual; los otros, 409 con `reason` | R6, R10 |
| P7 · ¿Qué ve otro usuario? | El mismo 404 que una ejecución que no existe, sin revelar que existe | R8 |
| P8 · ¿Y el catálogo de Micaela? | Un puerto con adaptador en memoria hasta HU32; el cambio de una línea en `executions.module.ts` lo hace Mayra | Sección 4 |

## 11. Criterios de aceptación

```gherkin
Escenario: CA1 · la ejecución sigue con su versión
  Dada una ejecución en curso de "Cierre de caja" en la versión 2
  Cuando se publica la versión 3
  Entonces GET /api/executions/:id sigue devolviendo los pasos de la versión 2

Escenario: CA2 · cada paso guarda su inicio y su fin
  Dada una ejecución con el paso 1 empezado a las 10:00
  Cuando el empleado lo completa a las 10:03
  Entonces el paso 1 tiene durationMs 180000
  Y el paso 2 empieza a las 10:03

Escenario: CA3 · retomar donde quedó
  Dada una ejecución en curso en el paso 2
  Cuando el empleado vuelve a pedir POST /api/executions con el mismo procedimiento
  Entonces la respuesta es 200 con la misma ejecución
  Y currentStepId es el del paso 2

Escenario: CA4 · una ejecución ajena es un 404
  Dada una ejecución de otra empleada de Ventas
  Cuando Elena pide GET /api/executions/:id
  Entonces la respuesta es 404 "No se encontró la ejecución"

Escenario: solo EMPLOYEE ejecuta
  Cuando un SUPERVISOR pide POST /api/executions
  Entonces la respuesta es 403

Escenario: un área inactiva no da acceso
  Dada una ejecución en curso de un procedimiento de Ventas
  Cuando se desactiva el área Ventas
  Entonces la empleada recibe 404 al abrirla

Escenario: un paso fuera de orden
  Dada una ejecución en el paso 2
  Cuando el empleado pide completar el paso 3
  Entonces la respuesta es 409 con reason STEP_OUT_OF_ORDER
```
